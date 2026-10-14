import { randomBytes } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { hashToken } from "./cli-session-tokens.ts";
import type { Refusal } from "./scan-acceptance.ts";

const REPO_UPLOAD_TOKEN_PATTERN = /^scout_r_[A-Za-z0-9_-]{43}$/;

export type UploadTokenInfo = { createdAt: string; createdByEmail: string };
export type TokenResult = { ok: true; token: string } | { ok: false; error: string };

export const TOKEN_CHANGED = "The token has changed since the page loaded. Reload to see it.";

export function isRepoUploadToken(token: string): boolean {
  return REPO_UPLOAD_TOKEN_PATTERN.test(token);
}

function generateRepoUploadToken(): string {
  return `scout_r_${randomBytes(32).toString("base64url")}`;
}

/** The repo's scan count and its CI upload token's details, or null when the dashboard doesn't have the repo. */
export async function repoSettings(pool: Pool, repoId: string): Promise<{ scanCount: number; token: UploadTokenInfo | null } | null> {
  const { rows: [row] } = await pool.query<{ scan_count: number; created_at: Date | null; created_by_email: string | null }>(
    `SELECT (SELECT count(*)::int FROM scans WHERE scans.repo_id = repos.repo_id) AS scan_count, token.created_at, token.created_by_email
     FROM repos LEFT JOIN repo_upload_tokens AS token USING (repo_id) WHERE repos.repo_id = $1`, [repoId]);
  if (!row) return null;
  const token = row.created_at && row.created_by_email ? { createdAt: row.created_at.toISOString(), createdByEmail: row.created_by_email } : null;
  return { scanCount: row.scan_count, token };
}

/** Creates `repoId`'s CI upload token and returns it, the only time it can be read. Refuses when the repo has one or has gone. */
export async function createUploadToken(pool: Pool, actorEmail: string, repoId: string): Promise<TokenResult> {
  const token = generateRepoUploadToken();
  const { rowCount } = await pool.query(`INSERT INTO repo_upload_tokens (repo_id, token_hash, created_by_email)
    SELECT repo_id, $2, $3 FROM repos WHERE repo_id = $1 ON CONFLICT (repo_id) DO NOTHING`, [repoId, hashToken(token), actorEmail]);
  return rowCount ? { ok: true, token } : { ok: false, error: TOKEN_CHANGED };
}

/** Replaces `repoId`'s CI upload token and returns the new one; the old one stops working at once. Refuses when the repo has none. */
export async function regenerateUploadToken(pool: Pool, actorEmail: string, repoId: string): Promise<TokenResult> {
  const token = generateRepoUploadToken();
  const { rowCount } = await pool.query(`UPDATE repo_upload_tokens SET token_hash = $2, created_by_email = $3, created_at = now()
    WHERE repo_id = $1`, [repoId, hashToken(token), actorEmail]);
  return rowCount ? { ok: true, token } : { ok: false, error: TOKEN_CHANGED };
}

/** Deletes `repoId`'s CI upload token, if it has one. */
export async function revokeUploadToken(pool: Pool, repoId: string): Promise<void> {
  await pool.query("DELETE FROM repo_upload_tokens WHERE repo_id = $1", [repoId]);
}

/** The repo whose CI upload token `token` is, or null when it's no repo's. */
export async function uploadTokenRepo(pool: Pool, token: string): Promise<string | null> {
  const { rows: [row] } = await pool.query<{ repo_id: string }>("SELECT repo_id FROM repo_upload_tokens WHERE token_hash = $1", [hashToken(token)]);
  return row?.repo_id ?? null;
}

/**
 * Why the dashboard won't take a scan of `repoId` uploaded with `tokenRepoId`'s CI upload token, or null when it will. A token
 * uploads only scans of its own repo, and only while that repo is on the dashboard; inside a transaction, the repo stays until it ends.
 */
export async function uploadTokenRefusal(db: Pool | PoolClient, upload: { tokenRepoId: string; repoId: string }): Promise<Refusal | null> {
  const { tokenRepoId, repoId } = upload;
  if (repoId !== tokenRepoId) {
    return {
      code: "token_for_another_repo",
      message: `Couldn't upload the scan: SCOUTUI_TOKEN is the CI upload token for ${tokenRepoId}, not ${repoId}. Use ${repoId}'s own token, from its Settings page on the dashboard.`,
    };
  }
  const { rowCount } = await db.query("SELECT 1 FROM repos WHERE repo_id = $1 FOR SHARE", [repoId]);
  if (rowCount) return null;
  return {
    code: "repo_not_on_dashboard",
    message: `Couldn't upload the scan: ${repoId} was deleted from the dashboard, and its CI upload token with it. Upload a scan of it signed in as an Editor, then create a new token on its Settings page.`,
  };
}
