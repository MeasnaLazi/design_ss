import { parseDisplayDocument } from '../canvas/parseDisplayDocument'
import type { DisplayDocumentV1 } from '../types/displayDocument'

const ENDPOINT = '/__api/datasource/templates'

export interface DatasourceTemplateListRow {
  id: string
  name: string
  savedAt: string
}

export async function fetchDatasourceTemplateList(): Promise<DatasourceTemplateListRow[] | null> {
  try {
    const res = await fetch(ENDPOINT)
    if (!res.ok) return null
    const data = (await res.json()) as { templates?: unknown }
    if (!data || typeof data !== 'object' || !Array.isArray(data.templates)) return null
    const out: DatasourceTemplateListRow[] = []
    for (const row of data.templates) {
      if (
        row &&
        typeof row === 'object' &&
        typeof (row as { id?: unknown }).id === 'string' &&
        typeof (row as { name?: unknown }).name === 'string' &&
        typeof (row as { savedAt?: unknown }).savedAt === 'string'
      ) {
        out.push({
          id: (row as { id: string }).id,
          name: (row as { name: string }).name,
          savedAt: (row as { savedAt: string }).savedAt,
        })
      }
    }
    return out
  } catch {
    return null
  }
}

export async function fetchDatasourceTemplateDocument(
  id: string,
): Promise<DisplayDocumentV1 | null> {
  try {
    const res = await fetch(`${ENDPOINT}?id=${encodeURIComponent(id)}`)
    if (!res.ok) return null
    const raw: unknown = await res.json()
    if (!raw || typeof raw !== 'object') return null
    const doc = (raw as { document?: unknown }).document
    if (doc === null || typeof doc !== 'object') return null
    return parseDisplayDocument(doc)
  } catch {
    return null
  }
}

export async function putDatasourceTemplate(
  name: string,
  document: DisplayDocumentV1,
): Promise<{ id: string; name: string; savedAt: string } | null> {
  try {
    const res = await fetch(ENDPOINT, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, document }),
    })
    if (!res.ok) {
      const t = await res.text()
      console.warn('[datasourceTemplates] PUT failed', res.status, t)
      return null
    }
    const data = (await res.json()) as {
      ok?: unknown
      id?: unknown
      name?: unknown
      savedAt?: unknown
    }
    if (
      data.ok !== true ||
      typeof data.id !== 'string' ||
      typeof data.name !== 'string' ||
      typeof data.savedAt !== 'string'
    ) {
      return null
    }
    return { id: data.id, name: data.name, savedAt: data.savedAt }
  } catch (e) {
    console.warn('[datasourceTemplates] PUT error', e)
    return null
  }
}

export async function deleteDatasourceTemplate(id: string): Promise<boolean> {
  try {
    const res = await fetch(`${ENDPOINT}?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })
    return res.ok
  } catch {
    return false
  }
}
