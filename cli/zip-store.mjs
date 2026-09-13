/**
 * A zip file, stored not deflated, in about as little code as the format allows.
 *
 * Why no dependency and no `zip` command: the only thing the editor ever puts in
 * a zip is PNGs, which are already deflate-compressed internally -- recompressing
 * them buys a percent or two for a library, a native build, or a shell-out to a
 * program Windows does not have. Store (method 0) writes the bytes through
 * untouched, and every unzip tool in the world reads it.
 *
 * Deliberately left out: zip64 (a strip of full-resolution panels is megabytes,
 * not gigabytes), folders (the entries are flat), and data descriptors (every
 * size is known before writing, because the buffers are already in hand).
 */
import { Buffer } from 'node:buffer'

/**
 * CRC-32, table-driven, rather than `zlib.crc32`.
 *
 * That function exists only from Node 20.15, and `package.json` says node >= 20 --
 * so using it would make this module quietly depend on a patch version the
 * engines field does not require. Twelve lines is cheaper than that footgun.
 */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i += 1) {
    let c = i
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[i] = c >>> 0
  }
  return table
})()

export function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** MS-DOS date/time, which is what a zip entry carries. Two-second resolution, by design. */
export function dosDateTime(date) {
  const year = date.getFullYear()
  // The format cannot express anything before 1980; clamp rather than write a
  // negative year that makes an unzip tool report a corrupt archive.
  const y = Math.max(1980, year) - 1980
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
    date: (y << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  }
}

/**
 * `entries` is `[{ name, data }]` in the order they should appear.
 *
 * The date is a parameter so a test can assert the bytes, and defaults to now so
 * the files look current when they land in someone's Downloads folder.
 */
export function zipStore(entries, { date = new Date() } = {}) {
  const { time, date: dosDate } = dosDateTime(date)
  const locals = []
  const centrals = []
  let offset = 0

  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, 'utf8')
    const body = Buffer.isBuffer(data) ? data : Buffer.from(data)
    const crc = crc32(body)

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)   // local file header
    local.writeUInt16LE(20, 4)           // version needed: 2.0
    local.writeUInt16LE(0x0800, 6)       // flags: names are UTF-8
    local.writeUInt16LE(0, 8)            // method: store
    local.writeUInt16LE(time, 10)
    local.writeUInt16LE(dosDate, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(body.length, 18) // compressed == uncompressed
    local.writeUInt32LE(body.length, 22)
    local.writeUInt16LE(nameBuf.length, 26)
    local.writeUInt16LE(0, 28)           // no extra field
    locals.push(local, nameBuf, body)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0) // central directory header
    central.writeUInt16LE(20, 4)         // version made by
    central.writeUInt16LE(20, 6)         // version needed
    central.writeUInt16LE(0x0800, 8)
    central.writeUInt16LE(0, 10)
    central.writeUInt16LE(time, 12)
    central.writeUInt16LE(dosDate, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(body.length, 20)
    central.writeUInt32LE(body.length, 24)
    central.writeUInt16LE(nameBuf.length, 28)
    central.writeUInt16LE(0, 30)         // extra
    central.writeUInt16LE(0, 32)         // comment
    central.writeUInt16LE(0, 34)         // disk number
    central.writeUInt16LE(0, 36)         // internal attributes
    central.writeUInt32LE(0o644 << 16, 38) // external: readable by whoever unzips it
    central.writeUInt32LE(offset, 42)    // where the local header is
    centrals.push(central, nameBuf)

    offset += local.length + nameBuf.length + body.length
  }

  const centralBuf = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)       // end of central directory
  end.writeUInt16LE(0, 4)                // this disk
  end.writeUInt16LE(0, 6)                // disk with the central directory
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(centralBuf.length, 12)
  end.writeUInt32LE(offset, 16)
  end.writeUInt16LE(0, 20)               // no archive comment

  return Buffer.concat([...locals, centralBuf, end])
}
