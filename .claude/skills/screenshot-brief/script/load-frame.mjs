// Load a device pack's frame.json and normalize its frames.
// Usage (from publisher repo root):
//   node .claude/skills/screenshot-brief/script/load-frame.mjs --pack iphone_12_pro [--repo-root DIR] [--compact]
// Returns { pack, frames:[{ name, description, framePath, viewWidth, viewHeight }] }.
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

const args = parseArgs(process.argv.slice(2))
if (typeof args.pack !== 'string') fail('--pack <pack_id> is required')

const root = publisherRoot(args['repo-root'])
const framePath = path.join(root, 'web_ui', 'public', 'device-frames', args.pack, 'frame.json')

let data
try {
  data = JSON.parse(fs.readFileSync(framePath, 'utf8'))
} catch (e) {
  fail(`cannot read ${framePath}: ${e.message}`)
}

const frames = (Array.isArray(data.frames) ? data.frames : []).map((e) => ({
  name: e.name ?? null,
  description: e.description ?? null,
  framePath: e.framePath ?? null,
  viewWidth: e.viewWidth ?? null,
  viewHeight: e.viewHeight ?? null,
}))

printJson({ pack: args.pack, frames }, args.compact === true)
