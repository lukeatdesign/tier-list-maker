import { useEffect, useRef, useState } from 'react'
import type { Card } from './types'

type Props = {
  card: Card
  onSave: (patch: Partial<Card>) => void
  onDelete: () => void
  onClose: () => void
}

/** edits save on blur and on close; Esc or backdrop click closes */
export default function CardDialog({ card, onSave, onDelete, onClose }: Props) {
  const [text, setText] = useState(card.text ?? '')
  const [note, setNote] = useState(card.note ?? '')
  const draft = useRef({ text, note })
  draft.current = { text, note }
  const firstField = useRef<HTMLInputElement & HTMLTextAreaElement>(null)

  const commit = () => {
    const { text: t, note: n } = draft.current
    const patch: Partial<Card> = { note: n.trim() || undefined }
    if (card.kind === 'text' && t.trim()) patch.text = t.trim() // blank text keeps the old text
    onSave(patch)
  }

  const close = () => {
    commit()
    onClose()
  }
  const closeRef = useRef(close)
  closeRef.current = close

  useEffect(() => {
    firstField.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeRef.current()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const field =
    'w-full rounded-xl border-2 border-[color:var(--line)] bg-[color:var(--field-bg)] px-3 py-2 text-[color:var(--ink)] outline-none transition focus:border-[color:var(--accent)]'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(e) => e.target === e.currentTarget && close()}
    >
      <div
        role="dialog"
        aria-label="แก้ไขการ์ด"
        className="w-full max-w-sm border-2 border-[color:var(--line)] bg-[color:var(--surface)] p-5"
        style={{ borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)' }}
      >
        {card.kind === 'image' ? (
          <img src={card.imageDataUrl} alt="" className="mx-auto mb-3 max-h-32 rounded-lg" />
        ) : (
          <label className="mb-3 block text-sm">
            <span className="mb-1 block text-[color:var(--ink-soft)]">ข้อความ</span>
            <input
              ref={firstField}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onBlur={commit}
              className={field}
            />
          </label>
        )}
        <label className="block text-sm">
          <span className="mb-1 block text-[color:var(--ink-soft)]">โน้ต — ทำไมถึงอยู่ tier นี้?</span>
          <textarea
            ref={card.kind === 'image' ? firstField : undefined}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={commit}
            rows={3}
            className={field}
          />
        </label>
        <div className="mt-4 flex items-center justify-between">
          <button
            onClick={onDelete}
            className="font-display rounded-full border-2 border-[color:var(--line)] px-4 py-1.5 text-sm text-[color:var(--ink-soft)] transition hover:border-red-400 hover:text-red-400"
          >
            🗑️ ลบการ์ด
          </button>
          <button
            onClick={close}
            className="font-display rounded-full px-5 py-1.5 text-sm font-medium"
            style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
          >
            เสร็จ
          </button>
        </div>
      </div>
    </div>
  )
}
