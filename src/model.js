export const BOOK_COLORS = [
  { name: '민트', value: '#70c6a8' },
  { name: '하늘', value: '#6eb5e9' },
  { name: '노랑', value: '#efbd4f' },
  { name: '주황', value: '#ed8d5a' },
  { name: '분홍', value: '#e98caa' },
  { name: '보라', value: '#9d89d8' },
]

export const BOOK_EMOJIS = ['🦖', '⚽', '🚀', '🐞', '🧱', '🍳', '🐋', '🎨', '🔭', '💡']

export const BOOK_PATTERNS = [
  { id: 'scales', icon: '◉', label: '탐험 비늘', description: '겹겹이 이어지는 힘찬 무늬' },
  { id: 'stars', icon: '✦', label: '별자리', description: '별과 궤도가 반짝이는 무늬' },
  { id: 'waves', icon: '≈', label: '물결', description: '부드럽게 흐르는 물결무늬' },
  { id: 'map', icon: '⌁', label: '탐험 지도', description: '길과 지점을 잇는 지도 무늬' },
  { id: 'leaves', icon: '❧', label: '숲의 잎', description: '작은 잎이 자라나는 무늬' },
  { id: 'bolts', icon: 'ϟ', label: '에너지', description: '힘이 번쩍이는 번개 무늬' },
]

export function getBookPattern(book) {
  if (BOOK_PATTERNS.some((item) => item.id === book?.pattern)) return book.pattern
  const source = `${book?.name || ''}${book?.emoji || ''}${book?.id || ''}`
  const hash = [...source].reduce((total, char) => total + char.codePointAt(0), 0)
  return BOOK_PATTERNS[hash % BOOK_PATTERNS.length].id
}

export const STAMP_META = {
  drawing: { icon: '✏️', label: '직접 그렸어요' },
  photo: { icon: '📷', label: '사진으로 찾았어요' },
  book: { icon: '📚', label: '책에서 알았어요' },
  compare: { icon: '🔎', label: '비교해 봤어요' },
  ownWords: { icon: '💬', label: '내 말로 설명했어요' },
}

export function createId(prefix = 'id') {
  const random = globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)
  return `${prefix}-${random}`
}

export function deriveStamps(card) {
  const stamps = []
  if (card.artworkKinds?.includes('drawing')) stamps.push('drawing')
  if (card.artworkKinds?.includes('photo')) stamps.push('photo')
  if (card.sourceType === 'book') stamps.push('book')
  if (card.confusing?.trim()) stamps.push('compare')
  if (card.fact1?.trim()) stamps.push('ownWords')
  return stamps
}

export function validateCard(card) {
  const errors = {}
  if (!card.hasArtwork || !card.artwork?.startsWith('data:image/')) errors.artwork = '그림이나 사진을 먼저 넣어 주세요.'
  if (!card.name?.trim()) errors.name = '카드 이름을 써 주세요.'
  if (!card.fact1?.trim()) errors.fact1 = '가장 중요한 사실을 하나 써 주세요.'
  return errors
}

export function unlockedDecorations(count) {
  return {
    ribbon: count >= 3,
    sticker: count >= 5,
    shimmer: count >= 10,
    next: count < 3 ? 3 : count < 5 ? 5 : count < 10 ? 10 : null,
  }
}

export function nextSerial(cards, bookId) {
  return cards.filter((card) => card.bookId === bookId).reduce((max, card) => Math.max(max, Number(card.serial) || 0), 0) + 1
}

const LEGACY_FIELDS = ['과학', '역사', '운동', '음식', '동물·곤충', '수학', '만들기', '기타']

export function migrateLegacyCards(records, now = Date.now()) {
  if (!Array.isArray(records)) return { books: [], cards: [] }
  const books = []
  const cards = []
  const bookByName = new Map()
  records.forEach((record, index) => {
    const legacy = record?.s || {}
    const customBook = String(legacy.book || '').trim()
    const fieldName = LEGACY_FIELDS[Number(legacy.f)] || '나의 발견'
    const bookName = customBook && customBook !== '나의 도감' ? customBook : `${fieldName} 도감`
    let book = bookByName.get(bookName)
    if (!book) {
      book = {
        id: createId('book'),
        name: bookName,
        color: BOOK_COLORS[books.length % BOOK_COLORS.length].value,
        emoji: BOOK_EMOJIS[books.length % BOOK_EMOJIS.length],
        pattern: BOOK_PATTERNS[books.length % BOOK_PATTERNS.length].id,
        coverImage: '',
        createdAt: now + books.length,
      }
      books.push(book)
      bookByName.set(bookName, book)
    }
    const facts = Array.isArray(legacy.facts) ? legacy.facts : []
    const card = {
      id: createId('card'),
      bookId: book.id,
      serial: cards.filter((item) => item.bookId === book.id).length + 1,
      name: String(legacy.name || '이름 없는 카드'),
      artwork: String(record?.p || ''),
      hasArtwork: Boolean(record?.p),
      artworkKinds: record?.p ? ['photo'] : [],
      fact1: String(facts[0] || ''),
      fact2: String(facts[1] || ''),
      fact3: String(facts[2] || ''),
      confusing: String(legacy.trap || ''),
      sourceType: 'other',
      sourceNote: '이전 관심사 카드 도감에서 가져옴',
      stamps: record?.p ? ['photo', 'ownWords'] : ['ownWords'],
      createdAt: Number(record?.id) || now + index,
      updatedAt: now,
    }
    cards.push(card)
  })
  return { books, cards }
}

export function makeBackup(books, cards) {
  return {
    format: 'lumloom-interest-atlas',
    version: 1,
    exportedAt: new Date().toISOString(),
    books,
    cards,
  }
}

export function parseBackup(value) {
  const data = typeof value === 'string' ? JSON.parse(value) : value
  if (data?.format !== 'lumloom-interest-atlas' || data?.version !== 1) {
    throw new Error('모아모아 백업 파일이 아니에요.')
  }
  if (!Array.isArray(data.books) || !Array.isArray(data.cards)) {
    throw new Error('백업 파일 안의 책이나 카드 정보가 올바르지 않아요.')
  }
  const bookIds = new Set(data.books.map((book) => book.id))
  if (data.cards.some((card) => !bookIds.has(card.bookId))) {
    throw new Error('소속된 책을 찾을 수 없는 카드가 있어요.')
  }
  return { books: data.books, cards: data.cards }
}
