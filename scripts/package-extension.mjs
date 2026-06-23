import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dosTime = 0;
const dosDate = 33;
const ignoredFileNames = new Set([".DS_Store"]);

function readOption(args, name) {
  const valueIndex = args.indexOf(name);
  if (valueIndex !== -1) {
    return args[valueIndex + 1];
  }

  const withEquals = args.find((arg) => arg.startsWith(`${name}=`));
  return withEquals?.slice(name.length + 1);
}

async function assertFileExists(path, hint) {
  try {
    await access(path);
  } catch {
    throw new Error(`${hint}: ${path}`);
  }
}

async function collectFiles(sourceDir, currentDir = sourceDir) {
  const entries = await readdir(currentDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (ignoredFileNames.has(entry.name)) {
      continue;
    }

    const absolutePath = resolve(currentDir, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectFiles(sourceDir, absolutePath)));
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    files.push({
      absolutePath,
      archivePath: relative(sourceDir, absolutePath).split(sep).join("/")
    });
  }

  return files.sort((a, b) => a.archivePath.localeCompare(b.archivePath));
}

const crcTable = new Uint32Array(
  Array.from({ length: 256 }, (_, value) => {
    let crc = value;

    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }

    return crc >>> 0;
  })
);

function crc32(buffer) {
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function assertZip32Size(value, label) {
  if (value > 0xffffffff) {
    throw new Error(`${label} is too large for the ZIP32 package format`);
  }
}

function createLocalFileHeader(entry) {
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0, 6);
  header.writeUInt16LE(0, 8);
  header.writeUInt16LE(dosTime, 10);
  header.writeUInt16LE(dosDate, 12);
  header.writeUInt32LE(entry.crc, 14);
  header.writeUInt32LE(entry.size, 18);
  header.writeUInt32LE(entry.size, 22);
  header.writeUInt16LE(entry.name.length, 26);
  header.writeUInt16LE(0, 28);
  return header;
}

function createCentralDirectoryHeader(entry) {
  const header = Buffer.alloc(46);
  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(20, 6);
  header.writeUInt16LE(0, 8);
  header.writeUInt16LE(0, 10);
  header.writeUInt16LE(dosTime, 12);
  header.writeUInt16LE(dosDate, 14);
  header.writeUInt32LE(entry.crc, 16);
  header.writeUInt32LE(entry.size, 20);
  header.writeUInt32LE(entry.size, 24);
  header.writeUInt16LE(entry.name.length, 28);
  header.writeUInt16LE(0, 30);
  header.writeUInt16LE(0, 32);
  header.writeUInt16LE(0, 34);
  header.writeUInt16LE(0, 36);
  header.writeUInt32LE(0, 38);
  header.writeUInt32LE(entry.offset, 42);
  return header;
}

function createEndOfCentralDirectory(entryCount, centralDirectorySize, centralDirectoryOffset) {
  if (entryCount > 0xffff) {
    throw new Error("Too many files for the ZIP32 package format");
  }

  const footer = Buffer.alloc(22);
  footer.writeUInt32LE(0x06054b50, 0);
  footer.writeUInt16LE(0, 4);
  footer.writeUInt16LE(0, 6);
  footer.writeUInt16LE(entryCount, 8);
  footer.writeUInt16LE(entryCount, 10);
  footer.writeUInt32LE(centralDirectorySize, 12);
  footer.writeUInt32LE(centralDirectoryOffset, 16);
  footer.writeUInt16LE(0, 20);
  return footer;
}

async function createZipArchive(sourceDir, outputFile) {
  const files = await collectFiles(sourceDir);

  if (!files.some((file) => file.archivePath === "manifest.json")) {
    throw new Error(`Missing manifest.json in extension package source: ${sourceDir}`);
  }

  const entries = [];
  const localParts = [];
  let offset = 0;

  for (const file of files) {
    const data = await readFile(file.absolutePath);
    assertZip32Size(data.byteLength, file.archivePath);

    const entry = {
      crc: crc32(data),
      data,
      name: Buffer.from(file.archivePath, "utf8"),
      offset,
      size: data.byteLength
    };
    const header = createLocalFileHeader(entry);

    localParts.push(header, entry.name, data);
    entries.push(entry);
    offset += header.byteLength + entry.name.byteLength + data.byteLength;
  }

  const centralDirectoryOffset = offset;
  const centralParts = entries.flatMap((entry) => [createCentralDirectoryHeader(entry), entry.name]);
  const centralDirectorySize = centralParts.reduce((size, part) => size + part.byteLength, 0);

  assertZip32Size(centralDirectoryOffset, "Central directory offset");
  assertZip32Size(centralDirectorySize, "Central directory");

  const footer = createEndOfCentralDirectory(entries.length, centralDirectorySize, centralDirectoryOffset);

  await mkdir(dirname(outputFile), { recursive: true });
  await writeFile(outputFile, Buffer.concat([...localParts, ...centralParts, footer]));

  return files.map((file) => file.archivePath);
}

async function main(args = process.argv.slice(2)) {
  const target = readOption(args, "--target") ?? "chrome";
  if (target !== "chrome" && target !== "edge") {
    throw new Error(`Unsupported extension package target: ${target}`);
  }

  const packageJson = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
  const sourceDir = resolve(root, readOption(args, "--source") ?? "dist");
  const outDir = resolve(root, readOption(args, "--out-dir") ?? "release");
  const packageName = readOption(args, "--name") ?? packageJson.name;
  const version = readOption(args, "--version") ?? packageJson.version;
  const outputFile = resolve(outDir, `${packageName}-${target}-v${version}.zip`);

  await assertFileExists(resolve(sourceDir, "manifest.json"), "Missing Chromium extension build. Run `npm run build` first");

  const entries = await createZipArchive(sourceDir, outputFile);
  console.log(`Packaged ${target} extension ${outputFile} (${entries.length} files)`);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
