import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { DeleteRepoSection, UploadTokenSection } from "@/components/repos/repo-settings";
import { EmptyState } from "@/components/ui/empty-state";
import { getPool } from "@/db/client";
import { can } from "@/lib/access";
import { formatAbsoluteUtc } from "@/lib/format-absolute";
import { identify } from "@/lib/identity";
import { relativeTime } from "@/lib/relative-time";
import { repoSettings } from "@/lib/repo-upload-tokens";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ repoId: string }> }) {
  return { title: `Settings · ${decodeURIComponent((await params).repoId)}` };
}

export default async function RepoSettingsPage({ params }: { params: Promise<{ repoId: string }> }) {
  const repoId = decodeURIComponent((await params).repoId);
  const identity = await identify({ browser: true });
  if (!can(identity, "upload", { repoId })) {
    return <EmptyState titleAs="h1" title="Only Editors can see a repo's settings. Ask an Admin for access." />;
  }
  const settings = await repoSettings(getPool(), repoId);
  if (!settings) notFound();
  const { token } = settings;
  const created = token ? { when: relativeTime(token.createdAt), at: formatAbsoluteUtc(token.createdAt), by: token.createdByEmail } : null;
  return (
    <div className="flex max-w-160 flex-col gap-10">
      <div className="flex flex-col items-start gap-2">
        <Link href={`/repos/${encodeURIComponent(repoId)}`} className="inline-flex max-w-full items-start gap-1 rounded-sm text-xs text-muted-foreground hover:text-foreground">
          <ChevronLeft aria-hidden className="mt-0.5 size-3 shrink-0" />
          <span className="font-mono wrap-anywhere">{repoId}</span>
        </Link>
        <h1 className="text-2xl font-semibold tracking-headline">Settings</h1>
      </div>
      <UploadTokenSection repoId={repoId} created={created} />
      {can(identity, "manage-repos", { repoId }) ? <DeleteRepoSection repoId={repoId} scanCount={settings.scanCount} hasToken={created !== null} /> : null}
    </div>
  );
}
