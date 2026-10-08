import type { Card, State } from './types'
import { parseBoard } from './serialize'

const KEY = 'tierlist.v1'
export const uid = () => Math.random().toString(36).slice(2, 10)

const SAMPLES = ['🍕 พิซซ่า', '🍜 ก๋วยเตี๋ยว', '🍣 ซูชิ', '🧋 ชานมไข่มุก', '🍰 เค้กช็อกโกแลต', '🥗 สลัดผัก']

export function initialState(): State {
  const cards: Record<string, Card> = {}
  const pool = SAMPLES.map((text) => {
    const id = uid()
    cards[id] = { id, kind: 'text', text }
    return id
  })
  return {
    title: 'Tier List ของฉัน',
    tiers: ['S', 'A', 'B', 'C', 'D'].map((label) => ({ id: uid(), label, cardIds: [] })),
    pool,
    cards,
    theme: 'pastel',
    muted: false,
  }
}

export function loadState(): State {
  const shared = stateFromHash()
  if (shared) return shared
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const s = parseBoard(JSON.parse(raw))
      if (s) return s
    }
  } catch {
    /* fall through */
  }
  return initialState()
}

/** returns false if storage is full */
export function saveState(s: State): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
    return true
  } catch {
    return false
  }
}

/** a shared link carries a whole board: https://…/#s=<base64url of the State JSON> */
function stateFromHash(): State | null {
  const m = location.hash.match(/^#s=([\w-]+)$/)
  if (!m) return null
  try {
    const bin = atob(m[1].replace(/-/g, '+').replace(/_/g, '/'))
    return parseBoard(JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))))
  } catch {
    return null
  }
}
