import { useCallback, useEffect, useRef, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, rectSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Card, State } from './types'
import { loadState, saveState, initialState, uid } from './store'
import { fileToDataUrl } from './image'
import confetti from 'canvas-confetti'
import { toBlob, toPng } from 'html-to-image'
import { sounds, unlockAudio } from './sound'
import TierLabel from './TierLabel'

const POOL = 'pool'

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

function SortableCard({ card, fx }: { card: Card; fx: DropFx | null }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id })
  return (
    <div
      ref={setNodeRef}
      data-card-id={card.id}
      className="touch-none"
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.3 : 1 }}
      {...attributes}
      {...listeners}
    >
      <div
        key={fx ? fx.n : 0}
        className={`card flex items-center justify-center overflow-hidden ${fx ? (fx.kind === 'last' ? 'fx-sad' : 'fx-bounce') : ''}`}
      >
        <CardFace card={card} />
      </div>
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
  className = '',
}: {
  id: string
  cardIds: string[]
  cards: Record<string, Card>
  fx: DropFx | null
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
        {cardIds.map((cid) => cards[cid] && <SortableCard key={cid} card={cards[cid]} fx={fx?.id === cid ? fx : null} />)}
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

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id))

  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return
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
    setActiveId(null)
    if (!over) return
    const aId = String(active.id)
    const oId = String(over.id)
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

  const reset = () => {
    if (window.confirm('เริ่มใหม่ทั้งหมดเลยนะ? การ์ดและอันดับที่จัดไว้จะหาย')) setState(initialState())
  }

  const active = activeId ? state.cards[activeId] : null
  const tierVars = ['--tier-1', '--tier-2', '--tier-3', '--tier-4', '--tier-5']

  return (
    <div className="mx-auto max-w-5xl px-5 pb-16 pt-6">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
      {/* export area = title + board; anything with data-no-export is skipped */}
      <div ref={exportRef} className="p-4">
      <header className="mb-5 flex items-center gap-3">
        <span className="text-3xl" aria-hidden>
          🍡
        </span>
        <input
          value={state.title}
          onChange={(e) => setState((s) => ({ ...s, title: e.target.value }))}
          aria-label="ชื่อ Tier List"
          className="font-display min-w-0 flex-1 rounded-xl border-2 border-transparent bg-transparent px-2 py-1 text-3xl font-semibold outline-none transition hover:border-[color:var(--line)] focus:border-[color:var(--accent)] focus:bg-[color:var(--surface)]"
        />
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
      </header>

        {/* board */}
        <section
          className="overflow-hidden border-2 border-[color:var(--line)] bg-[color:var(--surface)]"
          style={{ borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)' }}
        >
          {state.tiers.map((tier, i) => (
            <div key={tier.id} className="flex border-b-2 border-[color:var(--line)] last:border-b-0">
              <div
                className="font-display flex w-24 shrink-0 select-none items-center justify-center p-2 text-center text-3xl font-semibold"
                style={{ background: `var(${tierVars[i % 5]})`, color: 'var(--tier-ink)' }}
              >
                <TierLabel
                  label={tier.label}
                  onChange={(label) =>
                    setState((s) => ({ ...s, tiers: s.tiers.map((t) => (t.id === tier.id ? { ...t, label } : t)) }))
                  }
                />
              </div>
              <Zone
                id={tier.id}
                cardIds={tier.cardIds}
                cards={state.cards}
                fx={fx}
                empty="ลากการ์ดมาวางตรงนี้ ✨"
                className="min-h-[88px] flex-1"
              />
            </div>
          ))}
        </section>
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
              className="min-w-0 flex-1 rounded-full border-2 border-[color:var(--line)] bg-white px-4 py-2 outline-none transition focus:border-[color:var(--accent)]"
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

      {toast && (
        <div
          role="status"
          className="font-display fixed bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-[color:var(--ink)] px-5 py-2.5 text-sm text-white shadow-lg"
        >
          {toast}
        </div>
      )}
    </div>
  )
}
