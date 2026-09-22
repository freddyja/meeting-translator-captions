import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "public");

function crc32(buf) {
  let crc = ~0;
  for (const byte of buf) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return ~crc >>> 0;
}

function chunk(type, data) {
  const header = Buffer.from(type);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([header, data])));
  return Buffer.concat([len, header, data, crc]);
}

function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x += 1) {
      const [r, g, b, a] = pixel(x, y, size);
      const offset = y * (size * 4 + 1) + 1 + x * 4;
      raw[offset] = r;
      raw[offset + 1] = g;
      raw[offset + 2] = b;
      raw[offset + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function bar(nx, ny, x, y, w, h) {
  const dx = Math.max(x - nx, 0, nx - (x + w));
  const dy = Math.max(y - ny, 0, ny - (y + h));
  const r = h / 2;
  return dx * dx + dy * dy <= r * r || (nx >= x && nx <= x + w && ny >= y && ny <= y + h);
}

function drawIcon(x, y, size, { maskable }) {
  const bg = [11, 18, 20, 255];
  const nx = (x + 0.5) / size;
  const ny = (y + 0.5) / size;
  const pad = maskable ? 0.22 : 0.1;
  const left = pad;
  const right = 1 - pad;
  const top = pad;
  const bottom = 1 - pad;
  const radius = maskable ? 0 : 0.18;

  if (!maskable) {
    const qx = nx < left + radius ? left + radius : nx > right - radius ? right - radius : nx;
    const qy = ny < top + radius ? top + radius : ny > bottom - radius ? bottom - radius : ny;
    const outside =
      nx < left || nx > right || ny < top || ny > bottom || (nx - qx) ** 2 + (ny - qy) ** 2 > radius ** 2;
    if (outside) return [0, 0, 0, 0];
  }

  const inset = maskable ? 0.08 : 0;
  if (bar(nx, ny, 0.18 + inset, 0.24 + inset, 0.34, 0.12)) return [43, 179, 163, 255];
  if (bar(nx, ny, 0.18 + inset, 0.44, 0.62 - inset, 0.12)) return [127, 209, 199, 255];
  if (bar(nx, ny, 0.18 + inset, 0.64 - inset, 0.48, 0.12)) return [231, 244, 242, 255];
  return bg;
}

for (const size of [192, 512]) {
  writeFileSync(path.join(outDir, `icon-${size}.png`), png(size, (x, y, s) => drawIcon(x, y, s, { maskable: false })));
  writeFileSync(
    path.join(outDir, `icon-${size}-maskable.png`),
    png(size, (x, y, s) => drawIcon(x, y, s, { maskable: true })),
  );
}

console.log("Wrote PNG icons to public/");
