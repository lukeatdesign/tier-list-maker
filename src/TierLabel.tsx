import { useEffect, useRef, useState } from 'react'

/** click to edit; Enter/blur saves, Esc cancels, empty falls back to the previous label */
export default function TierLabel({ label, onChange }: { label: string; onChange: (v: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(label)
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) ref.current?.select()
  }, [editing])

  const commit = () => {
    const v = draft.trim()
    if (v) onChange(v)
    setEditing(false)
  }

  if (editing)
    return (
      <input
        ref={ref}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) commit()
          if (e.key === 'Escape') setEditing(false)
        }}
        className="font-display w-full bg-white/60 text-center text-2xl font-semibold outline-none ring-2 ring-[color:var(--accent)]"
        style={{ borderRadius: 8, color: 'var(--tier-ink)' }}
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
      className="font-display h-full w-full break-words text-3xl font-semibold leading-tight hover:bg-white/30"
    >
      {label}
    </button>
  )
}
