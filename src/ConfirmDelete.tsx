import { useEffect } from 'react'

type Props = { title: string; message?: string; onConfirm: () => void; onCancel: () => void }

export default function ConfirmDelete({ title, message = 'ลบแล้ว หายไปเลยนะมึง', onConfirm, onCancel }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div
        role="alertdialog"
        aria-label="ยืนยันการลบ"
        className="w-full max-w-xs border-2 border-[color:var(--line)] bg-[color:var(--surface)] p-5 text-center"
        style={{ borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)' }}
      >
        <div className="text-3xl">🗑️</div>
        <h2 className="font-display mt-2 text-lg font-semibold [overflow-wrap:anywhere]">{title}</h2>
        <p className="mt-1 text-sm text-[color:var(--ink-soft)]">{message}</p>
        <div className="mt-4 flex justify-center gap-2">
          <button
            autoFocus
            onClick={onCancel}
            className="font-display rounded-full border-2 border-[color:var(--line)] px-4 py-1.5 text-sm transition hover:border-[color:var(--accent)]"
          >
            ไม่ลบแล้ว
          </button>
          <button
            onClick={onConfirm}
            className="font-display rounded-full bg-red-500 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-red-600"
          >
            ลบเลย
          </button>
        </div>
      </div>
    </div>
  )
}
