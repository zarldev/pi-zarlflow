import { readFileSync, existsSync } from "node:fs";
import { globSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const root = path.resolve(import.meta.dirname, "..");
const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));

test("package is discoverable by the Pi package gallery", () => {
  assert.equal(pkg.name, "@zarldev/pi-zarlflow");
  assert.ok(pkg.keywords.includes("pi-package"));
  assert.equal(pkg.private, undefined);
});

test("pi manifest references existing resources", () => {
  assert.ok(Array.isArray(pkg.pi.extensions));
  assert.ok(pkg.pi.extensions.length > 0);
  for (const entry of pkg.pi.extensions) {
    const resource = path.join(root, entry);
    assert.ok(existsSync(resource), `${entry} should exist`);
    assert.ok(existsSync(path.join(resource, "index.ts")), `${entry} should expose index.ts`);
  }

  const promptMatches = pkg.pi.prompts.flatMap((pattern) => globSync(pattern.replace(/^\.\//, ""), { cwd: root }));
  assert.ok(promptMatches.length >= 5, "expected bundled prompt templates");
});

test("host-provided Pi packages stay as peers", () => {
  const hostPackages = [
    "@earendil-works/pi-ai",
    "@earendil-works/pi-agent-core",
    "@earendil-works/pi-coding-agent",
    "@earendil-works/pi-tui",
    "typebox",
  ];
  for (const name of hostPackages) {
    assert.ok(pkg.peerDependencies[name], `${name} should be a peerDependency`);
    assert.equal(pkg.dependencies?.[name], undefined, `${name} must not be a runtime dependency`);
  }
});
