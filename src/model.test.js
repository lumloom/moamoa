import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { deriveStamps, getBookPattern, makeBackup, migrateLegacyCards, parseBackup, unlockedDecorations, validateCard } from './model.js'

describe('card rules', () => {
  it('requires artwork, a name, and one fact only', () => {
    assert.deepEqual(Object.keys(validateCard({})), ['artwork', 'name', 'fact1'])
    assert.deepEqual(validateCard({ hasArtwork: true, artwork: 'data:image/jpeg;base64,x', name: '고래', fact1: '고래는 포유류다.' }), {})
  })

  it('derives discovery stamps from what the child did', () => {
    assert.deepEqual(deriveStamps({ artworkKinds: ['drawing', 'photo'], sourceType: 'book', confusing: '상어와 다르다', fact1: '숨을 쉰다' }), ['drawing', 'photo', 'book', 'compare', 'ownWords'])
  })

  it('unlocks decorations at 3, 5, and 10 cards', () => {
    assert.deepEqual({ ribbon: unlockedDecorations(2).ribbon, next: unlockedDecorations(2).next }, { ribbon: false, next: 3 })
    assert.deepEqual(unlockedDecorations(5), { ribbon: true, sticker: true, shimmer: false, next: 10 })
    assert.deepEqual(unlockedDecorations(10), { ribbon: true, sticker: true, shimmer: true, next: null })
  })

  it('keeps a chosen card pattern and gives older books a stable fallback', () => {
    assert.equal(getBookPattern({ pattern: 'stars' }), 'stars')
    assert.equal(getBookPattern({ id: 'old-book', name: '공룡 도감', emoji: '🦖' }), getBookPattern({ id: 'old-book', name: '공룡 도감', emoji: '🦖' }))
  })
})

describe('data portability', () => {
  it('keeps Korean text through backup parsing', () => {
    const books = [{ id: 'b1', name: '공룡 도감' }]
    const cards = [{ id: 'c1', bookId: 'b1', fact1: '백악기에 살았다.' }]
    assert.deepEqual(parseBackup(JSON.stringify(makeBackup(books, cards))), { books, cards })
  })

  it('rejects malformed and orphaned backups', () => {
    assert.throws(() => parseBackup('{}'), /백업 파일/)
    assert.throws(() => parseBackup({ format: 'lumloom-interest-atlas', version: 1, books: [], cards: [{ id: 'x', bookId: 'missing' }] }), /소속된 책/)
  })

  it('groups legacy default-book cards by their old field', () => {
    const legacy = [
      { id: 1, p: 'data:image/jpeg;base64,a', s: { name: '개미', f: 4, book: '나의 도감', facts: ['다리가 여섯 개다'] } },
      { id: 2, p: 'data:image/jpeg;base64,b', s: { name: '나비', f: 4, book: '나의 도감', facts: ['날개가 있다'] } },
      { id: 3, p: 'data:image/jpeg;base64,c', s: { name: '화성', f: 0, book: '우주 도감', facts: ['붉게 보인다'] } },
    ]
    const result = migrateLegacyCards(legacy, 100)
    assert.deepEqual(result.books.map((book) => book.name), ['동물·곤충 도감', '우주 도감'])
    assert.equal(result.cards.length, 3)
    assert.equal(result.cards[0].bookId, result.cards[1].bookId)
  })
})
