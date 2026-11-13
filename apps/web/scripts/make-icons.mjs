#!/usr/bin/env node
/**
 * Generates the PNG icons the web app manifest needs from public/icon.svg.
 *
 * Runs as the first step of `pnpm --filter @freshskin/web build`, so a clean checkout has the
 * PNGs before Workbox tries to precache them (`includeAssets` in vite.config.ts). Idempotent;
 * rerun on its own with `pnpm --filter @freshskin/web icons` after editing icon.svg.
 *
 * Uses sharp because it is the only image dependency that reliably rasterises SVG with
 * alpha on all three platforms. If you would rather not add it, export 192px and 512px PNGs
 * from the SVG in any editor and drop them in web/public/ — nothing else refers to this file.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(here, '..', 'public');

const svg = await readFile(resolve(publicDir, 'icon.svg'));

for (const size of [192, 512]) {
  const png = await sharp(svg).resize(size, size).png({ compressionLevel: 9 }).toBuffer();
  await writeFile(resolve(publicDir, `icon-${size}.png`), png);
  console.log(`wrote icon-${size}.png (${png.length} bytes)`);
}
