const fs = require("fs");
const path = require("path");

// Minimal 16x16 32bpp ICO: header(6) + entry(16) + BMP(40 + 1024 + 32)
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(1, 4);

const entry = Buffer.alloc(16);
entry[0] = 16;
entry[1] = 16;
entry[2] = 0;
entry[3] = 0;
entry.writeUInt16LE(1, 4);
entry.writeUInt16LE(32, 6);
const bmpSize = 40 + 16 * 16 * 4 + Math.ceil(16 / 8) * 16;
entry.writeUInt32LE(bmpSize, 8);
entry.writeUInt32LE(22, 12);

const bmpHeader = Buffer.alloc(40);
bmpHeader.writeUInt32LE(40, 0);
bmpHeader.writeInt32LE(16, 4);
bmpHeader.writeInt32LE(32, 8); // height = 16*2 (XOR+AND in ICO)
bmpHeader.writeUInt16LE(1, 12);
bmpHeader.writeUInt16LE(32, 14);
bmpHeader.writeUInt32LE(0, 16);
bmpHeader.writeUInt32LE(16 * 16 * 4, 20);

const pixels = Buffer.alloc(16 * 16 * 4);
// BMP in ICO: rows bottom-up
for (let row = 0; row < 16; row++) {
  const y = 15 - row;
  for (let x = 0; x < 16; x++) {
    const o = (row * 16 + x) * 4;
    const inRect = x >= 2 && x < 14 && y >= 4 && y < 12;
    pixels[o] = inRect ? 0 : 0x1a;
    pixels[o + 1] = inRect ? 0xd4 : 0x1a;
    pixels[o + 2] = inRect ? 0xaa : 0x2e;
    pixels[o + 3] = 255;
  }
}

const andMask = Buffer.alloc(32);

const ico = Buffer.concat([header, entry, bmpHeader, pixels, andMask]);
const out = path.join(__dirname, "..", "public", "favicon.ico");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, ico);
console.log("Wrote", out);
