/** POST target for dev-server screenshot uploads (see `vite-plugin-datasource-api.ts`). */
export const SCREENSHOTS_UPLOAD_ENDPOINT = '/__api/datasource/screenshots'

export type ScreenshotUploadOptions = {
  /** Preset id → `datasource/screenshots/<bucket>/`; omit for flat legacy path. */
  bucket?: string
}

export async function uploadScreenshotBlob(
  blob: Blob,
  filenameHint?: string,
  options?: ScreenshotUploadOptions,
): Promise<string> {
  const form = new FormData()
  form.append('file', blob, filenameHint ?? 'upload.png')
  const q =
    options?.bucket !== undefined && options.bucket !== ''
      ? `?bucket=${encodeURIComponent(options.bucket)}`
      : ''
  const res = await fetch(`${SCREENSHOTS_UPLOAD_ENDPOINT}${q}`, {
    method: 'POST',
    body: form,
  })
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

export async function uploadScreenshotFile(
  file: File,
  options?: ScreenshotUploadOptions,
): Promise<string> {
  return uploadScreenshotBlob(file, file.name, options)
}
