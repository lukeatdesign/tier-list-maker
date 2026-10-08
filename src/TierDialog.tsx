import { useEffect, useRef, useState } from 'react'
import type { Tier } from './types'
import { SWATCHES, inkFor } from './tierColor'

type Props = {
  tier: Tier
  themeColor: string // what the tier shows when it has no custom colour
  canDelete: boolean
  onSave: (patch: Partial<Tier>) => void
  onDelete: () => void
  onClose: () => void
}

/** name + colour for one tier; colour saves live, name on blur/close; Esc or backdrop closes */
export default function TierDialog({ tier, themeColor, canDelete, onSave, onDelete, onClose }: Props) {
  const [name, setName] = useState(tier.label)
  const draft = useRef(name)
  draft.current = name
  const nameRef = useRef<HTMLInputElement>(null)

  const commitName = () => {
    const v = draft.current.replace(/\s+/g, ' ').trim()
    if (v) onSave({ label: v })
  }
  const close = () => {
    commitName()
    onClose()
  }
  const closeRef = useRef(close)
  closeRef.current = close

  useEffect(() => {
    nameRef.current?.select()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeRef.current()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const shown = tier.color ?? themeColor
  const pickerValue = /^#[0-9a-f]{6}$/i.test(shown) ? shown : '#ffffff'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(e) => e.target === e.currentTarget && close()}
    >
      <div
        role="dialog"
        aria-label="แก้ไข tier"
        className="w-full max-w-sm border-2 border-[color:var(--line)] bg-[color:var(--surface)] p-5"
        style={{ borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)' }}
      >
        <label className="block text-sm">
          <span className="mb-1 block text-[color:var(--ink-soft)]">ชื่อ tier</span>
          <input
            ref={nameRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && close()}
            className="w-full rounded-xl border-2 border-[color:var(--line)] bg-[color:var(--field-bg)] px-3 py-2 text-[color:var(--ink)] outline-none transition focus:border-[color:var(--accent)]"
          />
        </label>

        <div className="mt-4 text-sm">
          <span className="mb-1.5 block text-[color:var(--ink-soft)]">สี</span>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => onSave({ color: undefined })}
              title="ใช้สีตามธีม"
              className={`font-display h-8 rounded-full border-2 px-3 text-xs ${tier.color ? 'border-[color:var(--line)]' : 'border-[color:var(--accent)]'}`}
            >
              ตามธีม
            </button>
            {SWATCHES.map((c) => (
              <button
                key={c}
                onClick={() => onSave({ color: c })}
                aria-label={`สี ${c}`}
                className="h-8 w-8 rounded-full border-2 transition hover:scale-110"
                style={{ background: c, borderColor: tier.color === c ? 'var(--accent)' : 'var(--line)' }}
              />
            ))}
            <label
              title="เลือกสีเอง"
              className="relative h-8 w-8 cursor-pointer overflow-hidden rounded-full border-2 border-dashed border-[color:var(--line)] text-center leading-7"
            >
              🎨
              <input
                type="color"
                value={pickerValue}
                onChange={(e) => onSave({ color: e.target.value })}
                className="absolute inset-0 cursor-pointer opacity-0"
                aria-label="เลือกสีเอง"
              />
            </label>
          </div>
          <div
            className="font-heading mt-3 flex min-h-12 items-center justify-center rounded-xl px-3 py-2 text-center font-semibold [overflow-wrap:anywhere]"
            style={{ background: shown, color: tier.color ? inkFor(tier.color) : 'var(--tier-ink)' }}
          >
            {name.trim() || tier.label}
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between">
          <button
            disabled={!canDelete}
            onClick={onDelete}
            title={canDelete ? 'ลบ tier นี้' : 'ต้องเหลืออย่างน้อย 1 tier'}
            className="font-display rounded-full border-2 border-[color:var(--line)] px-4 py-1.5 text-sm text-[color:var(--ink-soft)] transition enabled:hover:border-red-400 enabled:hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            🗑️ ลบ tier
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
