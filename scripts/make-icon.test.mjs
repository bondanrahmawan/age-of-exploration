import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import test from "node:test";
import {
  ICON_RELATIVE_PATH,
  ICON_SIZES,
  encodeIcon,
  iconPath,
  renderSquare,
} from "./make-icon.mjs";

function pixelAt(pixels, size, x, y) {
  const offset = (y * size + x) * 4;
  return {
    alpha: pixels[offset + 3],
    blue: pixels[offset + 2],
    green: pixels[offset + 1],
    red: pixels[offset],
  };
}

test("the committed icon is what the generator draws", async () => {
  const committed = await fs.readFile(iconPath());
  assert.deepEqual(
    committed,
    encodeIcon(),
    `${ICON_RELATIVE_PATH} is stale. Run: node scripts/make-icon.mjs`,
  );
});

test("drawing the same size twice produces the same bytes", () => {
  assert.deepEqual(renderSquare(32), renderSquare(32));
});

test("the icon directory describes every entry it contains", () => {
  const icon = encodeIcon();
  assert.equal(icon.readUInt16LE(0), 0);
  assert.equal(icon.readUInt16LE(2), 1);
  assert.equal(icon.readUInt16LE(4), ICON_SIZES.length);

  ICON_SIZES.forEach((size, index) => {
    const entry = 6 + index * 16;
    assert.equal(icon.readUInt8(entry), size, `width of the ${size} pixel entry`);
    assert.equal(icon.readUInt8(entry + 1), size, `height of the ${size} pixel entry`);
    assert.equal(icon.readUInt16LE(entry + 6), 32, `bit depth of the ${size} pixel entry`);

    const length = icon.readUInt32LE(entry + 8);
    const offset = icon.readUInt32LE(entry + 12);
    assert.ok(offset + length <= icon.length, `the ${size} pixel entry fits in the file`);

    // An uncompressed DIB, not a PNG: 40-byte header, declared height doubled
    // for the transparency mask. Windows reads only this form.
    assert.equal(icon.readUInt32LE(offset), 40);
    assert.equal(icon.readInt32LE(offset + 4), size);
    assert.equal(icon.readInt32LE(offset + 8), size * 2);
    assert.equal(icon.readUInt32LE(offset + 16), 0, `the ${size} pixel entry is uncompressed`);
  });
});

// The size that matters and the one no eye is going to check: at 16 pixels the
// mark has to still be a compass, which means a lit north point, a darker one
// opposite it, and corners that are not there.
test("the mark still reads at 16 pixels", () => {
  const pixels = renderSquare(16);
  const north = pixelAt(pixels, 16, 8, 3);
  const south = pixelAt(pixels, 16, 8, 12);
  const corner = pixelAt(pixels, 16, 0, 0);

  assert.equal(north.alpha, 255);
  assert.equal(south.alpha, 255);
  assert.ok(corner.alpha < 64, `the corner is rounded away, alpha was ${corner.alpha}`);

  // Cream against gold. Blue is the channel that separates them, and it has to
  // separate them by more than a screen can hide.
  assert.ok(
    north.blue - south.blue > 60,
    `north and south read the same, blue was ${north.blue} against ${south.blue}`,
  );
});
