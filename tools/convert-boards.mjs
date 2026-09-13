/**
 * Convert board artwork dropped into `assets/boards/` from PNG to WebP.
 *
 * The generator hands over ~2.2 MB PNGs; at WebP quality 76 the same image is
 * ~220 KB with no visible difference at the size a board is ever shown. With a
 * hundred-odd boards that is the difference between a 28 MB module and a
 * 280 MB one, so the PNGs are gitignored and only the WebPs ship.
 *
 * Idempotent: a PNG that already has a WebP twin is skipped, and the PNGs are
 * never deleted here — they are the artist's originals, and whether to keep
 * them around is not this script's decision.
 *
 * Needs `sharp`, which is native and therefore not a dependency of the module
 * itself. Run it in the build container:
 *
 *   docker compose run --rm build sh -lc "npm i --no-save sharp && node tools/convert-boards.mjs"
 *
 * Then `node tools/build-catalog.mjs` (or just build — it runs as `prebuild`)
 * to pick the new files up.
 */
import { readdir } from "node:fs/promises";
import { join } from "node:path";

const BOARDS = "assets/boards";
const QUALITY = 76;

const sharp = (await import("sharp")).default;

const files = await readdir(BOARDS);
const pngs = files.filter((file) => file.toLowerCase().endsWith(".png")).sort();
const webps = new Set(files.filter((file) => file.toLowerCase().endsWith(".webp")));

let converted = 0;
let skipped = 0;
let bytesIn = 0;
let bytesOut = 0;

for (const png of pngs) {
  const stem = png.slice(0, -4);
  const webp = `${stem}.webp`;
  if (webps.has(webp)) {
    skipped += 1;
    continue;
  }
  const input = sharp(join(BOARDS, png));
  const { size } = await input.metadata();
  const output = await input.webp({ quality: QUALITY, effort: 6 }).toFile(join(BOARDS, webp));
  bytesIn += size ?? 0;
  bytesOut += output.size;
  converted += 1;
  console.log(`${png} -> ${webp} (${Math.round(output.size / 1024)} KB)`);
}

const mb = (bytes) => (bytes / 1024 / 1024).toFixed(1);
console.log(
  `\n${converted} converted (${mb(bytesIn)} MB -> ${mb(bytesOut)} MB), ${skipped} already had a WebP.`,
);
