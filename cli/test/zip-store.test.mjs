/**
 * The zip the Download button hands the browser.
 *
 * A zip writer is exactly the kind of code that looks right and is wrong: every
 * field is a little-endian integer at a fixed offset, and a single bad one turns
 * into "the archive is corrupt" on someone else's machine. So the bytes are
 * checked against a real unzip, not against this file's own idea of the format.
 *
 * Run: node cli/test/zip-store.test.mjs
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Buffer } from 'node:buffer'
import { crc32, dosDateTime, zipStore } from '../zip-store.mjs'

let failures = 0
const check = (label, cond, detail = '') => {
  if (!cond) { failures += 1; console.log(`FAIL  ${label}${detail ? `  — ${detail}` : ''}`) }
  else console.log(`PASS  ${label}`)
}

// The published CRC-32 of "hello". A table built wrong still produces stable
// nonsense, so the constant has to come from outside this code.
check('crc32 matches the known value for "hello"',
  crc32(Buffer.from('hello')) === 0x3610a686, crc32(Buffer.from('hello')).toString(16))

const pre1980 = dosDateTime(new Date('1975-06-01T12:00:00Z'))
check('a date before 1980 is clamped rather than written negative',
  (pre1980.date >> 9) === 0, JSON.stringify(pre1980))

const panels = [
  { name: 'panel1.png', data: Buffer.from('first panel bytes') },
  { name: 'panel2.png', data: Buffer.from('second panel bytes, longer') },
  { name: 'strip.png', data: Buffer.from('the whole strip') },
]
const zip = zipStore(panels, { date: new Date('2026-09-13T10:20:30Z') })

check('it starts with a local file header and ends with an end-of-central-directory',
  zip.readUInt32LE(0) === 0x04034b50 && zip.readUInt32LE(zip.length - 22) === 0x06054b50)
check('the central directory counts every entry',
  zip.readUInt16LE(zip.length - 22 + 10) === panels.length)

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'design-ss-zip-'))
const file = path.join(tmp, 'panels.zip')
await fs.writeFile(file, zip)

// The fact is the file, not this module's self-report.
let unzipOk = true
try {
  execFileSync('unzip', ['-t', file], { stdio: 'pipe' })
} catch (e) {
  unzipOk = false
  console.log(String(e.stdout ?? e.message))
}
check('a real unzip reports the archive as sound', unzipOk)

execFileSync('unzip', ['-q', file, '-d', path.join(tmp, 'out')], { stdio: 'pipe' })
const names = (await fs.readdir(path.join(tmp, 'out'))).sort()
check('every entry comes back out',
  JSON.stringify(names) === JSON.stringify(['panel1.png', 'panel2.png', 'strip.png']), names.join(', '))

const roundTripped = await fs.readFile(path.join(tmp, 'out', 'panel2.png'))
check('...byte for byte', roundTripped.equals(panels[1].data), roundTripped.toString())

// Store means store: the entry must not be larger than what went in, which is
// the whole reason PNGs are not deflated again.
check('the bytes are stored, not recompressed', zip.length < 1024 && zip.includes(Buffer.from('second panel bytes')))

await fs.rm(tmp, { recursive: true, force: true })

console.log(failures ? `\n${failures} failure(s)` : '\nall green')
process.exit(failures ? 1 : 0)
