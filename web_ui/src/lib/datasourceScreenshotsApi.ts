/** POST target for dev-server screenshot uploads (see `vite-plugin-datasource-api.ts`). */
export const SCREENSHOTS_UPLOAD_ENDPOINT = '/__api/datasource/screenshots'

export async function uploadScreenshotBlob(
  blob: Blob,
  filenameHint?: string,
): Promise<string> {
  const form = new FormData()
  form.append('file', blob, filenameHint ?? 'upload.png')
  const res = await fetch(SCREENSHOTS_UPLOAD_ENDPOINT, { method: 'POST', body: form })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(t || `Upload failed (${res.status})`)
  }
  const data = (await res.json()) as { url?: unknown }
  if (typeof data.url !== 'string' || !data.url.startsWith('/')) {
    throw new Error('Invalid upload response')
  }
  return data.url
}

export async function uploadScreenshotFile(file: File): Promise<string> {
  return uploadScreenshotBlob(file, file.name)
}
