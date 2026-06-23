import { access, cp, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const safariDist = resolve(root, "dist-safari");
const resources = resolve(root, "safari/OpenEnSafari/OpenEn/Shared (Extension)/Resources");
const optional = process.argv.includes("--optional");

async function directoryExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function assertDirectoryExists(path, hint) {
  if (!(await directoryExists(path))) {
    throw new Error(`${hint}: ${path}`);
  }
}

await assertDirectoryExists(safariDist, "Missing Safari build output. Run `npm run build:safari` first");

if (!(await directoryExists(resources))) {
  if (optional) {
    console.log(`Skipped Safari Xcode sync because Resources directory does not exist: ${resources}`);
    process.exit(0);
  }

  throw new Error(`Missing Safari Xcode Resources directory. Run Safari conversion first: ${resources}`);
}

await rm(resources, { recursive: true, force: true });
await mkdir(dirname(resources), { recursive: true });
await cp(safariDist, resources, { recursive: true });

console.log(`Synced Safari extension resources to ${resources}`);
