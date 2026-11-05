import { migrateLegacyCards } from './model.js'

const DB_NAME = 'interest-atlas-db'
const DB_VERSION = 1
let connection

function openDb() {
  if (connection) return connection
  connection = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains('books')) db.createObjectStore('books', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('cards')) {
        const cards = db.createObjectStore('cards', { keyPath: 'id' })
        cards.createIndex('bookId', 'bookId')
      }
      if (!db.objectStoreNames.contains('drafts')) db.createObjectStore('drafts', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  return connection
}

function requestPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function store(name, mode = 'readonly') {
  const db = await openDb()
  return db.transaction(name, mode).objectStore(name)
}

export async function getAll(name) {
  return requestPromise((await store(name)).getAll())
}

export async function put(name, value) {
  return requestPromise((await store(name, 'readwrite')).put(value))
}

export async function remove(name, key) {
  return requestPromise((await store(name, 'readwrite')).delete(key))
}

export async function removeBook(bookId) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['books', 'cards', 'drafts'], 'readwrite')
    transaction.objectStore('books').delete(bookId)
    transaction.objectStore('drafts').delete(`draft-${bookId}`)

    const cardIndex = transaction.objectStore('cards').index('bookId')
    const cursorRequest = cardIndex.openKeyCursor(IDBKeyRange.only(bookId))
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result
      if (!cursor) return
      transaction.objectStore('cards').delete(cursor.primaryKey)
      cursor.continue()
    }

    transaction.oncomplete = resolve
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
}

export async function get(name, key) {
  return requestPromise((await store(name)).get(key))
}

export async function replaceLibrary(books, cards) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['books', 'cards', 'drafts'], 'readwrite')
    const bookStore = transaction.objectStore('books')
    const cardStore = transaction.objectStore('cards')
    bookStore.clear()
    cardStore.clear()
    transaction.objectStore('drafts').clear()
    books.forEach((book) => bookStore.put(book))
    cards.forEach((card) => cardStore.put(card))
    transaction.oncomplete = resolve
    transaction.onerror = () => reject(transaction.error)
  })
}

export async function migrateLegacyIfNeeded() {
  const state = await get('settings', 'legacy-migration')
  if (state?.done) return { imported: 0 }
  let legacy = []
  try {
    legacy = JSON.parse(localStorage.getItem('dogam:v1') || '[]')
  } catch {
    legacy = []
  }
  const migrated = migrateLegacyCards(legacy)
  for (const book of migrated.books) await put('books', book)
  for (const card of migrated.cards) await put('cards', card)
  await put('settings', { key: 'legacy-migration', done: true, imported: migrated.cards.length, at: Date.now() })
  return { imported: migrated.cards.length }
}
