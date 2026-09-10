/**
 * A page on another site must not be able to write through the editor API.
 *
 * A browser sends a "simple" cross-site POST (text/plain, no custom headers)
 * without a preflight, so before this check any page open while the editor ran
 * could call `create?replace=1` and wipe a strip folder. The editor's own
 * fetches carry a matching Origin and curl sends none; both must keep working.
 *
 * Runs the real dev server on a free port and speaks raw HTTP, because fetch
 * treats Origin as a header it owns and may not send the one a test sets.
 * Writes go to `/mode`, whose state is in memory: nothing on disk is touched.
 *
 * Run: node test/cross-origin.test.mjs   (from strip_editor/)
 */
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const EDITOR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

let failures = 0
const check = (label, got, want) => {
  if (got !== want) { failures += 1; console.log(`FAIL  ${label}  — status ${got}, want ${want}`) }
  else console.log(`PASS  ${label}`)
}

const server = await createServer({
  configFile: path.join(EDITOR, 'vite.config.ts'),
  root: EDITOR,
  logLevel: 'silent',
  server: { port: 0, strictPort: false, host: '127.0.0.1' },
})
await server.listen()
const { port } = server.httpServer.address()
const self = `http://127.0.0.1:${port}`

/** One request, exactly the headers given. Resolves to the status code. */
const send = (method, urlPath, origin) => new Promise((resolve, reject) => {
  const headers = { 'content-type': 'text/plain', ...(origin === undefined ? {} : { origin }) }
  const req = http.request({ host: '127.0.0.1', port, method, path: urlPath, headers }, (res) => {
    res.resume().on('end', () => resolve(res.statusCode))
  })
  req.on('error', reject)
  req.end(method === 'GET' ? undefined : JSON.stringify({ mode: 'human' }))
})

try {
  const MODE = '/__api/strip-editor/mode'
  check('POST with no Origin (curl, the agent skill) is accepted', await send('POST', MODE), 200)
  check('POST from the editor\'s own origin is accepted', await send('POST', MODE, self), 200)
  check('POST from another site is refused', await send('POST', MODE, 'https://evil.example'), 403)
  check('POST with Origin: null is refused', await send('POST', MODE, 'null'), 403)
  check('POST from the same host on another port is refused', await send('POST', MODE, `http://127.0.0.1:${port + 1}`), 403)
  check('GET from another site is left alone', await send('GET', MODE, 'https://evil.example'), 200)

  // Refused before routing: this path is invalid, so a missing check would
  // answer 400 from the route and never reach the disk either way.
  check('the check runs ahead of every route', await send('POST', '/__api/strip-editor/create?path=nope', 'https://evil.example'), 403)
} finally {
  await server.close()
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS')
process.exit(failures ? 1 : 0)
