/**
 * Generate placeholder PWA icons — no external dependencies.
 * Draws a dignified emblem (deep-green field, muted-gold concentric emblem)
 * and writes real PNGs into /public. Re-run any time: `npm run gen-icons`.
 * Replace the files in /public with real artwork whenever you have it.
 */
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')
mkdirSync(OUT, { recursive: true })

const GREEN = [15, 77, 60]
const GREEN_DEEP = [10, 53, 41]
const GOLD = [176, 141, 63]
const PARCHMENT = [246, 239, 221]

// --- CRC32 (for PNG chunks) ---
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const body = Buffer.concat([typeBuf, data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([len, body, crc])
}

function encodePNG(size, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  // raw scanlines with filter byte 0
  const stride = size * 4
  const raw = Buffer.alloc((stride + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride)
  }
  const idat = deflateSync(raw, { level: 9 })
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))])
}

// Draw the emblem. `pad` is the fraction of empty margin (maskable needs a
// larger safe zone so the emblem is never clipped by the platform mask).
function draw(size, pad) {
  const buf = Buffer.alloc(size * size * 4)
  const cx = size / 2
  const cy = size / 2
  const usable = size * (1 - pad) // diameter available for the emblem
  const rings = [
    { r: usable * 0.5, color: GREEN },
    { r: usable * 0.46, color: GOLD },
    { r: usable * 0.40, color: GREEN_DEEP },
    { r: usable * 0.30, color: GOLD },
    { r: usable * 0.20, color: GREEN_DEEP },
    { r: usable * 0.10, color: PARCHMENT },
  ]
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - cx + 0.5, y - cy + 0.5)
      let color = GREEN
      for (const ring of rings) {
        if (d <= ring.r) color = ring.color
      }
      const i = (y * size + x) * 4
      buf[i] = color[0]
      buf[i + 1] = color[1]
      buf[i + 2] = color[2]
      buf[i + 3] = 255
    }
  }
  return buf
}

const targets = [
  { name: 'pwa-192.png', size: 192, pad: 0.12 },
  { name: 'pwa-512.png', size: 512, pad: 0.12 },
  { name: 'maskable-192.png', size: 192, pad: 0.3 },
  { name: 'maskable-512.png', size: 512, pad: 0.3 },
  { name: 'apple-touch-icon.png', size: 180, pad: 0.1 },
]

for (const t of targets) {
  const png = encodePNG(t.size, draw(t.size, t.pad))
  writeFileSync(join(OUT, t.name), png)
  console.log(`wrote public/${t.name} (${png.length} bytes)`)
}
