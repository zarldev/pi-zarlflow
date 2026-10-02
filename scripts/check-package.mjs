import { existsSync, readFileSync, statSync } from "node:fs";
import { globSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const errors = [];

function fail(message) {
  errors.push(message);
}

function checkPath(resourcePath) {
  const normalized = resourcePath.replace(/^\.\//, "");
  if (normalized.includes("..")) fail(`resource path must not escape package: ${resourcePath}`);
  if (resourcePath.includes("*")) {
    const dir = path.dirname(normalized);
    const suffix = normalized.split("*").at(-1) ?? "";
    let matches = [];
    try {
      matches = globSync(normalized, { cwd: root });
    } catch {
      // globSync is available in supported Node versions. Fall through to the
      // directory/suffix check if a platform does not support this pattern.
    }
    if (matches.length === 0) {
      const absDir = path.join(root, dir);
      if (!existsSync(absDir)) fail(`glob directory missing: ${resourcePath}`);
      else {
        const hasMatch = globSync(`${dir}/**/*${suffix}`, { cwd: root }).length > 0;
        if (!hasMatch) fail(`glob has no matches: ${resourcePath}`);
      }
    }
    return;
  }
  const abs = path.join(root, normalized);
  if (!existsSync(abs)) fail(`resource path missing: ${resourcePath}`);
  else if (statSync(abs).isDirectory()) {
    const indexTs = path.join(abs, "index.ts");
    const indexJs = path.join(abs, "index.js");
    if (!existsSync(indexTs) && !existsSync(indexJs)) fail(`extension directory lacks index.ts/js: ${resourcePath}`);
  }
}

if (pkg.private) fail("package must not be private before publication");
if (!pkg.keywords?.includes("pi-package")) fail("package must include keyword pi-package");
if (!pkg.pi) fail("package must include a pi manifest");
for (const key of ["@earendil-works/pi-ai", "@earendil-works/pi-agent-core", "@earendil-works/pi-coding-agent", "@earendil-works/pi-tui", "typebox"]) {
  if (!pkg.peerDependencies?.[key]) fail(`missing peerDependency: ${key}`);
  if (pkg.dependencies?.[key]) fail(`host-provided Pi package must not be in dependencies: ${key}`);
}
for (const resourcePath of pkg.pi?.extensions ?? []) checkPath(resourcePath);
for (const resourcePath of pkg.pi?.prompts ?? []) checkPath(resourcePath);
for (const required of ["README.md", "LICENSE", "CHANGELOG.md", "SECURITY.md", "CONTRIBUTING.md"]) {
  if (!existsSync(path.join(root, required))) fail(`missing ${required}`);
}

if (errors.length > 0) {
  console.error(errors.map((e) => `- ${e}`).join("\n"));
  process.exit(1);
}
console.log("package metadata looks good");
