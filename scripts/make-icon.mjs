// Generates public/favicon.ico, the one image this game has of itself.
//
// It is drawn here rather than stored as a binary blob nobody can edit: the
// shape is arithmetic, so a change to the palette or the geometry below is a
// readable diff, and scripts/make-icon.test.mjs can prove the committed file is
// what this source says it should be.
//
// No font and no image library. The mark is a four-point compass needle, which
// is four darts and a rounded square - shapes a point-in-polygon test can fill
// exactly. A glyph would have needed a font, and the fonts a machine happens to
// have are not the same from one machine to the next.
//
// Two decisions carry the 16-pixel size, which is the only one most players
// ever see:
//
//   Four points, not eight. A compass rose with short diagonal points needs a
//   gap between each short point and its neighbours; at 16 pixels that gap is
//   under a pixel, and the whole rose closes up into a gold blob.
//
//   The north needle is cream and the other three are gold. A symmetric star is
//   a sparkle; one lit point is a compass. It also survives the size - at 16
//   pixels the north dart is still nearly three pixels across, which is enough
//   for the eye to read as a different colour.
//
// The entries are uncompressed 32-bit DIBs rather than embedded PNGs. Browsers
// read either, but System.Drawing.Icon on the .NET Framework reads only the
// former, so this file stays loadable by anything on Windows that wants to show
// the game - a notification area icon, a shortcut - without being regenerated.
//
//   node scripts/make-icon.mjs
//
// Rebuild the game afterwards: the launcher serves app-dist/, and Vite copies
// public/ into it at build time.

import { promises as fs } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPOSITORY_ROOT = fileURLToPath(new URL("../", import.meta.url));

// 16 is the browser tab, 24 and 32 are the taskbar and the desktop, 48 and 64
// are the large icon views. Above 64 an uncompressed entry costs more than the
// rest of the file put together and nothing local asks for one.
export const ICON_SIZES = [16, 24, 32, 48, 64];
export const ICON_RELATIVE_PATH = "public/favicon.ico";

// Sampled 8x8 per pixel, so an edge lands on one of 65 coverage levels. All of
// it is arithmetic on the same inputs: two runs produce byte-identical output.
const SUPERSAMPLE = 8;

// DESIGN.md, unchanged: sea-deep, gold-lamp, paper.
const FIELD = [0x0d, 0x2b, 0x2f];
const GOLD = [0xe9, 0xbd, 0x68];
const CREAM = [0xf8, 0xf4, 0xe8];

// Fractions of the square. The corner radius is soft enough to read as rounded
// at 48 pixels and still leaves a straight edge at 16.
const CORNER_RADIUS = 0.18;
const NEEDLE_LENGTH = 0.46;
const NEEDLE_WAIST = 0.17;

const NEEDLES = [
  { color: CREAM, degrees: -90 },
  { color: GOLD, degrees: 0 },
  { color: GOLD, degrees: 90 },
  { color: GOLD, degrees: 180 },
];

function pointAt(degrees, radius) {
  const radians = (degrees * Math.PI) / 180;
  return [0.5 + radius * Math.cos(radians), 0.5 + radius * Math.sin(radians)];
}

// A dart: the tip, the two waist corners on the diagonals either side of it,
// and the centre the four of them share.
function needlePolygon(degrees) {
  return [
    pointAt(degrees, NEEDLE_LENGTH),
    pointAt(degrees + 45, NEEDLE_WAIST),
    [0.5, 0.5],
    pointAt(degrees - 45, NEEDLE_WAIST),
  ];
}

function insideRoundedSquare(x, y) {
  const outsideX = Math.max(CORNER_RADIUS - x, x - (1 - CORNER_RADIUS), 0);
  const outsideY = Math.max(CORNER_RADIUS - y, y - (1 - CORNER_RADIUS), 0);
  return outsideX * outsideX + outsideY * outsideY <= CORNER_RADIUS * CORNER_RADIUS;
}

function insidePolygon(polygon, x, y) {
  let inside = false;
  for (let index = 0; index < polygon.length; index += 1) {
    const [xi, yi] = polygon[index];
    const [xj, yj] = polygon[(index + polygon.length - 1) % polygon.length];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function colorAt(shapes, x, y) {
  if (!insideRoundedSquare(x, y)) return null;
  for (const shape of shapes) {
    if (insidePolygon(shape.polygon, x, y)) return shape.color;
  }
  return FIELD;
}

// Straight RGBA, one byte a channel, top row first. Alpha is coverage; the
// colour is the average of the covered samples only, so a corner pixel is the
// field colour at part opacity rather than the field colour faded towards
// black.
export function renderSquare(size) {
  const shapes = NEEDLES.map((needle) => ({
    color: needle.color,
    polygon: needlePolygon(needle.degrees),
  }));
  const samples = SUPERSAMPLE * SUPERSAMPLE;
  const pixels = Buffer.alloc(size * size * 4);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let covered = 0;
      let red = 0;
      let green = 0;
      let blue = 0;
      for (let subY = 0; subY < SUPERSAMPLE; subY += 1) {
        for (let subX = 0; subX < SUPERSAMPLE; subX += 1) {
          const color = colorAt(
            shapes,
            (x + (subX + 0.5) / SUPERSAMPLE) / size,
            (y + (subY + 0.5) / SUPERSAMPLE) / size,
          );
          if (color === null) continue;
          covered += 1;
          red += color[0];
          green += color[1];
          blue += color[2];
        }
      }
      if (covered === 0) continue;
      const offset = (y * size + x) * 4;
      pixels[offset] = Math.round(red / covered);
      pixels[offset + 1] = Math.round(green / covered);
      pixels[offset + 2] = Math.round(blue / covered);
      pixels[offset + 3] = Math.round((covered * 255) / samples);
    }
  }
  return pixels;
}

// One uncompressed 32-bit DIB. The header declares twice the height because the
// format expects a colour image followed by a 1-bit transparency mask; the mask
// is left zero, which the alpha channel already says better.
function encodeImage(size, pixels) {
  const maskStride = ((size + 31) >> 5) << 2;
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0);
  header.writeInt32LE(size, 4);
  header.writeInt32LE(size * 2, 8);
  header.writeUInt16LE(1, 12);
  header.writeUInt16LE(32, 14);
  header.writeUInt32LE(0, 16);
  header.writeUInt32LE(size * size * 4 + maskStride * size, 20);

  const body = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const from = (y * size + x) * 4;
      const to = ((size - 1 - y) * size + x) * 4;
      body[to] = pixels[from + 2];
      body[to + 1] = pixels[from + 1];
      body[to + 2] = pixels[from];
      body[to + 3] = pixels[from + 3];
    }
  }

  return Buffer.concat([header, body, Buffer.alloc(maskStride * size)]);
}

export function encodeIcon(sizes = ICON_SIZES) {
  const images = sizes.map((size) => encodeImage(size, renderSquare(size)));
  const header = Buffer.alloc(6 + images.length * 16);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  let offset = header.length;
  images.forEach((image, index) => {
    const entry = 6 + index * 16;
    // 256 is written as 0 in this field. Nothing here reaches that size, but
    // the rule is part of the format and a later size would meet it silently.
    const declared = sizes[index] === 256 ? 0 : sizes[index];
    header.writeUInt8(declared, entry);
    header.writeUInt8(declared, entry + 1);
    header.writeUInt8(0, entry + 2);
    header.writeUInt8(0, entry + 3);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(image.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += image.length;
  });

  return Buffer.concat([header, ...images]);
}

export function iconPath(repositoryRoot = REPOSITORY_ROOT) {
  return join(repositoryRoot, ...ICON_RELATIVE_PATH.split("/"));
}

async function main() {
  const target = iconPath();
  const icon = encodeIcon();
  await fs.mkdir(dirname(target), { recursive: true });
  await fs.writeFile(target, icon);
  console.log(`Wrote ${ICON_RELATIVE_PATH} (${ICON_SIZES.join(", ")} pixels, ${icon.length} bytes).`);
  console.log("Rebuild the game so app-dist/ picks it up: pnpm build");
}

const invokedPath = process.argv[1] === undefined ? "" : resolve(process.argv[1]);
if (invokedPath === fileURLToPath(import.meta.url)) await main();
