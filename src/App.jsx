import { useEffect, useMemo, useRef, useState } from 'react'
import JSZip from 'jszip'
import DrawingPad from './components/DrawingPad.jsx'
import { downloadCanvas, renderCard } from './card-renderer.js'
import { get, getAll, migrateLegacyIfNeeded, put, remove, removeBook, replaceLibrary } from './db.js'
import {
  BOOK_COLORS,
  BOOK_EMOJIS,
  BOOK_PATTERNS,
  STAMP_META,
  createId,
  deriveStamps,
  makeBackup,
  nextSerial,
  parseBackup,
  getBookPattern,
  unlockedDecorations,
  validateCard,
} from './model.js'

const emptyDraft = (bookId) => ({
  id: `draft-${bookId}`,
  bookId,
  editCardId: null,
  name: '',
  artwork: '',
  artworkKinds: [],
  hasArtwork: false,
  fact1: '',
  fact2: '',
  fact3: '',
  confusing: '',
  sourceType: 'none',
  sourceNote: '',
  step: 1,
  updatedAt: Date.now(),
})

function Icon({ children }) {
  return <span aria-hidden="true">{children}</span>
}

function App() {
  const [books, setBooks] = useState([])
  const [cards, setCards] = useState([])
  const [view, setView] = useState({ name: 'shelf' })
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')
  const [showBookForm, setShowBookForm] = useState(false)
  const [editingBook, setEditingBook] = useState(null)
  const [showDataTools, setShowDataTools] = useState(false)
  const [downloadingBookId, setDownloadingBookId] = useState(null)
  const [selectedCard, setSelectedCard] = useState(null)
  const [celebration, setCelebration] = useState(null)
  const [confirmAction, setConfirmAction] = useState(null)
  const [openingBook, setOpeningBook] = useState(null)

  const refresh = async () => {
    const [nextBooks, nextCards] = await Promise.all([getAll('books'), getAll('cards')])
    nextBooks.sort((a, b) => a.createdAt - b.createdAt)
    nextCards.sort((a, b) => a.createdAt - b.createdAt)
    setBooks(nextBooks)
    setCards(nextCards)
  }

  useEffect(() => {
    ;(async () => {
      try {
        const migration = await migrateLegacyIfNeeded()
        await refresh()
        if (migration.imported) setNotice(`예전 카드 ${migration.imported}장을 새 책장으로 옮겼어요!`)
      } catch (error) {
        console.error(error)
        setNotice('저장 공간을 여는 데 문제가 생겼어요. 브라우저의 저장 허용을 확인해 주세요.')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const currentBook = books.find((book) => book.id === view.bookId)
  const currentCards = cards.filter((card) => card.bookId === view.bookId)

  useEffect(() => {
    if (!openingBook) return undefined
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previousOverflow }
  }, [openingBook])

  const openBook = (book, origin) => {
    if (openingBook) return
    setOpeningBook({ book, origin })
  }

  const completeBookOpening = () => {
    if (!openingBook) return
    const bookId = openingBook.book.id
    setOpeningBook(null)
    setView({ name: 'book', bookId })
    window.scrollTo({ top: 0 })
  }
  const goShelf = () => {
    setSelectedCard(null)
    setView({ name: 'shelf' })
  }

  const saveBook = async (book) => {
    try {
      await put('books', book)
      await refresh()
      setShowBookForm(false)
      setEditingBook(null)
      setNotice(editingBook ? `『${book.name}』 도감을 새 모습으로 고쳤어요.` : `『${book.name}』을 책장에 꽂았어요.`)
    } catch {
      setNotice('책을 저장하지 못했어요. 저장 공간을 확인해 주세요.')
    }
  }

  const openEditor = async (bookId, card = null) => {
    if (card) {
      const draft = { ...card, id: `draft-${bookId}`, editCardId: card.id, step: 1 }
      await put('drafts', draft)
    }
    setSelectedCard(null)
    setView({ name: 'editor', bookId, editCardId: card?.id || null })
  }

  const completeCard = async (card) => {
    try {
      await put('cards', card)
      await remove('drafts', `draft-${card.bookId}`)
      await refresh()
      setCelebration(card)
      setView({ name: 'book', bookId: card.bookId })
    } catch {
      setNotice('카드를 저장하지 못했어요. 작성 내용은 임시 저장되어 있으니 저장 공간을 확인해 주세요.')
    }
  }

  const duplicateCard = async (card) => {
    const copy = {
      ...card,
      id: createId('card'),
      serial: nextSerial(cards, card.bookId),
      name: `${card.name} 복사본`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    await put('cards', copy)
    await refresh()
    setSelectedCard(copy)
    setNotice('카드를 한 장 더 만들었어요. 복사본을 고쳐서 새 발견으로 바꿔 보세요.')
  }

  const deleteCard = (card) => setConfirmAction({
    title: `『${card.name}』 카드를 지울까요?`,
    message: '지운 카드는 되돌릴 수 없어요. 전체 백업이 있다면 다시 가져올 수 있어요.',
    confirmLabel: '카드 지우기',
    run: async () => {
      await remove('cards', card.id)
      await refresh()
      setSelectedCard(null)
      setConfirmAction(null)
      setNotice('카드를 도감에서 꺼냈어요.')
    },
  })

  const deleteBook = (book) => {
    const bookCards = cards.filter((card) => card.bookId === book.id)
    setShowBookForm(false)
    setEditingBook(null)
    setConfirmAction({
      title: `『${book.name}』 도감을 지울까요?`,
      message: bookCards.length
        ? `이 도감과 안에 있는 카드 ${bookCards.length}장이 모두 사라져요. 지운 뒤에는 되돌릴 수 없어요.`
        : '이 도감이 책장에서 사라져요. 지운 뒤에는 되돌릴 수 없어요.',
      confirmLabel: '도감 지우기',
      run: async () => {
        try {
          await removeBook(book.id)
          await refresh()
          setSelectedCard(null)
          setCelebration(null)
          setView({ name: 'shelf' })
          setConfirmAction(null)
          setNotice(`『${book.name}』 도감을 책장에서 지웠어요.`)
        } catch {
          setConfirmAction(null)
          setNotice('도감을 지우지 못했어요. 저장 공간을 확인해 주세요.')
        }
      },
    })
  }

  const exportBackup = () => {
    const blob = new Blob([JSON.stringify(makeBackup(books, cards), null, 2)], { type: 'application/json' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `모아모아-백업-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    setTimeout(() => URL.revokeObjectURL(link.href), 1000)
    setNotice('책장 전체를 백업 파일로 저장했어요.')
  }

  const importBackup = async (file) => {
    if (!file) return
    try {
      const parsed = parseBackup(await file.text())
      setConfirmAction({
        title: '백업한 책장으로 바꿀까요?',
        message: `책 ${parsed.books.length}권과 카드 ${parsed.cards.length}장을 가져옵니다. 지금 책장은 선택한 백업 내용으로 바뀌어요.`,
        confirmLabel: '백업 가져오기',
        run: async () => {
          await replaceLibrary(parsed.books, parsed.cards)
          await refresh()
          setConfirmAction(null)
          setView({ name: 'shelf' })
          setNotice('백업한 책장을 그대로 복원했어요!')
        },
      })
    } catch (error) {
      setNotice(error.message || '백업 파일을 읽지 못했어요.')
    }
  }

  const downloadCard = async (card) => {
    const book = books.find((item) => item.id === card.bookId)
    const canvas = await renderCard(card, book)
    downloadCanvas(canvas, `${book?.name || '도감'}-${String(card.serial).padStart(3, '0')}-${card.name}.png`)
  }

  const downloadBookCards = async (book) => {
    const bookCards = cards.filter((card) => card.bookId === book.id).sort((a, b) => a.serial - b.serial)
    if (!bookCards.length) return setNotice('먼저 카드 한 장을 만들어 주세요.')
    setDownloadingBookId(book.id)
    setNotice(`『${book.name}』 카드 ${bookCards.length}장을 그림으로 만드는 중이에요...`)
    try {
      const zip = new JSZip()
      for (const card of bookCards) {
        const canvas = await renderCard(card, book)
        const blob = await new Promise((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('이미지 만들기 실패')), 'image/png'))
        const safeName = `${String(card.serial).padStart(3, '0')}-${card.name}`.replace(/[\\/:*?"<>|]/g, '-').slice(0, 80)
        zip.file(`${safeName}.png`, blob)
      }
      const blob = await zip.generateAsync({ type: 'blob' })
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = `${book.name.replace(/[\\/:*?"<>|]/g, '-')}-카드-${new Date().toISOString().slice(0, 10)}.zip`
      link.click()
      setTimeout(() => URL.revokeObjectURL(link.href), 1000)
      setNotice(`『${book.name}』 카드 ${bookCards.length}장을 ZIP으로 저장했어요.`)
    } catch (error) {
      console.error(error)
      setNotice('카드 그림을 묶는 중 문제가 생겼어요. 다시 시도해 주세요.')
    } finally {
      setDownloadingBookId(null)
    }
  }

  if (loading) return <main className="loading-screen"><div className="loading-book">📖</div><p>책장을 펼치는 중...</p></main>

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand-button" onClick={goShelf} aria-label="내 책장으로 가기">
          <span className="brand-mark">모</span>
          <span><strong>모아모아</strong><small>좋아하는 것을 발견하는 책장</small></span>
        </button>
        <div className="top-actions"><button className="header-button" onClick={() => setShowDataTools(true)}><Icon>⚙</Icon> 데이터 보관</button></div>
      </header>

      {notice && <div className="notice" role="status"><span>{notice}</span><button onClick={() => setNotice('')} aria-label="알림 닫기">×</button></div>}

      {view.name === 'shelf' && <Shelf books={books} cards={cards} onOpen={openBook} onCreate={() => { setEditingBook(null); setShowBookForm(true) }} />}
      {view.name === 'book' && currentBook && (
        <BookView
          book={currentBook}
          cards={currentCards}
          onBack={goShelf}
          onNew={() => openEditor(currentBook.id)}
          onCard={setSelectedCard}
          onEdit={() => { setEditingBook(currentBook); setShowBookForm(true) }}
          onDownload={() => downloadBookCards(currentBook)}
          downloading={downloadingBookId === currentBook.id}
        />
      )}
      {view.name === 'editor' && currentBook && (
        <CardEditor
          key={`${view.bookId}-${view.editCardId || 'new'}`}
          book={currentBook}
          cards={cards}
          editCard={cards.find((card) => card.id === view.editCardId)}
          onCancel={() => setView({ name: 'book', bookId: currentBook.id })}
          onComplete={completeCard}
        />
      )}

      {showBookForm && <BookForm initialBook={editingBook} onClose={() => { setShowBookForm(false); setEditingBook(null) }} onSave={saveBook} onDelete={deleteBook} />}
      {showDataTools && <DataTools onClose={() => setShowDataTools(false)} onExport={exportBackup} onImport={importBackup} />}
      {selectedCard && (
        <CardDetail
          card={selectedCard}
          book={books.find((book) => book.id === selectedCard.bookId)}
          onClose={() => setSelectedCard(null)}
          onEdit={() => openEditor(selectedCard.bookId, selectedCard)}
          onDuplicate={() => duplicateCard(selectedCard)}
          onDownload={() => downloadCard(selectedCard)}
          onDelete={() => deleteCard(selectedCard)}
        />
      )}
      {celebration && (
        <Celebration card={celebration} book={books.find((book) => book.id === celebration.bookId)} onClose={() => setCelebration(null)} />
      )}
      {confirmAction && <ConfirmDialog {...confirmAction} onCancel={() => setConfirmAction(null)} />}
      {openingBook && <BookOpeningTransition {...openingBook} onComplete={completeBookOpening} />}
    </div>
  )
}

function BookCoverFace({ book, count, decorations, className = '' }) {
  return (
    <div className={`book-face ${decorations.shimmer ? 'shimmer' : ''} ${className}`}>
      <div className="book-face-spine" />
      {book.coverImage ? <img src={book.coverImage} alt="" /> : <span className="book-face-emoji">{book.emoji}</span>}
      {decorations.ribbon && <span className="cover-ribbon">발견</span>}
      {decorations.sticker && <span className="cover-sticker">★</span>}
      <div className="book-face-title"><strong>{book.name}</strong>{count !== '' && <small>{count}장의 카드</small>}</div>
    </div>
  )
}

function BookOpeningTransition({ book, origin, onComplete }) {
  const style = {
    '--book-color': book.color,
    '--travel-x': `${origin.left + origin.width / 2 - window.innerWidth / 2}px`,
    '--travel-y': `${origin.top + origin.height / 2 - window.innerHeight / 2}px`,
  }

  return (
    <div className="book-opening-transition" aria-hidden="true" style={style}>
      <div
        className="book-opening-stage"
        onAnimationEnd={(event) => event.currentTarget === event.target && onComplete()}
      >
        <div className="opening-book-model">
          <div className="opening-book-back" />
          <div className="opening-book-pages">
            <div className="opening-page opening-page-left"><span>{book.emoji}</span><small>모아모아</small></div>
            <div className="opening-page opening-page-right"><strong>{book.name}</strong><i /></div>
          </div>
          <div className="opening-book-cover">
            <BookCoverFace book={book} count="" decorations={{ ribbon: false, sticker: false, shimmer: false }} className="transition-cover-face" />
          </div>
        </div>
      </div>
    </div>
  )
}

function Shelf({ books, cards, onOpen, onCreate }) {
  return (
    <main className="page shelf-page">
      <section className="hero">
        <div>
          <p className="eyebrow">오늘의 작은 발견</p>
          <h1>좋아하는 것들이<br /><em>한 권의 책</em>이 돼요.</h1>
          <p>그림을 그리고, 사진을 찍고, 알아낸 것을 카드로 모아 보세요.</p>
        </div>
        <button className="primary-button hero-button" onClick={onCreate}><Icon>＋</Icon> 새 도감 만들기</button>
      </section>
      <section className="shelf-section">
        <div className="section-heading">
          <div><p className="eyebrow">차곡차곡 모은 도감</p><h2>내 책장</h2></div>
          <span>{books.length}권 · {cards.length}장의 발견</span>
        </div>
        <div className={`bookshelf-frame ${books.length ? '' : 'is-empty'}`}>
          <div className="bookshelf" aria-label="나의 도감 책꽂이">
            {books.map((book, index) => {
              const bookCards = cards.filter((card) => card.bookId === book.id)
              const decorations = unlockedDecorations(bookCards.length)
              return (
                <button
                  className="book-item"
                  key={book.id}
                  aria-label={`${book.name}, 카드 ${bookCards.length}장, 책 펼치기`}
                  onClick={(event) => onOpen(book, event.currentTarget.querySelector('.shelf-book-spine').getBoundingClientRect())}
                  style={{ '--book-color': book.color, '--book-height': `${204 + (index % 4) * 10}px` }}
                >
                  <div className="shelf-book-stage">
                    <div className={`shelf-book-spine ${decorations.shimmer ? 'shimmer' : ''}`}>
                      <span className="spine-emblem">{book.emoji}</span>
                      <strong>{book.name}</strong>
                      <small>{bookCards.length}</small>
                      {decorations.sticker && <i>★</i>}
                    </div>
                    <div className="book-preview" aria-hidden="true">
                      <BookCoverFace book={book} count={bookCards.length} decorations={decorations} />
                    </div>
                  </div>
                </button>
              )
            })}
            <button className="empty-book" onClick={onCreate} aria-label="새 도감 만들기"><span>＋</span><strong>새 도감</strong><small>만들기</small></button>
            {!books.length && <div className="shelf-empty-message"><strong>첫 번째 도감을 기다리는 책꽂이</strong><span>좋아하는 것의 이름으로 책 한 권을 만들어 보세요.</span></div>}
          </div>
        </div>
      </section>
    </main>
  )
}

function BookView({ book, cards, onBack, onNew, onCard, onEdit, onDownload, downloading }) {
  const decorations = unlockedDecorations(cards.length)
  const remaining = decorations.next ? decorations.next - cards.length : 0
  return (
    <main className="page book-page" style={{ '--book-color': book.color }}>
      <button className="back-button" onClick={onBack}>← 내 책장</button>
      <section className="book-banner">
        <div className="banner-icon">{book.coverImage ? <img src={book.coverImage} alt="" /> : book.emoji}</div>
        <div className="banner-copy">
          <p className="eyebrow">모아모아</p>
          <h1>{book.name}</h1>
          <p>{cards.length ? `${cards.length}개의 발견이 이 책에서 반짝이고 있어요.` : '첫 번째 발견을 기다리고 있어요.'}</p>
        </div>
        <div className="book-actions">
          <button className="secondary-button" onClick={onEdit}>✎ 도감 꾸미기</button>
          <button className="secondary-button" onClick={onDownload} disabled={!cards.length || downloading}>{downloading ? '그림 만드는 중...' : '↓ 카드 전체 받기'}</button>
          <button className="primary-button" onClick={onNew}>＋ 새 카드 발견하기</button>
        </div>
      </section>
      <div className="milestone-strip">
        <div className="milestone-track"><span style={{ width: `${Math.min(100, cards.length / 10 * 100)}%` }} /></div>
        <div><strong>{cards.length >= 10 ? '모든 표지 장식을 모았어요! ✨' : `${decorations.next}장 표지 장식까지 ${remaining}장`}</strong><small>3장 리본 · 5장 별 스티커 · 10장 반짝이 표지</small></div>
      </div>
      {cards.length ? (
        <section className="card-grid" aria-label={`${book.name} 카드 목록`}>
          {cards.slice().reverse().map((card) => <CardTile key={card.id} card={card} book={book} onClick={() => onCard(card)} />)}
          <button className="new-card-tile" onClick={onNew}><span>＋</span><strong>새 발견 추가하기</strong></button>
        </section>
      ) : (
        <section className="empty-book-page">
          <div className="spark-orbit">✦<span>✧</span></div>
          <h2>이 도감의 첫 장을 채워 볼까요?</h2>
          <p>사진을 찍어도 좋고, 손가락이나 펜으로 직접 그려도 좋아요.</p>
          <button className="primary-button" onClick={onNew}>첫 카드 만들기</button>
        </section>
      )}
    </main>
  )
}

function CardTile({ card, book, onClick }) {
  const pattern = getBookPattern(book)
  return (
    <button className={`card-tile patterned-card pattern-${pattern}`} onClick={onClick} style={{ '--book-color': book.color }}>
      <div className="card-energy"><span>{book.emoji}</span><b>발견 기록</b><i>{BOOK_PATTERNS.find((item) => item.id === pattern)?.icon}</i></div>
      <div className="tile-art"><img src={card.artwork} alt={`${card.name} 그림`} /><span>No. {String(card.serial).padStart(3, '0')}</span></div>
      <div className="tile-copy"><strong>{card.name}</strong><p><small>한 줄 발견</small>{card.fact1}</p></div>
      <div className="tile-stamps">{card.stamps?.slice(0, 3).map((stamp) => <span key={stamp} title={STAMP_META[stamp]?.label}>{STAMP_META[stamp]?.icon}</span>)}</div>
    </button>
  )
}

function BookForm({ initialBook, onClose, onSave, onDelete }) {
  const [name, setName] = useState(initialBook?.name || '')
  const [color, setColor] = useState(initialBook?.color || BOOK_COLORS[0].value)
  const [emoji, setEmoji] = useState(initialBook?.emoji || BOOK_EMOJIS[0])
  const [pattern, setPattern] = useState(getBookPattern(initialBook || {}))
  const [coverImage, setCoverImage] = useState(initialBook?.coverImage || '')
  const [error, setError] = useState('')

  const photo = (file) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const image = new Image()
      image.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = 500
        canvas.height = 500
        const ctx = canvas.getContext('2d')
        const scale = Math.max(500 / image.width, 500 / image.height)
        const width = image.width * scale
        const height = image.height * scale
        ctx.drawImage(image, (500 - width) / 2, (500 - height) / 2, width, height)
        setCoverImage(canvas.toDataURL('image/jpeg', .82))
      }
      image.src = reader.result
    }
    reader.readAsDataURL(file)
  }

  const submit = () => {
    if (!name.trim()) return setError('도감 이름을 써 주세요.')
    onSave({ id: initialBook?.id || createId('book'), name: name.trim(), color, emoji, pattern, coverImage, createdAt: initialBook?.createdAt || Date.now() })
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal book-form" role="dialog" aria-modal="true" aria-labelledby="new-book-title">
        <button className="modal-close" onClick={onClose} aria-label="닫기">×</button>
        <p className="eyebrow">{initialBook ? '도감 다듬기' : '새 도감 만들기'}</p>
        <h2 id="new-book-title">{initialBook ? '도감 이름과 꾸밈 바꾸기' : '어떤 도감을 만들까요?'}</h2>
        <label className="field-label">도감 이름<input autoFocus value={name} maxLength="24" placeholder="예: 공룡 도감" onChange={(event) => { setName(event.target.value); setError('') }} /></label>
        <fieldset><legend>표지 색</legend><div className="choice-row">{BOOK_COLORS.map((item) => <button type="button" key={item.value} className={`cover-color ${color === item.value ? 'selected' : ''}`} style={{ background: item.value }} onClick={() => setColor(item.value)} aria-label={item.name} />)}</div></fieldset>
        <fieldset><legend>표지 그림</legend><div className="emoji-grid">{BOOK_EMOJIS.map((item) => <button type="button" key={item} className={emoji === item && !coverImage ? 'selected' : ''} onClick={() => { setEmoji(item); setCoverImage('') }}>{item}</button>)}</div></fieldset>
        <fieldset><legend>카드 무늬</legend><div className="pattern-grid" style={{ '--book-color': color }}>{BOOK_PATTERNS.map((item) => <button type="button" key={item.id} className={`pattern-choice pattern-${item.id} ${pattern === item.id ? 'selected' : ''}`} onClick={() => setPattern(item.id)}><span>{item.icon}</span><strong>{item.label}</strong><small>{item.description}</small></button>)}</div></fieldset>
        <label className="soft-button cover-photo">내 그림이나 사진을 표지로 쓰기<input hidden type="file" accept="image/*" onChange={(event) => photo(event.target.files?.[0])} /></label>
        {coverImage && <div className="cover-preview"><img src={coverImage} alt="선택한 표지" /><button onClick={() => setCoverImage('')}>사진 빼기</button></div>}
        {error && <p className="form-error">{error}</p>}
        <button className="primary-button full-button" onClick={submit}>{initialBook ? '도감 바꾸기' : '내 책장에 꽂기'}</button>
        {initialBook && <button className="book-delete-button" onClick={() => onDelete(initialBook)}>이 도감 삭제하기</button>}
      </section>
    </div>
  )
}

function DataTools({ onClose, onExport, onImport }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal data-tools" role="dialog" aria-modal="true" aria-label="데이터 보관">
        <button className="modal-close" onClick={onClose} aria-label="닫기">×</button>
        <p className="eyebrow">데이터 보관</p>
        <h2>책장 데이터 보관</h2>
        <p>카드 그림은 각 도감의 <b>카드 전체 받기</b>에서 받을 수 있어요. 아래 기능은 기기를 바꿀 때 책장 전체를 옮기기 위한 보조 기능이에요.</p>
        <button className="soft-button full-button" onClick={() => { onExport(); onClose() }}>↓ 책장 데이터 백업</button>
        <label className="soft-button full-button">↑ 백업 데이터 가져오기<input hidden type="file" accept="application/json,.json" onChange={(event) => { onImport(event.target.files?.[0]); onClose() }} /></label>
      </section>
    </div>
  )
}

function CardEditor({ book, cards, editCard, onCancel, onComplete }) {
  const [draft, setDraft] = useState(() => editCard ? { ...editCard, id: `draft-${book.id}`, editCardId: editCard.id, step: 1 } : emptyDraft(book.id))
  const [ready, setReady] = useState(Boolean(editCard))
  const [errors, setErrors] = useState({})
  const drawingRef = useRef(null)
  const saveTimer = useRef(null)

  useEffect(() => {
    if (editCard) return
    get('drafts', `draft-${book.id}`).then((saved) => {
      if (saved && !saved.editCardId) setDraft(saved)
      setReady(true)
    })
  }, [book.id, editCard])

  useEffect(() => {
    if (!ready) return
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => put('drafts', { ...draft, id: `draft-${book.id}`, updatedAt: Date.now() }), 350)
    return () => clearTimeout(saveTimer.current)
  }, [draft, book.id, ready])

  const update = (patch) => setDraft((current) => ({ ...current, ...patch }))
  const next = () => {
    const artwork = drawingRef.current?.snapshot()
    const merged = artwork ? { ...draft, ...artwork } : draft
    if (draft.step === 1 && !merged.hasArtwork) return setErrors({ artwork: '그림이나 사진을 먼저 넣어 주세요.' })
    if (draft.step === 2) {
      const validation = validateCard(merged)
      if (validation.name || validation.fact1) return setErrors(validation)
    }
    setDraft({ ...merged, step: Math.min(3, draft.step + 1) })
    setErrors({})
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const finish = () => {
    const artwork = drawingRef.current?.snapshot()
    const merged = artwork ? { ...draft, ...artwork } : draft
    const validation = validateCard(merged)
    if (Object.keys(validation).length) {
      setErrors(validation)
      setDraft((current) => ({ ...current, ...merged, step: validation.artwork ? 1 : 2 }))
      return
    }
    const now = Date.now()
    const card = {
      ...merged,
      id: editCard?.id || createId('card'),
      bookId: book.id,
      serial: editCard?.serial || nextSerial(cards, book.id),
      stamps: deriveStamps(merged),
      createdAt: editCard?.createdAt || now,
      updatedAt: now,
    }
    delete card.editCardId
    delete card.step
    onComplete(card)
  }

  if (!ready) return <main className="page editor-page"><p>작성하던 카드를 불러오는 중...</p></main>

  return (
    <main className="page editor-page" style={{ '--book-color': book.color }}>
      <div className="editor-heading">
        <button className="back-button" onClick={onCancel}>← {book.name}</button>
        <div><p className="eyebrow">{editCard ? '카드 다듬기' : '새로운 발견'}</p><h1>{editCard ? '카드 고치기' : '새 카드 발견하기'}</h1></div>
        <span className="autosave">● 자동 저장 중</span>
      </div>
      <div className="stepper" aria-label="카드 만들기 단계">
        {[['1', '그림 넣기'], ['2', '발견 쓰기'], ['3', '도장 확인']].map(([number, label], index) => <button key={number} className={draft.step === index + 1 ? 'active' : draft.step > index + 1 ? 'done' : ''} onClick={() => draft.step > index + 1 && update({ step: index + 1 })}><span>{draft.step > index + 1 ? '✓' : number}</span>{label}</button>)}
      </div>

      <section className="editor-card">
        {draft.step === 1 && <DrawingStep draft={draft} update={update} errors={errors} drawingRef={drawingRef} />}
        {draft.step === 2 && <WritingStep draft={draft} update={update} errors={errors} />}
        {draft.step === 3 && <StampStep draft={draft} book={book} update={update} />}
        <div className="editor-nav">
          {draft.step > 1 ? <button className="secondary-button" onClick={() => update({ step: draft.step - 1 })}>← 이전</button> : <span />}
          {draft.step < 3 ? <button className="primary-button" onClick={next}>다음 단계 →</button> : <button className="primary-button finish-button" onClick={finish}>✦ 카드 완성하기</button>}
        </div>
      </section>
    </main>
  )
}

function DrawingStep({ draft, update, errors, drawingRef }) {
  return <div className="step-content"><div className="step-title"><span>1</span><div><h2>발견한 것을 보여 주세요</h2><p>사진을 찍거나, 태블릿 펜으로 직접 그려 보세요.</p></div></div><DrawingPad ref={drawingRef} initialImage={draft.artwork} initialKinds={draft.artworkKinds} initialHasArtwork={draft.hasArtwork} onChange={update} />{errors.artwork && <p className="form-error center">{errors.artwork}</p>}<p className="gentle-tip">💡 사진 위에 선을 그어 중요한 곳을 표시해도 좋아요.</p></div>
}

function WritingStep({ draft, update, errors }) {
  return (
    <div className="step-content writing-step">
      <div className="step-title"><span>2</span><div><h2>내 말로 발견을 적어 봐요</h2><p>별표가 있는 두 가지만 쓰면 카드가 완성돼요.</p></div></div>
      <label className="field-label required">카드 이름 <b>꼭 써요</b><input autoFocus value={draft.name} maxLength="30" placeholder="예: 티라노사우루스" onChange={(event) => update({ name: event.target.value })} />{errors.name && <small className="form-error">{errors.name}</small>}</label>
      <label className="field-label required">가장 중요한 사실 <b>꼭 써요</b><textarea value={draft.fact1} maxLength="100" rows="2" placeholder="내가 알아낸 것을 한 문장으로 써 보세요." onChange={(event) => update({ fact1: event.target.value })} />{errors.fact1 && <small className="form-error">{errors.fact1}</small>}</label>
      <details className="optional-fields" open={Boolean(draft.fact2 || draft.fact3 || draft.confusing)}><summary>더 적고 싶다면 펼치기 <span>선택</span></summary><label className="field-label">또 다른 사실<input value={draft.fact2} maxLength="100" placeholder="두 번째로 알아낸 것" onChange={(event) => update({ fact2: event.target.value })} /></label><label className="field-label">한 가지 더<input value={draft.fact3} maxLength="100" placeholder="세 번째로 알아낸 것" onChange={(event) => update({ fact3: event.target.value })} /></label><label className="field-label">비교하거나 헷갈렸던 점<textarea value={draft.confusing} maxLength="140" rows="2" placeholder="예: 브라키오사우루스와 목 길이를 비교해 봤다." onChange={(event) => update({ confusing: event.target.value })} /></label></details>
    </div>
  )
}

function StampStep({ draft, book, update }) {
  const stamps = deriveStamps(draft)
  const sourceChoices = [['none', '기억이나 생각'], ['book', '책'], ['video', '영상'], ['place', '직접 본 것'], ['other', '그 밖의 곳']]
  return (
    <div className="step-content stamp-step">
      <div className="step-title"><span>3</span><div><h2>발견 도장을 확인해요</h2><p>이번 발견을 어떤 방법으로 남겼는지 보여 주는 도장이에요.</p></div></div>
      <div className={`mini-card-preview patterned-card pattern-${getBookPattern(book)}`} style={{ '--book-color': book.color }}><img src={draft.artwork} alt="카드 그림 미리보기" /><div><small>새 카드 · {book.name}</small><strong>{draft.name || '새로운 발견'}</strong><p><b>한 줄 발견</b>{draft.fact1}</p></div></div>
      <fieldset className="source-field"><legend>어디에서 알게 되었나요? <span>선택</span></legend><div className="source-choices">{sourceChoices.map(([value, label]) => <button type="button" key={value} className={draft.sourceType === value ? 'selected' : ''} onClick={() => update({ sourceType: value })}>{label}</button>)}</div>{draft.sourceType !== 'none' && <input value={draft.sourceNote} maxLength="80" placeholder="책 제목이나 장소를 써도 좋아요." onChange={(event) => update({ sourceNote: event.target.value })} />}</fieldset>
      <div className="stamp-preview"><h3>이번 카드의 발견 도장</h3><div>{stamps.map((key, index) => <span key={key} style={{ animationDelay: `${index * 90}ms` }}>{STAMP_META[key].icon}<small>{STAMP_META[key].label}</small></span>)}</div></div>
    </div>
  )
}

function CardDetail({ card, book, onClose, onEdit, onDuplicate, onDownload, onDelete }) {
  const facts = [card.fact1, card.fact2, card.fact3].filter(Boolean)
  return (
    <div className="modal-backdrop dark" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal card-detail" role="dialog" aria-modal="true" aria-label={`${card.name} 카드`} style={{ '--book-color': book.color }}>
        <button className="modal-close light" onClick={onClose} aria-label="닫기">×</button>
        <div className={`detail-card patterned-card pattern-${getBookPattern(book)}`}>
          <div className="detail-top"><span><i>{book.emoji}</i> {book.name}</span><b>No. {String(card.serial).padStart(3, '0')}</b></div>
          <img className="detail-art" src={card.artwork} alt={`${card.name} 그림`} />
          <h2>{card.name}</h2>
          <div className="detail-facts"><h3>내가 발견한 것</h3>{facts.map((fact, index) => <p key={index}><span>{['✦', '◆', '●'][index]}</span><span><small>{index === 0 ? '핵심 발견' : `추가 발견 ${index}`}</small>{fact}</span></p>)}{card.confusing && <aside><strong>🔎 비교해 본 것</strong>{card.confusing}</aside>}</div>
          <div className="detail-stamps">{card.stamps?.map((key) => <span key={key}>{STAMP_META[key]?.icon}<small>{STAMP_META[key]?.label}</small></span>)}</div>
        </div>
        <div className="detail-actions"><button onClick={onEdit}>✏️ 고치기</button><button onClick={onDuplicate}>▣ 복제</button><button onClick={onDownload}>↓ PNG 저장</button><button className="danger-action" onClick={onDelete}>지우기</button></div>
      </section>
    </div>
  )
}

function Celebration({ card, book, onClose }) {
  return (
    <div className="celebration" role="dialog" aria-modal="true" aria-label="카드 완성">
      <div className="confetti"><i /><i /><i /><i /><i /><i /></div>
      <p className="eyebrow">새로운 발견</p>
      <h2>새 카드가 도감에 들어갔어요!</h2>
      <div className="flip-card" style={{ '--book-color': book?.color }}><div className={`patterned-card pattern-${getBookPattern(book)}`}><i className="flip-emblem">{book?.emoji}</i><img src={card.artwork} alt="" /><strong>{card.name}</strong><small>한 줄 발견 · {card.fact1}</small><span>No. {String(card.serial).padStart(3, '0')}</span></div></div>
      <div className="celebration-stamps">{card.stamps?.map((key) => <span key={key}>{STAMP_META[key]?.icon}</span>)}</div>
      <button className="primary-button" onClick={onClose}>내 도감에서 보기</button>
    </div>
  )
}

function ConfirmDialog({ title, message, confirmLabel, run, onCancel }) {
  const [busy, setBusy] = useState(false)
  return <div className="modal-backdrop top" role="presentation"><section className="modal confirm-dialog" role="alertdialog" aria-modal="true"><div className="confirm-icon">?</div><h2>{title}</h2><p>{message}</p><div><button className="secondary-button" onClick={onCancel} disabled={busy}>그대로 둘래요</button><button className="danger-button" onClick={async () => { setBusy(true); try { await run() } finally { setBusy(false) } }} disabled={busy}>{busy ? '잠시만요...' : confirmLabel}</button></div></section></div>
}

export default App
