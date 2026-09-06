import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = dirname(here);
const repoRoot = dirname(appRoot);

const { convertVideoToZ64 } = await import(pathToFileURL(join(appRoot, "dist", "main", "convert.js")));

const inputPath = join(repoRoot, "core", "video.mp4");
const resourcesRoot = join(appRoot, "resources");
const tempDir = await mkdtemp(join(tmpdir(), "n64videogen-smoke-"));
const outputPath = join(tempDir, "smoke-test.z64");

console.log(`[smoke-test] input=${inputPath}`);
console.log(`[smoke-test] output=${outputPath}`);

try {
  await convertVideoToZ64(
    {
      inputPath,
      outputPath,
      romTitle: "Smoke Test",
      codec: "mpeg1",
      quality: 50,
      speed: "quick",
      seekIntervalSec: 5,
      audioCompress: "vadpcm",
      audioSampleRate: 32000,
      audioChannels: 1,
      profile: "auto",
      quantMatrix: "n64",
      deinterlace: "auto",
    },
    resourcesRoot,
    (event) => {
      if (event.kind === "stage") console.log(`\n=== ${event.label} ===`);
      else if (event.kind === "log") console.log(event.line);
      else if (event.kind === "error") console.error(`ERROR: ${event.message}`);
    }
  );

  const bytes = await readFile(outputPath);
  const magic = bytes.subarray(0, 4).toString("hex");
  if (magic !== "80371240") {
    throw new Error(`Invalid magic header: expected 80371240, got ${magic}`);
  }
  console.log(`\n[smoke-test] OK — ${outputPath} (${bytes.length} bytes), valid header.`);
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
