// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { notFound, redirect } from "next/navigation";
import { afterEach, describe, expect, it, vi } from "vitest";
import RepoSettingsPage from "@/app/repos/[repoId]/settings/page";

const identity = vi.hoisted(() => ({
  kind: "person", userId: "u1", email: "ana@example.com", name: null, role: "admin" as "viewer" | "editor" | "admin", roleSource: "people",
}));
const repoSettings = vi.hoisted(() => vi.fn(async () => ({ scanCount: 5, token: null }) as { scanCount: number; token: null } | null));

vi.mock("@/lib/identity", () => ({ identify: async () => identity }));
vi.mock("@/db/client", () => ({ getPool: () => ({}) }));
vi.mock("@/lib/repo-upload-tokens", () => ({ repoSettings }));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
}));
vi.mock("@/app/repos/repo-actions", () => ({ createToken: vi.fn(), regenerateToken: vi.fn(), revokeToken: vi.fn(), deleteRepo: vi.fn() }));

const page = () => RepoSettingsPage({ params: Promise.resolve({ repoId: "payloadcms%2Fpayload" }) });

afterEach(() => {
  vi.clearAllMocks();
});

describe("RepoSettingsPage", () => {
  it("sends a Viewer to the repo page without reading the repo's settings", async () => {
    identity.role = "viewer";

    await expect(page()).rejects.toThrow("NEXT_REDIRECT /repos/payloadcms%2Fpayload");
    expect(redirect).toHaveBeenCalledExactlyOnceWith("/repos/payloadcms%2Fpayload");
    expect(repoSettings).not.toHaveBeenCalled();
  });

  it("shows an Editor the CI upload token but not Delete repo", async () => {
    identity.role = "editor";
    render(await page());

    expect(screen.getByRole("heading", { level: 2, name: "CI upload token" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Delete repo" })).toBeNull();
  });

  it("shows an Admin the CI upload token and Delete repo, under a link back to the repo", async () => {
    identity.role = "admin";
    render(await page());

    expect(screen.getByRole("heading", { level: 2, name: "CI upload token" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Delete repo" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "payloadcms/payload" })).toHaveAttribute("href", "/repos/payloadcms%2Fpayload");
    expect(repoSettings).toHaveBeenCalledExactlyOnceWith({}, "payloadcms/payload");
  });

  it("is not found when the dashboard doesn't have the repo", async () => {
    identity.role = "admin";
    repoSettings.mockResolvedValueOnce(null);

    await expect(page()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalledOnce();
  });
});
