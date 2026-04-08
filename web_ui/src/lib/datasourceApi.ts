import type { DisplayDocumentV1 } from '../types/displayDocument'

const DISPLAY_ENDPOINT = '/__api/datasource/display'

export async function putDisplayDocument(doc: DisplayDocumentV1): Promise<void> {
  const res = await fetch(DISPLAY_ENDPOINT, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(doc, null, 2),
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(t || `Save failed (${res.status})`)
  }
}

export async function fetchDisplayDocument(): Promise<unknown> {
  const res = await fetch(DISPLAY_ENDPOINT)
  if (!res.ok) {
    const t = await res.text()
    throw new Error(t || `Load failed (${res.status})`)
  }
  return res.json() as Promise<unknown>
}
