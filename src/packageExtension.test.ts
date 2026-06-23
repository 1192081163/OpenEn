import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function readZipEntryNames(archive: Buffer): string[] {
  const endOfCentralDirectory = archive.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (endOfCentralDirectory === -1) {
    throw new Error("Missing ZIP end of central directory record");
  }

  const entryCount = archive.readUInt16LE(endOfCentralDirectory + 10);
  let offset = archive.readUInt32LE(endOfCentralDirectory + 16);
  const names: string[] = [];

  for (let i = 0; i < entryCount; i += 1) {
    expect(archive.readUInt32LE(offset)).toBe(0x02014b50);

    const nameLength = archive.readUInt16LE(offset + 28);
    const extraLength = archive.readUInt16LE(offset + 30);
    const commentLength = archive.readUInt16LE(offset + 32);
    const nameStart = offset + 46;
    const nameEnd = nameStart + nameLength;

    names.push(archive.subarray(nameStart, nameEnd).toString("utf8"));
    offset = nameEnd + extraLength + commentLength;
  }

  return names;
}

describe("extension packaging script", () => {
  const script = resolve(process.cwd(), "scripts/package-extension.mjs");

  it("creates a store upload zip with extension files at the archive root", async () => {
    const temp = await mkdtemp(join(tmpdir(), "openen-package-"));
    const dist = join(temp, "dist");
    const release = join(temp, "release");

    try {
      await mkdir(join(dist, "content"), { recursive: true });
      await writeFile(join(dist, "manifest.json"), JSON.stringify({ manifest_version: 3 }));
      await writeFile(join(dist, "content", "contentScript.js"), "console.log('content');");
      await writeFile(join(dist, ".DS_Store"), "local metadata");

      await execFileAsync(process.execPath, [
        script,
        "--target",
        "chrome",
        "--source",
        dist,
        "--out-dir",
        release,
        "--name",
        "openen",
        "--version",
        "0.1.0"
      ]);

      const archive = await readFile(join(release, "openen-chrome-v0.1.0.zip"));

      expect(readZipEntryNames(archive)).toEqual(["content/contentScript.js", "manifest.json"]);
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });
});
