import { cp, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
await cp(join(root, "src", "renderer"), join(root, "dist", "renderer"), { recursive: true });
console.log("[copy-static] src/renderer -> dist/renderer");

const iconSrc = join(root, "assets", "icon.png");
try {
  await access(iconSrc);
  await cp(iconSrc, join(root, "dist", "renderer", "icon.png"));
  console.log("[copy-static] assets/icon.png -> dist/renderer/icon.png");
} catch {
  console.warn("[copy-static] assets/icon.png not found; skipping the icon");
}
