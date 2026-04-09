import type { DisplayDocumentV1 } from '../types/displayDocument'
import {
  deleteDatasourceTemplate,
  fetchDatasourceTemplateDocument,
  fetchDatasourceTemplateList,
  putDatasourceTemplate,
} from './datasourceTemplatesApi'
import {
  appendLocalDesignTemplate,
  getLocalDesignTemplateDocument,
  listLocalDesignTemplates,
  removeLocalDesignTemplate,
} from './localDesignTemplates'

export type DesignTemplateSource = 'datasource' | 'local'

export interface DesignTemplateListItem {
  id: string
  name: string
  savedAt: string
  source: DesignTemplateSource
}

/**
 * Lists templates from `datasource/templates/` when the dev API is available; otherwise
 * browser-only templates from localStorage.
 */
export async function listDesignTemplates(): Promise<DesignTemplateListItem[]> {
  const remote = await fetchDatasourceTemplateList()
  if (remote !== null) {
    return remote.map((t) => ({ ...t, source: 'datasource' as const }))
  }
  return listLocalDesignTemplates().map((t) => ({
    id: t.id,
    name: t.name,
    savedAt: t.savedAt,
    source: 'local' as const,
  }))
}

export async function saveDesignTemplate(
  name: string,
  document: DisplayDocumentV1,
): Promise<{ item: DesignTemplateListItem; persistedTo: 'datasource' | 'local' }> {
  const trimmed = name.trim()
  if (!trimmed) {
    throw new Error('empty_name')
  }
  const put = await putDatasourceTemplate(trimmed, document)
  if (put) {
    return {
      item: {
        id: put.id,
        name: put.name,
        savedAt: put.savedAt,
        source: 'datasource',
      },
      persistedTo: 'datasource',
    }
  }
  const local = appendLocalDesignTemplate(trimmed, document)
  if (!local) {
    throw new Error('local_save_failed')
  }
  return {
    item: {
      id: local.id,
      name: local.name,
      savedAt: local.savedAt,
      source: 'local',
    },
    persistedTo: 'local',
  }
}

export async function loadDesignTemplateDocument(
  item: DesignTemplateListItem,
): Promise<DisplayDocumentV1 | null> {
  if (item.source === 'datasource') {
    return fetchDatasourceTemplateDocument(item.id)
  }
  return getLocalDesignTemplateDocument(item.id)
}

export async function deleteDesignTemplate(item: DesignTemplateListItem): Promise<boolean> {
  if (item.source === 'datasource') {
    return deleteDatasourceTemplate(item.id)
  }
  removeLocalDesignTemplate(item.id)
  return true
}
