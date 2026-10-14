"use client";
import { type RefObject, useEffect, useId, useRef, useState, useTransition } from "react";
import { Check, Copy } from "lucide-react";
import { createToken, regenerateToken, revokeToken } from "@/app/repos/repo-actions";
import { Button } from "@/components/ui/button";
import { actionErrorMessage } from "@/lib/action-error";
import type { TokenResult } from "@/lib/repo-upload-tokens";
import { DeleteRepoDialog } from "./delete-repo-dialog";

/** When the repo's CI upload token was created, relative (`when`) and absolute (`at`), and by whom, or null when no one is recorded. */
export type TokenCreated = { when: string; at: string; by: string | null };

const ROW = "flex flex-wrap items-center justify-between gap-x-6 gap-y-3";
const ROW_TEXT = "min-w-0 flex-[1_1_15rem] text-sm";
const ACTIONS = "flex flex-wrap items-center gap-2";
const SECTION = "flex flex-col gap-3";
const COPY_FAILED = "Couldn't copy the token. Select it and copy it instead.";

/**
 * The repo Settings page's CI upload token section. Regenerate and Revoke ask in the token's row first. A new token
 * shows once, with Copy, until Done.
 */
export function UploadTokenSection({ repoId, created }: { repoId: string; created: TokenCreated | null }) {
  const [asking, setAsking] = useState<"regenerate" | "revoke" | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const createRef = useRef<HTMLButtonElement>(null);
  const copyRef = useRef<HTMLButtonElement>(null);
  const regenerateRef = useRef<HTMLButtonElement>(null);
  const revokeRef = useRef<HTMLButtonElement>(null);
  const focusNext = useRef<RefObject<HTMLButtonElement | null> | null>(null);
  const promptId = useId();

  useEffect(() => {
    const target = focusNext.current?.current;
    if (!target) return;
    target.focus();
    focusNext.current = null;
  });

  const showToken = (result: TokenResult, failure: string) => {
    if (!result.ok) {
      setError(actionErrorMessage(result.error, "change the token", failure));
      return;
    }
    focusNext.current = copyRef;
    setAsking(null);
    setCopied(false);
    setToken(result.token);
  };

  const create = () => {
    setError(null);
    startTransition(async () => showToken(await createToken(repoId), "Couldn't create the token. Try again."));
  };

  const regenerate = () => {
    setError(null);
    startTransition(async () => showToken(await regenerateToken(repoId), "Couldn't regenerate the token. Try again."));
  };

  const revoke = () => {
    setError(null);
    startTransition(async () => {
      const result = await revokeToken(repoId);
      if (!result.ok) {
        setError(actionErrorMessage(result.error, "change the token", "Couldn't revoke the token. Try again."));
        return;
      }
      focusNext.current = createRef;
      setAsking(null);
    });
  };

  const ask = (question: "regenerate" | "revoke") => {
    setError(null);
    focusNext.current = question === "regenerate" ? regenerateRef : revokeRef;
    setAsking(question);
  };

  const cancel = () => {
    setError(null);
    focusNext.current = asking === "revoke" ? revokeRef : regenerateRef;
    setAsking(null);
  };

  const copy = async (value: string) => {
    setError(null);
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      setCopied(false);
      setError(COPY_FAILED);
    }
  };

  const done = () => {
    setError(null);
    focusNext.current = regenerateRef;
    setToken(null);
  };

  return (
    <section aria-labelledby="upload-token-title" className={SECTION}>
      <h2 id="upload-token-title" className="text-base font-medium">CI upload token</h2>
      {token !== null ? (
        <>
          <div className="flex items-start gap-2">
            <code className="min-h-8 min-w-0 flex-1 rounded-lg border border-control px-2.5 py-1.5 font-mono text-xs leading-5 break-all select-all">
              {token}
            </code>
            <Button ref={copyRef} onClick={() => void copy(token)}>
              {copied ? <Check aria-hidden data-icon="inline-start" /> : <Copy aria-hidden data-icon="inline-start" />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Save it as <code className="font-mono text-xs text-foreground">SCOUTUI_TOKEN</code> in this repo's CI. You won't see it again.
          </p>
          <div className={ACTIONS}>
            <Button variant="outline" onClick={done}>Done</Button>
          </div>
        </>
      ) : created === null ? (
        <div className={ROW}>
          <p className={`${ROW_TEXT} text-muted-foreground`}>No token</p>
          <div className={ACTIONS}>
            <Button ref={createRef} disabled={pending} onClick={create}>Create token</Button>
          </div>
        </div>
      ) : (
        <div className={ROW}>
          <p id={promptId} className={ROW_TEXT}>
            {asking === "regenerate" ? "Regenerate the token? The current one stops working at once."
              : asking === "revoke" ? "Revoke the token? CI can't upload scans of this repo until someone creates a new one."
              : <>Created <span title={created.at}>{created.when}</span>{created.by === null ? null : <> by <span className="wrap-anywhere">{created.by}</span></>}</>}
          </p>
          <div className={ACTIONS}>
            {asking !== "revoke" ? (
              <Button
                ref={regenerateRef}
                variant={asking === "regenerate" ? "default" : "outline"}
                disabled={pending}
                aria-describedby={asking === "regenerate" ? promptId : undefined}
                onClick={asking === "regenerate" ? regenerate : () => ask("regenerate")}
              >
                Regenerate
              </Button>
            ) : null}
            {asking !== "regenerate" ? (
              <Button
                ref={revokeRef}
                variant={asking === "revoke" ? "destructive" : "ghost"}
                disabled={pending}
                aria-describedby={asking === "revoke" ? promptId : undefined}
                onClick={asking === "revoke" ? revoke : () => ask("revoke")}
                className={asking === "revoke" ? undefined : "text-muted-foreground hover:text-destructive"}
              >
                Revoke
              </Button>
            ) : null}
            {asking !== null ? <Button variant="ghost" disabled={pending} onClick={cancel}>Cancel</Button> : null}
          </div>
        </div>
      )}
      {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
    </section>
  );
}

/** The repo Settings page's Delete repo section, for Admins. Delete repo… asks for the repo's name first. */
export function DeleteRepoSection({ repoId, scanCount, hasToken }: { repoId: string; scanCount: number; hasToken: boolean }) {
  const [deleting, setDeleting] = useState(false);
  const scans = `${scanCount.toLocaleString()} ${scanCount === 1 ? "scan" : "scans"}`;
  return (
    <section aria-labelledby="delete-repo-title" className={`${SECTION} mt-4 border-t pt-8`}>
      <h2 id="delete-repo-title" className="text-base font-medium">Delete repo</h2>
      <div className={ROW}>
        <p className={`${ROW_TEXT} text-muted-foreground`}>
          {hasToken ? `Deletes the repo, its ${scans} and its CI upload token.` : `Deletes the repo and its ${scans}.`}
        </p>
        <div className={ACTIONS}>
          <Button variant="destructive" onClick={() => setDeleting(true)}>Delete repo…</Button>
        </div>
      </div>
      <DeleteRepoDialog repoId={repoId} scanCount={scanCount} open={deleting} onOpenChange={setDeleting} />
    </section>
  );
}
