// List device packs from web_ui/public/device-frames/index.json.
// Usage (from publisher repo root):
//   node .claude/skills/screenshot-brief/script/device-packs.mjs [--type iphone] [--repo-root DIR] [--compact]
// Self-contained Node ESM (no dependencies).
import fs from 'node:fs'
import path from 'node:path'

function publisherRoot(override) {
  if (override && override !== true) return path.resolve(String(override))
  let dir = process.cwd()
  while (true) {
    if (fs.existsSync(path.join(dir, 'web_ui', 'public', 'device-frames'))) return dir
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return process.cwd()
}

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) continue
    const key = a.slice(2)
    const next = argv[i + 1]
    if (next === undefined || next.startsWith('--')) args[key] = true
    else { args[key] = next; i++ }
  }
  return args
}

function printJson(obj, compact) {
  process.stdout.write((compact ? JSON.stringify(obj) : JSON.stringify(obj, null, 2)) + '\n')
}

function fail(message) {
  process.stdout.write(JSON.stringify({ error: String(message) }, null, 2) + '\n')
  process.exit(1)
}

function packIdFromPath(framePath) {
  // e.g. /device-frames/iphone_12_pro/frame.json -> iphone_12_pro
  const parts = String(framePath).split('/').filter(Boolean)
  if (parts.length >= 2 && parts[0] === 'device-frames') return parts[1]
  if (parts.length >= 1) return parts[0]
  return ''
}

const args = parseArgs(process.argv.slice(2))
const root = publisherRoot(args['repo-root'])
const indexPath = path.join(root, 'web_ui', 'public', 'device-frames', 'index.json')

let raw
try {
  raw = JSON.parse(fs.readFileSync(indexPath, 'utf8'))
} catch (e) {
  fail(`cannot read ${indexPath}: ${e.message}`)
}

let devices = Array.isArray(raw.devices) ? raw.devices : []
const type = typeof args.type === 'string' ? args.type.trim().toLowerCase() : null
if (type) devices = devices.filter((d) => String(d.type || '').toLowerCase() === type)

printJson(devices.map((d) => ({ ...d, id: packIdFromPath(String(d.path || '')) })), args.compact === true)
