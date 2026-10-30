import { describe, it, expect } from "vitest";
import { writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../../../src/config/loader.js";

async function writeConfig(body: object): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "cc-config-"));
  const path = join(dir, "scout.config.json");
  await writeFile(path, JSON.stringify(body), "utf8");
  return path;
}

describe("config: codeOwners field", () => {
  it("loads codeOwners: false", async () => {
    const p = await writeConfig({ include: ["src/**/*.ts"], codeOwners: false });
    const cfg = await loadConfig(p);
    expect(cfg.codeOwners).toBe(false);
  });

  it("loads codeOwners: true", async () => {
    const p = await writeConfig({ include: ["src/**/*.ts"], codeOwners: true });
    const cfg = await loadConfig(p);
    expect(cfg.codeOwners).toBe(true);
  });

  it("loads a string codeOwners, unresolved (relative to the config's folder)", async () => {
    const p = await writeConfig({ include: ["src/**/*.ts"], codeOwners: "./config/OWNERS" });
    const cfg = await loadConfig(p);
    expect(cfg.codeOwners).toBe("./config/OWNERS");
  });

  it("leaves codeOwners undefined when absent", async () => {
    const p = await writeConfig({ include: ["src/**/*.ts"] });
    const cfg = await loadConfig(p);
    expect(cfg.codeOwners).toBeUndefined();
  });

  it("rejects a non-empty-string, non-boolean codeOwners", async () => {
    const p = await writeConfig({ include: ["src/**/*.ts"], codeOwners: 42 });
    await expect(loadConfig(p)).rejects.toThrow(/codeOwners/);
  });

  it("rejects an empty-string codeOwners", async () => {
    const p = await writeConfig({ include: ["src/**/*.ts"], codeOwners: "" });
    await expect(loadConfig(p)).rejects.toThrow(/codeOwners/);
  });
});
