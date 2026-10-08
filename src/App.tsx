import { useCallback, useEffect, useRef, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  pointerWithin,
  type CollisionDetection,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, rectSortingStrategy, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Card, State, Tier } from './types'
import { loadState, saveState, initialState, uid } from './store'
import { fileToDataUrl } from './image'
import confetti from 'canvas-confetti'
import { toBlob, toPng } from 'html-to-image'
import { sounds, unlockAudio } from './sound'
import TierLabel from './TierLabel'
import CardDialog from './CardDialog'
import ConfirmDelete from './ConfirmDelete'
import TierDialog from './TierDialog'
import { SWATCHES, inkFor } from './tierColor'
import { boardFileName, parseBoard, serializeBoard } from './serialize'

const POOL = 'pool'

/** five fixed board widths instead of a free slider */
const WIDTHS = [
  { label: 'S', px: 800 },
  { label: 'M', px: 1100 },
  { label: 'L', px: 1440 },
  { label: 'XL', px: 1920 },
  { label: 'เต็ม', px: 2400 },
] as const

// the row under the pointer wins, so a small nudge into a neighbouring tier is enough; fall back to nearest centre
// tier rows (ids "row:…") only collide with other rows; cards only with cards and drop zones
const isRowId = (id: unknown) => String(id).startsWith('row:')
const collision: CollisionDetection = (args) => {
  const dragRow = isRowId(args.active.id)
  const scoped = { ...args, droppableContainers: args.droppableContainers.filter((c) => isRowId(c.id) === dragRow) }
  const hits = pointerWithin(scoped)
  return hits.length ? hits : closestCenter(scoped)
}

/* ---------- card ---------- */

function CardFace({ card }: { card: Card }) {
  return card.kind === 'image' ? (
    <img src={card.imageDataUrl} alt="" draggable={false} className="h-full w-auto object-cover" />
  ) : (
    <span className="flex h-full items-center px-4 text-center text-[15px] font-semibold leading-tight">
      {card.text}
    </span>
  )
}

type DropFx = { id: string; kind: 'first' | 'last' | 'mid'; n: number }

function SortableCard({ card, fx, onOpen, onAskDelete }: { card: Card; fx: DropFx | null; onOpen: (id: string) => void; onAskDelete: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id })
  return (
    <div
      ref={setNodeRef}
      data-card-id={card.id}
      className="group relative touch-none"
      onClick={() => onOpen(card.id)}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.3 : 1 }}
      {...attributes}
      {...listeners}
    >
      <div
        key={fx ? fx.n : 0}
        className={`card flex items-center justify-center overflow-hidden ${fx ? (fx.kind === 'last' ? 'fx-sad' : 'fx-bounce') : ''}`}
      >
        <CardFace card={card} />
        {card.note && <span className="note-dot" title="มีโน้ต" />}
      </div>
      <button
        data-no-export
        aria-label="ลบการ์ด"
        title="ลบการ์ด"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation()
          onAskDelete(card.id)
        }}
        className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[color:var(--ink)] text-[11px] leading-none text-[color:var(--bg)] opacity-0 transition hover:bg-red-500 hover:text-white focus:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
      >
        ✕
      </button>
    </div>
  )
}

/* ---------- tier row (drag the ⠿ handle to reorder) ---------- */

type TierRowProps = {
  tier: Tier
  fallbackColor: string
  cards: Record<string, Card>
  fx: DropFx | null
  onOpen: (id: string) => void
  onAskDelete: (id: string) => void
  onRename: (label: string) => void
  onSettings: () => void
}

function TierRow({ tier, fallbackColor, cards, fx, onOpen, onAskDelete, onRename, onSettings }: TierRowProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: `row:${tier.id}`,
  })
  const hoverBtn =
    'absolute top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/25 text-[12px] leading-none text-white opacity-0 transition hover:bg-black/50 focus:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100'
  return (
    <div
      ref={setNodeRef}
      className="relative flex border-b-2 border-[color:var(--line)] bg-[color:var(--surface)] last:border-b-0"
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        zIndex: isDragging ? 10 : undefined,
        boxShadow: isDragging ? 'var(--shadow)' : undefined,
      }}
    >
      <div
        className="font-display group relative flex w-28 shrink-0 select-none items-center justify-center p-2 text-center"
        style={{
          background: tier.color ?? fallbackColor,
          color: tier.color ? inkFor(tier.color) : 'var(--tier-ink)',
        }}
      >
        <TierLabel label={tier.label} onChange={onRename} />
        <button
          ref={setActivatorNodeRef}
          data-no-export
          {...attributes}
          {...listeners}
          aria-label="ลากเพื่อเรียง tier"
          title="ลากขึ้นลงเพื่อเรียง tier"
          className={`${hoverBtn} left-1 cursor-grab touch-none`}
          style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
        >
          ⠿
        </button>
        <button
          data-no-export
          onClick={onSettings}
          aria-label="ตั้งค่า tier"
          title="ชื่อ / สี / ลบ tier"
          className={`${hoverBtn} right-1`}
        >
          ⚙
        </button>
      </div>
      <Zone
        id={tier.id}
        cardIds={tier.cardIds}
        cards={cards}
        fx={fx}
        onOpen={onOpen}
        onAskDelete={onAskDelete}
        empty="ลากการ์ดมาวางตรงนี้ ✨"
        className="min-h-[88px] flex-1"
      />
    </div>
  )
}

/* ---------- drop zone ---------- */

function Zone({
  id,
  cardIds,
  cards,
  empty,
  fx,
  onOpen,
  onAskDelete,
  className = '',
}: {
  id: string
  cardIds: string[]
  cards: Record<string, Card>
  fx: DropFx | null
  onOpen: (id: string) => void
  onAskDelete: (id: string) => void
  empty: React.ReactNode
  className?: string
}) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <SortableContext id={id} items={cardIds} strategy={rectSortingStrategy}>
      <div
        ref={setNodeRef}
        className={`flex flex-wrap content-start items-center gap-2.5 p-3 transition-colors ${isOver ? 'drop-over' : ''} ${className}`}
      >
        {cardIds.map((cid) => cards[cid] && <SortableCard key={cid} card={cards[cid]} fx={fx?.id === cid ? fx : null} onOpen={onOpen} onAskDelete={onAskDelete} />)}
        {cardIds.length === 0 && (
          <span data-no-export className="select-none text-sm text-[color:var(--ink-soft)] opacity-70">{empty}</span>
        )}
      </div>
    </SortableContext>
  )
}

/* ---------- app ---------- */

export default function App() {
  const [state, setState] = useState<State>(loadState)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [fileOver, setFileOver] = useState(false)
  const [fx, setFx] = useState<DropFx | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  // page width is a view preference: kept out of the board (and its JSON), remembered per browser
  const [width, setWidth] = useState(() => {
    try {
      const n = Number(localStorage.getItem('tierlist.width'))
      if (!n) return 2400
      // older versions stored a free pixel value: snap it to the nearest preset
      return WIDTHS.reduce((best, w) => (Math.abs(w.px - n) < Math.abs(best.px - n) ? w : best)).px
    } catch {
      return 2400
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem('tierlist.width', String(width))
    } catch {
      /* ignore */
    }
  }, [width])
  const [stage, setStage] = useState<{ id: string; scale: number } | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [tierEditId, setTierEditId] = useState<string | null>(null)
  const [confirmTierId, setConfirmTierId] = useState<string | null>(null)
  const exportRef = useRef<HTMLDivElement>(null)
  const stateRef = useRef(state)
  stateRef.current = state
  const fileRef = useRef<HTMLInputElement>(null)
  const toastTimer = useRef<number>(0)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 3200)
  }, [])

  // a shared link (#s=…) is applied once, then the hash goes away so reloads keep later edits
  useEffect(() => {
    if (location.hash.startsWith('#s=')) history.replaceState(null, '', location.pathname + location.search)
  }, [])

  // auto-save
  useEffect(() => {
    document.documentElement.dataset.theme = state.theme
    if (!saveState(state)) showToast('พื้นที่เก็บข้อมูลเต็ม — บันทึกอัตโนมัติไม่สำเร็จ (ลองลบการ์ดรูปบางใบ)')
  }, [state, showToast])

  /* --- adding cards --- */

  const addCards = useCallback((newCards: Card[]) => {
    if (!newCards.length) return
    setState((s) => ({
      ...s,
      cards: { ...s.cards, ...Object.fromEntries(newCards.map((c) => [c.id, c])) },
      pool: [...s.pool, ...newCards.map((c) => c.id)],
    }))
  }, [])

  const addImages = useCallback(
    async (files: File[]) => {
      const imgs = files.filter((f) => f.type.startsWith('image/'))
      if (!imgs.length) return
      try {
        const urls = await Promise.all(imgs.map(fileToDataUrl))
        addCards(urls.map((imageDataUrl) => ({ id: uid(), kind: 'image' as const, imageDataUrl })))
      } catch {
        showToast('อ่านไฟล์รูปไม่ได้ ลองไฟล์อื่นดูนะ')
      }
    },
    [addCards, showToast],
  )

  const addText = () => {
    const t = text.trim()
    if (!t) return
    addCards([{ id: uid(), kind: 'text', text: t }])
    setText('')
  }

  // paste images anywhere
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? [])
      if (files.some((f) => f.type.startsWith('image/'))) {
        e.preventDefault()
        void addImages(files)
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [addImages])

  /* --- drag and drop --- */

  const containerOf = (s: State, id: string): string | null => {
    if (id === POOL || s.tiers.some((t) => t.id === id)) return id
    if (s.pool.includes(id)) return POOL
    return s.tiers.find((t) => t.cardIds.includes(id))?.id ?? null
  }
  const listOf = (s: State, cid: string) => (cid === POOL ? s.pool : s.tiers.find((t) => t.id === cid)!.cardIds)
  const withList = (s: State, cid: string, list: string[]): State =>
    cid === POOL
      ? { ...s, pool: list }
      : { ...s, tiers: s.tiers.map((t) => (t.id === cid ? { ...t, cardIds: list } : t)) }

  // audio can only start after a user gesture
  useEffect(() => {
    window.addEventListener('pointerdown', unlockAudio, { once: true })
    return () => window.removeEventListener('pointerdown', unlockAudio)
  }, [])

  const playDropFx = (cardId: string) => {
    const s = stateRef.current
    const cid = containerOf(s, cardId)
    if (!cid) return
    const idx = s.tiers.findIndex((t) => t.id === cid)
    const kind: DropFx['kind'] = idx === 0 ? 'first' : idx === s.tiers.length - 1 ? 'last' : 'mid'
    setFx((prev) => ({ id: cardId, kind, n: (prev?.n ?? 0) + 1 }))
    if (!s.muted) (kind === 'first' ? sounds.win : kind === 'last' ? sounds.sad : sounds.pop)()
    if (kind === 'first') {
      // wait for the card to land, then burst from its position
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          const r = document.querySelector(`[data-card-id="${cardId}"]`)?.getBoundingClientRect()
          if (!r) return
          confetti({
            particleCount: 90,
            spread: 80,
            startVelocity: 35,
            origin: { x: (r.left + r.width / 2) / innerWidth, y: (r.top + r.height / 2) / innerHeight },
            disableForReducedMotion: true,
          })
        }),
      )
    }
  }

  // a click opens the card dialog; the click that ends a drag must not
  const justDragged = useRef(false)
  /* easter egg: click the same card 5 times quickly and it dances with confetti for 6 s, then goes back to normal.
     A single click still opens the dialog, just ~0.28 s later so a second click can cancel it. */
  const clicks = useRef({ id: '', n: 0, t: 0 })
  const pendingOpen = useRef(0)
  const danceTimer = useRef(0)
  const danceRef = useRef<string | null>(null)

  const startDance = (id: string) => {
    danceRef.current = id
    // a big copy of the card pops up in the middle of the screen and dances for 2 s; the real card never changes
    const w = document.querySelector(`[data-card-id="${id}"] .card`)?.getBoundingClientRect().width ?? 120
    setStage({ id, scale: Math.min(3.4, (innerWidth * 0.7) / w, (innerHeight * 0.5) / 64) })
    if (!stateRef.current.muted) sounds.win()
    const end = performance.now() + 2000
    const burst = (angle: number, x: number) =>
      confetti({ particleCount: 4, angle, spread: 60, startVelocity: 45, ticks: 90, origin: { x, y: 0.55 }, disableForReducedMotion: true })
    const frame = () => {
      burst(60, 0.38)
      burst(120, 0.62)
      if (performance.now() < end) requestAnimationFrame(frame)
    }
    frame()
    window.clearTimeout(danceTimer.current)
    danceTimer.current = window.setTimeout(() => {
      danceRef.current = null
      setStage(null)
    }, 2000)
  }

  const openCard = (id: string) => {
    if (justDragged.current || danceRef.current === id) return
    const c = clicks.current
    const now = performance.now()
    c.n = c.id === id && now - c.t < 450 ? c.n + 1 : 1
    c.id = id
    c.t = now
    window.clearTimeout(pendingOpen.current)
    if (c.n >= 5) {
      c.n = 0
      startDance(id)
      return
    }
    pendingOpen.current = window.setTimeout(() => setEditingId(id), 280)
  }
  const endDrag = () => {
    setActiveId(null)
    window.setTimeout(() => (justDragged.current = false), 150)
  }

  const saveCard = (id: string, patch: Partial<Card>) =>
    setState((s) => (s.cards[id] ? { ...s, cards: { ...s.cards, [id]: { ...s.cards[id], ...patch } } } : s))

  /* --- tiers: create / update / delete --- */

  const saveTier = (id: string, patch: Partial<Tier>) =>
    setState((s) => ({ ...s, tiers: s.tiers.map((t) => (t.id === id ? { ...t, ...patch } : t)) }))

  const addTier = () =>
    setState((s) => ({
      ...s,
      tiers: [...s.tiers, { id: uid(), label: 'tier ใหม่', cardIds: [], color: SWATCHES[s.tiers.length % SWATCHES.length] }],
    }))

  /** cards inside the deleted tier go back to the pool */
  const deleteTier = (id: string) => {
    setTierEditId(null)
    setConfirmTierId(null)
    setState((s) => {
      const t = s.tiers.find((x) => x.id === id)
      if (!t || s.tiers.length <= 1) return s
      return { ...s, tiers: s.tiers.filter((x) => x.id !== id), pool: [...s.pool, ...t.cardIds] }
    })
  }

  const askDeleteTier = (id: string) => {
    const t = state.tiers.find((x) => x.id === id)
    if (t && t.cardIds.length > 0) {
      setTierEditId(null)
      setConfirmTierId(id)
    } else deleteTier(id)
  }

  const deleteCard = (id: string) => {
    setEditingId(null)
    setConfirmId(null)
    if (!stateRef.current.muted) sounds.boom()
    setState((s) => {
      const { [id]: _gone, ...cards } = s.cards
      return {
        ...s,
        cards,
        pool: s.pool.filter((x) => x !== id),
        tiers: s.tiers.map((t) => ({ ...t, cardIds: t.cardIds.filter((x) => x !== id) })),
      }
    })
  }

  const onDragStart = (e: DragStartEvent) => {
    justDragged.current = true
    if (!isRowId(e.active.id)) setActiveId(String(e.active.id))
  }

  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over || isRowId(active.id)) return
    const aId = String(active.id)
    const oId = String(over.id)
    setState((s) => {
      const from = containerOf(s, aId)
      const to = containerOf(s, oId)
      if (!from || !to || from === to) return s
      const fromList = listOf(s, from).filter((x) => x !== aId)
      const toList = [...listOf(s, to)]
      const overIdx = toList.indexOf(oId)
      toList.splice(overIdx >= 0 ? overIdx : toList.length, 0, aId)
      return withList(withList(s, from, fromList), to, toList)
    })
  }

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    endDrag()
    if (!over) return
    const aId = String(active.id)
    const oId = String(over.id)
    if (isRowId(aId)) {
      // reordering tiers: no drop effects, cards ride along inside their row
      if (!isRowId(oId)) return
      setState((s) => {
        const from = s.tiers.findIndex((t) => `row:${t.id}` === aId)
        const to = s.tiers.findIndex((t) => `row:${t.id}` === oId)
        return from < 0 || to < 0 || from === to ? s : { ...s, tiers: arrayMove(s.tiers, from, to) }
      })
      return
    }
    setState((s) => {
      const c = containerOf(s, aId)
      if (!c || c !== containerOf(s, oId)) return s
      const list = listOf(s, c)
      const from = list.indexOf(aId)
      const to = list.indexOf(oId)
      if (from < 0 || to < 0 || from === to) return s
      return withList(s, c, arrayMove(list, from, to))
    })
    playDropFx(aId)
  }

  /* --- export --- */

  const exportOptions = async () => {
    await document.fonts.ready
    return {
      pixelRatio: 2,
      backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(),
      filter: (n: Node) => !(n instanceof HTMLElement && n.dataset.noExport !== undefined),
    }
  }

  const exportPng = async () => {
    if (!exportRef.current) return
    try {
      const url = await toPng(exportRef.current, await exportOptions())
      const a = document.createElement('a')
      a.href = url
      a.download = 'tierlist.png'
      a.click()
      showToast('บันทึก tierlist.png แล้ว ✨')
    } catch {
      showToast('Export ไม่สำเร็จ ลองอีกครั้งนะ')
    }
  }

  const copyPng = async () => {
    if (!exportRef.current) return
    try {
      const blob = await toBlob(exportRef.current, await exportOptions())
      if (!blob) throw new Error('no blob')
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      showToast('คัดลอกรูปแล้ว วางในแชทได้เลย ✨')
    } catch {
      showToast('คัดลอกรูปไม่สำเร็จ ลองกด Export PNG แทนนะ')
    }
  }

  /* --- save / load board as a .tierlist.json file --- */

  const importRef = useRef<HTMLInputElement>(null)

  const saveJson = () => {
    const url = URL.createObjectURL(new Blob([serializeBoard(stateRef.current)], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = boardFileName(stateRef.current.title)
    a.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
    showToast('บันทึกไฟล์ .tierlist.json แล้ว ✨')
  }

  const loadJson = async (file: File | undefined) => {
    if (!file) return
    try {
      const board = parseBoard(JSON.parse(await file.text()))
      if (!board) throw new Error('not a board')
      if (!window.confirm(`โหลด “${board.title}” (${Object.keys(board.cards).length} การ์ด)? บอร์ดปัจจุบันจะถูกแทนที่`)) return
      setState(board)
      showToast('โหลดบอร์ดแล้ว ✨')
    } catch {
      showToast('ไฟล์นี้ไม่ใช่บอร์ด tier list ที่อ่านได้')
    }
  }

  const reset = () => {
    if (window.confirm('เริ่มใหม่ทั้งหมดเลยนะ? การ์ดและอันดับที่จัดไว้จะหาย')) setState(initialState())
  }

  const active = activeId ? state.cards[activeId] : null
  const tierVars = ['--tier-1', '--tier-2', '--tier-3', '--tier-4', '--tier-5']

  return (
    <div className="mx-auto w-full px-2 pb-12 pt-3" style={{ maxWidth: width }}>
      <DndContext
        sensors={sensors}
        collisionDetection={collision}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={endDrag}
      >
      {/* menu bar: lives outside the export area; stays pinned to the top while scrolling */}
      <div
        className="sticky top-0 z-40 flex flex-wrap items-center justify-end gap-2 rounded-b-2xl px-3 py-2 backdrop-blur-md"
        style={{ background: "color-mix(in srgb, var(--bg) 88%, transparent)", boxShadow: "0 1px 0 var(--line)" }}
      >
        <div
          role="group"
          aria-label="ความกว้างบอร์ด"
          title="ความกว้างบอร์ด (มีผลกับขนาดรูปที่ export ด้วย)"
          className="flex items-center overflow-hidden border-2 border-[color:var(--line)] bg-[color:var(--surface)]"
          style={{ borderRadius: 999 }}
        >
          <span className="px-2.5 text-sm text-[color:var(--ink-soft)]">↔</span>
          {WIDTHS.map((w) => (
            <button
              key={w.px}
              onClick={() => setWidth(w.px)}
              aria-pressed={width === w.px}
              className="font-display px-2.5 py-1 text-xs font-medium transition"
              style={width === w.px ? { background: 'var(--accent)', color: 'var(--accent-ink)' } : undefined}
            >
              {w.label}
            </button>
          ))}
        </div>
        <div
          data-no-export
          role="group"
          aria-label="ธีม"
          className="flex overflow-hidden border-2 border-[color:var(--line)] bg-[color:var(--surface)]"
          style={{ borderRadius: 999 }}
        >
          {(['pastel', 'arcade', 'dark'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setState((s) => ({ ...s, theme: t }))}
              aria-pressed={state.theme === t}
              title={t}
              className="px-2.5 py-1 text-base transition"
              style={state.theme === t ? { background: 'var(--accent)' } : undefined}
            >
              {t === 'pastel' ? '🌸' : t === 'arcade' ? '👾' : '🌙'}
            </button>
          ))}
        </div>
        <button
          data-no-export
          onClick={() => void exportPng()}
          className="font-display rounded-full px-4 py-1.5 text-sm font-medium transition hover:brightness-105 active:translate-y-px"
          style={{ background: 'var(--accent)', color: 'var(--accent-ink)', boxShadow: '0 3px 0 rgba(0,0,0,.12)' }}
        >
          Export PNG
        </button>
        <button
          data-no-export
          onClick={() => void copyPng()}
          className="font-display rounded-full border-2 border-[color:var(--line)] bg-[color:var(--surface)] px-4 py-1.5 text-sm font-medium transition hover:border-[color:var(--accent)]"
        >
          Copy image
        </button>
        <button onClick={saveJson} title="บันทึกบอร์ดเป็นไฟล์ .tierlist.json" className="font-display rounded-full border-2 border-[color:var(--line)] bg-[color:var(--surface)] px-4 py-1.5 text-sm font-medium transition hover:border-[color:var(--accent)]">
          Save JSON
        </button>
        <button onClick={() => importRef.current?.click()} title="โหลดบอร์ดจากไฟล์ .tierlist.json" className="font-display rounded-full border-2 border-[color:var(--line)] bg-[color:var(--surface)] px-4 py-1.5 text-sm font-medium transition hover:border-[color:var(--accent)]">
          Load JSON
        </button>
        <input
          ref={importRef}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            void loadJson(e.target.files?.[0])
            e.target.value = ''
          }}
        />
        <button
          data-no-export
          onClick={() => setState((s) => ({ ...s, muted: !s.muted }))}
          aria-label={state.muted ? 'เปิดเสียง' : 'ปิดเสียง'}
          title={state.muted ? 'เปิดเสียง' : 'ปิดเสียง'}
          className="rounded-full border-2 border-[color:var(--line)] bg-[color:var(--surface)] px-3 py-1 text-lg transition hover:border-[color:var(--accent)]"
        >
          {state.muted ? '🔇' : '🔊'}
        </button>
        <button
          data-no-export
          onClick={reset}
          className="font-display rounded-full border-2 border-[color:var(--line)] bg-[color:var(--surface)] px-4 py-1.5 text-sm font-medium text-[color:var(--ink-soft)] transition hover:border-[color:var(--accent)] hover:text-[color:var(--accent)]"
        >
          Reset
        </button>
      </div>

      {/* export area = title + board */}
      <div ref={exportRef} className="p-3">
        <header className="mb-5 flex items-center gap-3">
          <span className="text-3xl" aria-hidden>
            🍡
          </span>
          <input
            value={state.title}
            onChange={(e) => setState((s) => ({ ...s, title: e.target.value }))}
            aria-label="ชื่อ Tier List"
            style={{ fontSize: 'var(--title-size)', height: 48 }}
            className="font-heading min-w-0 flex-1 rounded-xl border-2 border-transparent bg-transparent px-2 py-1 font-semibold outline-none transition hover:border-[color:var(--line)] focus:border-[color:var(--accent)] focus:bg-[color:var(--surface)]"
          />
        </header>

        {/* board */}
        <section
          className="overflow-hidden border-2 border-[color:var(--line)] bg-[color:var(--surface)]"
          style={{ borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)' }}
        >
          <SortableContext items={state.tiers.map((t) => `row:${t.id}`)} strategy={verticalListSortingStrategy}>
            {state.tiers.map((tier, i) => (
              <TierRow
                key={tier.id}
                tier={tier}
                fallbackColor={`var(${tierVars[i % 5]})`}
                cards={state.cards}
                fx={fx}
                onOpen={openCard}
                onAskDelete={setConfirmId}
                onRename={(label) => saveTier(tier.id, { label })}
                onSettings={() => setTierEditId(tier.id)}
              />
            ))}
          </SortableContext>
        </section>
      </div>

        <div className="mt-1 flex justify-center">
          <button
            onClick={addTier}
            className="font-display rounded-full border-2 border-dashed border-[color:var(--line)] px-4 py-1.5 text-sm text-[color:var(--ink-soft)] transition hover:border-[color:var(--accent)] hover:text-[color:var(--accent)]"
          >
            + เพิ่ม tier
          </button>
        </div>

        {/* pool */}
        <section
          className={`mt-6 border-2 border-dashed border-[color:var(--line)] bg-[color:var(--surface)]/70 p-4 transition ${fileOver ? 'drop-over' : ''}`}
          style={{ borderRadius: 'var(--radius)' }}
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes('Files')) {
              e.preventDefault()
              setFileOver(true)
            }
          }}
          onDragLeave={() => setFileOver(false)}
          onDrop={(e) => {
            setFileOver(false)
            if (e.dataTransfer.files.length) {
              e.preventDefault()
              void addImages(Array.from(e.dataTransfer.files))
            }
          }}
        >
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && addText()}
              placeholder="พิมพ์ชื่อการ์ดแล้วกด Enter…"
              className="min-w-0 flex-1 rounded-full border-2 border-[color:var(--line)] bg-[color:var(--field-bg)] text-[color:var(--ink)] px-4 py-2 outline-none transition focus:border-[color:var(--accent)]"
            />
            <button
              onClick={() => fileRef.current?.click()}
              className="font-display rounded-full px-4 py-2 text-sm font-medium transition hover:brightness-105 active:translate-y-px"
              style={{ background: 'var(--accent)', color: 'var(--accent-ink)', boxShadow: '0 3px 0 rgba(0,0,0,.12)' }}
            >
              🖼️ อัปโหลดรูป
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => {
                void addImages(Array.from(e.target.files ?? []))
                e.target.value = ''
              }}
            />
          </div>
          <Zone
            id={POOL}
            cardIds={state.pool}
            cards={state.cards}
            fx={fx}
            onOpen={openCard}
            onAskDelete={setConfirmId}
            empty="การ์ดหมดแล้ว! 🎉 พิมพ์ข้อความ วางรูป หรือลากไฟล์รูปมาใส่เพิ่มได้เลย"
            className="min-h-[88px] rounded-xl"
          />
        </section>

        <DragOverlay dropAnimation={{ duration: 180 }}>
          {active && (
            <div className="card dragging-overlay flex items-center justify-center overflow-hidden">
              <CardFace card={active} />
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {editingId && state.cards[editingId] && (
        <CardDialog
          key={editingId}
          card={state.cards[editingId]}
          onSave={(patch) => saveCard(editingId, patch)}
          onDelete={() => setConfirmId(editingId)}
          onClose={() => setEditingId(null)}
        />
      )}

      {tierEditId && state.tiers.some((t) => t.id === tierEditId) && (
        <TierDialog
          key={tierEditId}
          tier={state.tiers.find((t) => t.id === tierEditId)!}
          themeColor={`var(${tierVars[state.tiers.findIndex((t) => t.id === tierEditId) % 5]})`}
          canDelete={state.tiers.length > 1}
          onSave={(patch) => saveTier(tierEditId, patch)}
          onDelete={() => askDeleteTier(tierEditId)}
          onClose={() => setTierEditId(null)}
        />
      )}

      {confirmTierId && state.tiers.some((t) => t.id === confirmTierId) && (
        <ConfirmDelete
          title={`ลบ tier “${state.tiers.find((t) => t.id === confirmTierId)!.label}”?`}
          message="การ์ดข้างในจะกลับไปอยู่ใน pool นะ"
          onConfirm={() => deleteTier(confirmTierId)}
          onCancel={() => setConfirmTierId(null)}
        />
      )}

      {stage && state.cards[stage.id] && (
        <div className="pointer-events-none fixed inset-0 z-[70] flex items-center justify-center" aria-hidden>
          <div style={{ transform: `scale(${stage.scale})` }}>
            <div className="card dance-stage flex items-center justify-center overflow-hidden">
              <CardFace card={state.cards[stage.id]} />
            </div>
          </div>
        </div>
      )}

      {confirmId && state.cards[confirmId] && (
        <ConfirmDelete
          title={`ลบการ์ด “${state.cards[confirmId].kind === 'text' ? (state.cards[confirmId].text ?? '') : 'รูปนี้'}” จริงดิ?`}
          onConfirm={() => deleteCard(confirmId)}
          onCancel={() => setConfirmId(null)}
        />
      )}

      {toast && (
        <div
          role="status"
          className="font-display fixed bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-[color:var(--ink)] px-5 py-2.5 text-sm text-[color:var(--bg)] shadow-lg"
        >
          {toast}
        </div>
      )}
    </div>
  )
}
