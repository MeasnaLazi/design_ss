import { parseDisplayDocument } from '../canvas/parseDisplayDocument'
import type { DisplayDocumentV1 } from '../types/displayDocument'

const STORAGE_KEY = 'apps_publisher_local_design_templates_v1'
const MAX_TEMPLATES = 40
const MAX_NAME_LENGTH = 120

interface StorageV1 {
  version: 1
  templates: StoredTemplateRow[]
}

interface StoredTemplateRow {
  id: string
  name: string
  savedAt: string
  document: DisplayDocumentV1
}

export interface LocalDesignTemplateListItem {
  id: string
  name: string
  savedAt: string
}

function emptyStorage(): StorageV1 {
  return { version: 1, templates: [] }
}

function readRaw(): StorageV1 {
  if (typeof localStorage === 'undefined') return emptyStorage()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyStorage()
    const parsed: unknown = JSON.parse(raw)
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      (parsed as StorageV1).version !== 1 ||
      !Array.isArray((parsed as StorageV1).templates)
    ) {
      return emptyStorage()
    }
    return parsed as StorageV1
  } catch {
    return emptyStorage()
  }
}

function writeRaw(data: StorageV1): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch (e) {
    console.warn('[localDesignTemplates] write failed', e)
  }
}

/** User-facing list entries (no full document). */
export function listLocalDesignTemplates(): LocalDesignTemplateListItem[] {
  return readRaw().templates.map(({ id, name, savedAt }) => ({ id, name, savedAt }))
}

/** Returns a validated document ready for {@link loadDisplayDocumentIntoCanvas}, or null if missing/invalid. */
export function getLocalDesignTemplateDocument(id: string): DisplayDocumentV1 | null {
  const row = readRaw().templates.find((t) => t.id === id)
  if (!row) return null
  try {
    return parseDisplayDocument(row.document as unknown)
  } catch (e) {
    console.warn('[localDesignTemplates] corrupt template', id, e)
    return null
  }
}

export function appendLocalDesignTemplate(
  name: string,
  doc: DisplayDocumentV1,
): LocalDesignTemplateListItem | null {
  const trimmed = name.trim()
  if (!trimmed) return null
  const storage = readRaw()
  const entry: StoredTemplateRow = {
    id: crypto.randomUUID(),
    name: trimmed.slice(0, MAX_NAME_LENGTH),
    savedAt: new Date().toISOString(),
    document: JSON.parse(JSON.stringify(doc)) as DisplayDocumentV1,
  }
  const next: StorageV1 = {
    version: 1,
    templates: [entry, ...storage.templates].slice(0, MAX_TEMPLATES),
  }
  writeRaw(next)
  return { id: entry.id, name: entry.name, savedAt: entry.savedAt }
}

export function removeLocalDesignTemplate(id: string): void {
  const storage = readRaw()
  writeRaw({
    version: 1,
    templates: storage.templates.filter((t) => t.id !== id),
  })
}
