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

describe("config: hookScript field", () => {
  it("loads hookScript when present, unresolved (relative to the config's folder)", async () => {
    const p = await writeConfig({ include: ["src/**/*.ts"], hookScript: "./scout.hook.mjs" });
    const cfg = await loadConfig(p);
    expect(cfg.hookScript).toBe("./scout.hook.mjs");
  });

  it("leaves hookScript undefined when absent", async () => {
    const p = await writeConfig({ include: ["src/**/*.ts"] });
    const cfg = await loadConfig(p);
    expect(cfg.hookScript).toBeUndefined();
  });

  it("rejects a non-string hookScript", async () => {
    const p = await writeConfig({ include: ["src/**/*.ts"], hookScript: 42 });
    await expect(loadConfig(p)).rejects.toThrow(/hookScript/);
  });

  it("rejects an empty hookScript", async () => {
    const p = await writeConfig({ include: ["src/**/*.ts"], hookScript: "" });
    await expect(loadConfig(p)).rejects.toThrow(/hookScript/);
  });
});
