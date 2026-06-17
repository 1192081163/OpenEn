import { build } from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = resolve(root, "dist");

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(resolve(root, "public"), dist, { recursive: true });

const common = {
  bundle: true,
  target: "chrome116",
  sourcemap: true,
  logLevel: "info"
};

await Promise.all([
  build({
    ...common,
    entryPoints: [resolve(root, "src/background/serviceWorker.ts")],
    outfile: resolve(dist, "background/serviceWorker.js"),
    format: "esm"
  }),
  build({
    ...common,
    entryPoints: [resolve(root, "src/content/contentScript.ts")],
    outfile: resolve(dist, "content/contentScript.js"),
    format: "iife"
  }),
  build({
    ...common,
    entryPoints: [resolve(root, "src/ui/popup/popup.ts")],
    outfile: resolve(dist, "ui/popup/popup.js"),
    format: "iife"
  }),
  build({
    ...common,
    entryPoints: [resolve(root, "src/ui/vocabulary/vocabulary.ts")],
    outfile: resolve(dist, "ui/vocabulary/vocabulary.js"),
    format: "iife"
  })
]);

await cp(resolve(root, "src/ui/popup/popup.html"), resolve(dist, "ui/popup/popup.html"));
await cp(resolve(root, "src/ui/popup/popup.css"), resolve(dist, "ui/popup/popup.css"));
await cp(resolve(root, "src/ui/vocabulary/vocabulary.html"), resolve(dist, "ui/vocabulary/vocabulary.html"));
await cp(resolve(root, "src/ui/vocabulary/vocabulary.css"), resolve(dist, "ui/vocabulary/vocabulary.css"));
