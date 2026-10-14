"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getPool } from "@/db/client";
import { can, EDIT_REFUSAL, REPO_ADMIN_REFUSAL } from "@/lib/access";
import { identify } from "@/lib/identity";
import { createUploadToken, regenerateUploadToken, revokeUploadToken, type TokenResult } from "@/lib/repo-upload-tokens";
import { errorClass } from "@/lib/scan-jobs";
import { deleteStoredRepo, type RemovalResult, removeStoredScan } from "@/lib/scan-removal";

export async function removeScan(repoId: string, scanId: string): Promise<RemovalResult> {
  const identity = await identify({ browser: true });
  if (identity?.kind !== "person") return { ok: false, error: "not_authenticated" };
  if (!can(identity, "manage-repos", { repoId })) return { ok: false, error: REPO_ADMIN_REFUSAL };
  let result: RemovalResult;
  try {
    result = await removeStoredScan(getPool(), identity, repoId, scanId);
  } catch (err) {
    console.error(`[repos] removing a scan failed: ${errorClass(err)}`);
    return { ok: false, error: "Couldn't remove the scan. Try again." };
  }
  if (result.ok) revalidatePath("/repos", "layout");
  return result;
}

export async function deleteRepo(repoId: string): Promise<RemovalResult> {
  const identity = await identify({ browser: true });
  if (identity?.kind !== "person") return { ok: false, error: "not_authenticated" };
  if (!can(identity, "manage-repos", { repoId })) return { ok: false, error: REPO_ADMIN_REFUSAL };
  try {
    await deleteStoredRepo(getPool(), identity, repoId);
  } catch (err) {
    console.error(`[repos] deleting a repo failed: ${errorClass(err)}`);
    return { ok: false, error: "Couldn't delete the repo. Try again." };
  }
  revalidatePath("/repos", "layout");
  redirect("/repos");
}

type Failure = { ok: false; error: string };

/** Runs `change`, and refreshes the repo pages when it succeeds. */
async function changeToken<T extends { ok: true }>(failure: string, change: () => Promise<T | Failure>): Promise<T | Failure> {
  let result: T | Failure;
  try {
    result = await change();
  } catch (err) {
    console.error(`[repos] changing a CI upload token failed: ${errorClass(err)}`);
    return { ok: false, error: failure };
  }
  if (result.ok) revalidatePath("/repos", "layout");
  return result;
}

export async function createToken(repoId: string): Promise<TokenResult> {
  const identity = await identify({ browser: true });
  if (identity?.kind !== "person") return { ok: false, error: "not_authenticated" };
  if (!can(identity, "upload", { repoId })) return { ok: false, error: EDIT_REFUSAL };
  return changeToken("Couldn't create the token. Try again.", () => createUploadToken(getPool(), identity.email, repoId));
}

export async function regenerateToken(repoId: string): Promise<TokenResult> {
  const identity = await identify({ browser: true });
  if (identity?.kind !== "person") return { ok: false, error: "not_authenticated" };
  if (!can(identity, "upload", { repoId })) return { ok: false, error: EDIT_REFUSAL };
  return changeToken("Couldn't regenerate the token. Try again.", () => regenerateUploadToken(getPool(), identity.email, repoId));
}

export async function revokeToken(repoId: string): Promise<RemovalResult> {
  const identity = await identify({ browser: true });
  if (identity?.kind !== "person") return { ok: false, error: "not_authenticated" };
  if (!can(identity, "upload", { repoId })) return { ok: false, error: EDIT_REFUSAL };
  return changeToken("Couldn't revoke the token. Try again.", async () => {
    await revokeUploadToken(getPool(), repoId);
    return { ok: true as const };
  });
}
