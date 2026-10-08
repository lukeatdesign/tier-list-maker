import { useEffect, useRef, useState } from 'react'

/** long names shrink a step or two and wrap instead of overflowing the label block */
export function labelScale(label: string): number {
  const n = Array.from(label).length
  return n <= 3 ? 1 : n <= 6 ? 0.72 : n <= 12 ? 0.55 : n <= 24 ? 0.5 : 0.42
}

/** click to edit; Enter/blur saves, Esc cancels, empty falls back to the previous label */
export default function TierLabel({ label, onChange }: { label: string; onChange: (v: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(label)
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (editing) ref.current?.select()
  }, [editing])

  const commit = () => {
    const v = draft.replace(/\s+/g, ' ').trim()
    if (v) onChange(v)
    setEditing(false)
  }

  const style = { fontSize: `calc(var(--label-size) * ${labelScale(editing ? draft : label)})` }
  const wrap = 'font-heading w-full font-semibold leading-tight [overflow-wrap:anywhere]'

  if (editing)
    return (
      <textarea
        ref={ref}
        value={draft}
        rows={Math.min(4, Math.max(1, Math.ceil(Array.from(draft).length / 6)))}
        onChange={(e) => setDraft(e.target.value.replace(/\n/g, ''))}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
            e.preventDefault()
            commit()
          }
          if (e.key === 'Escape') setEditing(false)
        }}
        className={`${wrap} resize-none bg-white/60 text-center outline-none ring-2 ring-[color:var(--accent)]`}
        style={{ ...style, borderRadius: 8, color: 'var(--tier-ink)' }}
        aria-label="ชื่อ tier"
      />
    )
  return (
    <button
      onClick={() => {
        setDraft(label)
        setEditing(true)
      }}
      title="คลิกเพื่อแก้ชื่อ"
      className={`${wrap} hover:bg-white/30`}
      style={style}
    >
      {label}
    </button>
  )
}
