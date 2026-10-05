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

function SortableCard({ card }: { card: Card }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id })
  return (
    <div
      ref={setNodeRef}
      className="card flex items-center justify-center overflow-hidden"
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.3 : 1 }}
      {...attributes}
      {...listeners}
    >
      <CardFace card={card} />
    </div>
  )
}

/* ---------- drop zone ---------- */

function Zone({
  id,
  cardIds,
  cards,
  empty,
  className = '',
}: {
  id: string
  cardIds: string[]
  cards: Record<string, Card>
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
        {cardIds.map((cid) => cards[cid] && <SortableCard key={cid} card={cards[cid]} />)}
        {cardIds.length === 0 && (
          <span className="select-none text-sm text-[color:var(--ink-soft)] opacity-70">{empty}</span>
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
  }

  const reset = () => {
    if (window.confirm('เริ่มใหม่ทั้งหมดเลยนะ? การ์ดและอันดับที่จัดไว้จะหาย')) setState(initialState())
  }

  const active = activeId ? state.cards[activeId] : null
  const tierVars = ['--tier-1', '--tier-2', '--tier-3', '--tier-4', '--tier-5']

  return (
    <div className="mx-auto max-w-5xl px-5 pb-16 pt-6">
      {/* top bar */}
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
          onClick={reset}
          className="font-display rounded-full border-2 border-[color:var(--line)] bg-[color:var(--surface)] px-4 py-1.5 text-sm font-medium text-[color:var(--ink-soft)] transition hover:border-[color:var(--accent)] hover:text-[color:var(--accent)]"
        >
          Reset
        </button>
      </header>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        {/* board */}
        <section
          className="overflow-hidden border-2 border-[color:var(--line)] bg-[color:var(--surface)]"
          style={{ borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)' }}
        >
          {state.tiers.map((tier, i) => (
            <div key={tier.id} className="flex border-b-2 border-[color:var(--line)] last:border-b-0">
              <div
                className="font-display flex w-24 shrink-0 items-center justify-center p-2 text-center text-3xl font-semibold"
                style={{ background: `var(${tierVars[i % 5]})`, color: 'var(--tier-ink)' }}
              >
                {tier.label}
              </div>
              <Zone
                id={tier.id}
                cardIds={tier.cardIds}
                cards={state.cards}
                empty="ลากการ์ดมาวางตรงนี้ ✨"
                className="min-h-[88px] flex-1"
              />
            </div>
          ))}
        </section>

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
