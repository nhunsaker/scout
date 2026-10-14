"use client";
import Link from "next/link";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuLinkItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

/** The repo header's "⋯" menu for Editors and Admins. */
export function RepoActionsMenu({ repoId }: { repoId: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Repo actions" className="text-muted-foreground" />}>
        <MoreHorizontal aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40 text-xs">
        <DropdownMenuLinkItem closeOnClick render={<Link href={`/repos/${encodeURIComponent(repoId)}/settings`} />} className="text-xs">
          Settings
        </DropdownMenuLinkItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
