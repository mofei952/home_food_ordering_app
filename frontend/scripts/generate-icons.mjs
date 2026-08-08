import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const iconsDir = path.join(__dirname, "../public/icons");
const svgPath = path.join(iconsDir, "icon.svg");

await mkdir(iconsDir, { recursive: true });

for (const size of [192, 512]) {
  const outPath = path.join(iconsDir, `icon-${size}.png`);
  await sharp(svgPath)
    .resize(size, size, { fit: "contain", background: { r: 255, g: 250, b: 240, alpha: 1 } })
    .png()
    .toFile(outPath);
  console.log(`wrote ${outPath}`);
}
