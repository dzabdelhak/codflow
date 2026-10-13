/**
 * The pending-port list (pending-pg-port.json) excludes test files from both
 * vitest and the typecheck until their ticket ports them. Keeps the two
 * exclusions identical and the list honest: every entry must still exist and
 * name its owning ticket.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "..");
const pending = JSON.parse(readFileSync(resolve(root, "pending-pg-port.json"), "utf8")) as Record<string, string>;
const tsconfig = JSON.parse(readFileSync(resolve(root, "tsconfig.json"), "utf8")) as { exclude: string[] };

describe("pending PostgreSQL port list", () => {
  it("excludes exactly the same files from the typecheck", () => {
    const excluded = tsconfig.exclude.filter((path) => path !== "node_modules").sort();
    expect(excluded).toEqual(Object.keys(pending).sort());
  });

  it("lists only files that exist", () => {
    const missing = Object.keys(pending).filter((path) => !existsSync(resolve(root, path)));
    expect(missing).toEqual([]);
  });

  it("names an owner for every file", () => {
    for (const owner of Object.values(pending)) expect(owner.trim()).not.toBe("");
  });
});
