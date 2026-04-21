const DB_NAME = 'apps_publisher_custom_fonts'
const DB_VERSION = 1
const STORE = 'fonts'

export interface CustomFontStoredRecord {
  id: string
  /** Unique CSS `font-family` value passed to Fabric. */
  familyName: string
  /** Display name in UI (usually original filename). */
  label: string
  mimeType: string
  createdAt: number
  data: ArrayBuffer
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'))
    req.onsuccess = () => resolve(req.result)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' })
      }
    }
  })
}

export async function idbListCustomFonts(): Promise<CustomFontStoredRecord[]> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const store = tx.objectStore(STORE)
    const req = store.getAll()
    req.onerror = () => reject(req.error ?? new Error('getAll failed'))
    req.onsuccess = () => resolve((req.result as CustomFontStoredRecord[]) ?? [])
    tx.oncomplete = () => db.close()
  })
}

export async function idbPutCustomFont(record: CustomFontStoredRecord): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.onerror = () => reject(tx.error ?? new Error('put transaction failed'))
    tx.oncomplete = () => {
      db.close()
      resolve()
    }
    tx.objectStore(STORE).put(record)
  })
}

export async function idbDeleteCustomFont(id: string): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.onerror = () => reject(tx.error ?? new Error('delete transaction failed'))
    tx.oncomplete = () => {
      db.close()
      resolve()
    }
    tx.objectStore(STORE).delete(id)
  })
}
