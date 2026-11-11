// Import discipline for this repository.
//
// 1. Every relative import (`./x.js`, `../y.mjs`, with or without a `?v=` query) resolves to a file.
// 2. Halo is a pinned release tag in package.json and is imported as `@rb/halo` or `@rb/halo/src/...`.
//    The browser resolves those through the import map in index.html, which points into node_modules;
//    Node resolves them through the package's exports.
// 3. No source import reaches into node_modules by path (`../node_modules/@rb/halo/src/...`): only the
//    import map may name node_modules. No file names a sibling checkout (`../halo`, `../lattice`,
//    `/halo/src`, `/lattice/src`) or a `file:../` dependency.
// 4. Every `@rb/*` specifier used in sources resolves inside node_modules, honouring the package's exports.
//
// Run with `npm run check`. Exit code 1 lists every problem; nothing is auto-fixed.
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const name = pkg.name ?? path.basename(root);
const SKIP_DIRS = new Set([
  "node_modules", ".git", ".scratchpad", ".scratch", ".artifacts", "dist", "build", "coverage",
  "test-results", "playwright-report", ".playwright-mcp",
]);
const SIBLING = /(?:^|[^\w])(?:\.\.\/)+(?:halo|lattice)(?:\/|$)|(?<!@rb)\/(?:halo|lattice)\/src\/|file:\.\.\//;
const NODE_MODULES_PATH = /(?:^|\/)node_modules\//;
const LIBRARY_PATH = /(?:^|\/)node_modules\/@rb\//;
const PIN = /^github:Rick-Boardman\/vr-(?:halo|lattice)#v\d+\.\d+\.\d+$/;
const IMPORT_MAP = /<script\s+type=["']importmap["']\s*>([\s\S]*?)<\/script>/g;
const stringLiterals = /["']([^"'\n]+)["']/g;
const moduleSpecifier = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)["']([^"'\n]+)["']/g;
const relativeImport = /["'](\.{1,2}\/[^"'\n]+\.(?:js|mjs)(?:\?[^"'\n]*)?)["']/g;
const libraryImport = /["'](@rb\/(?:halo|lattice)(?:\/[^"'\n]*)?)["']/g;

const problems = [];
const report = (file, message) => problems.push(`${path.relative(root, file).replaceAll("\\", "/")}: ${message}`);

function walk(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) files.push(...walk(full));
    } else if (entry.isFile() && /\.(?:js|mjs|html)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

const exportsCache = new Map();
function libraryExports(lib) {
  if (!exportsCache.has(lib)) {
    const file = path.join(root, "node_modules", "@rb", lib, "package.json");
    exportsCache.set(lib, fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")).exports ?? {} : null);
  }
  return exportsCache.get(lib);
}

function checkLibrarySpecifier(file, specifier) {
  const [clean] = specifier.split("?");
  const match = /^@rb\/(halo|lattice)(?:\/(.*))?$/.exec(clean);
  if (!match) return;
  const [, lib, sub] = match;
  const exportsMap = libraryExports(lib);
  if (exportsMap === null) { report(file, `${specifier}: @rb/${lib} is not installed (run npm install)`); return; }
  const key = sub ? `./${sub}` : ".";
  let target = exportsMap[key];
  if (!target && sub?.startsWith("src/") && exportsMap["./src/*"]) target = `./${sub}`;
  if (!target) { report(file, `${specifier}: not exported by @rb/${lib}`); return; }
  if (!fs.existsSync(path.join(root, "node_modules", "@rb", lib, target))) report(file, `${specifier}: ${target} missing in node_modules/@rb/${lib}`);
}

function checkImportMap(file, json) {
  let imports;
  try { imports = JSON.parse(json).imports ?? {}; } catch (error) { report(file, `import map is not valid JSON: ${error.message}`); return; }
  for (const [key, value] of Object.entries(imports)) {
    if (SIBLING.test(value)) report(file, `import map ${key} names a sibling checkout: ${value}`);
    if (key.startsWith("@rb/") && !/^\.?\/node_modules\//.test(value)) report(file, `import map ${key} must point into node_modules, not ${value}`);
    if (/^\.?\//.test(value) && !fs.existsSync(path.join(root, value.replace(/^\.?\//, "")))) report(file, `import map ${key} -> ${value} does not exist (run npm install)`);
  }
}

for (const file of walk(root)) {
  let text = fs.readFileSync(file, "utf8");
  if (file.endsWith(".html")) {
    for (const block of text.matchAll(IMPORT_MAP)) checkImportMap(file, block[1]);
    // The import map is the one place allowed to name node_modules; check the rest of the page as source.
    text = text.replace(IMPORT_MAP, "");
  }
  for (const match of text.matchAll(stringLiterals)) {
    if (SIBLING.test(match[1])) report(file, `names a sibling checkout: ${match[1]}`);
    else if (LIBRARY_PATH.test(match[1])) report(file, `names a library inside node_modules by path: ${match[1]} (import it as @rb/<lib>/...)`);
  }
  for (const match of text.matchAll(moduleSpecifier)) {
    if (NODE_MODULES_PATH.test(match[1]) && !LIBRARY_PATH.test(match[1])) report(file, `imports through a node_modules path: ${match[1]} (import the package by name)`);
  }
  for (const match of text.matchAll(relativeImport)) {
    const [pathPart] = match[1].split("?");
    if (!fs.existsSync(path.resolve(path.dirname(file), pathPart))) report(file, `unresolved relative import ${match[1]}`);
  }
  for (const match of text.matchAll(libraryImport)) checkLibrarySpecifier(file, match[1]);
}

for (const section of ["dependencies", "devDependencies", "peerDependencies"]) {
  for (const [dep, spec] of Object.entries(pkg[section] ?? {})) {
    if (dep.startsWith("@rb/") && !PIN.test(spec)) report(path.join(root, "package.json"), `${dep} must pin a release tag (github:Rick-Boardman/vr-<lib>#vX.Y.Z), not ${spec}`);
    if (SIBLING.test(spec)) report(path.join(root, "package.json"), `${dep} names a sibling checkout: ${spec}`);
  }
}

if (problems.length) {
  for (const problem of problems) console.error(`check-imports: ${problem}`);
  process.exit(1);
}
console.log(`check-imports: ${name}: relative imports resolve; Halo comes from a pinned tag in node_modules through the import map.`);
