import type { Card, State, Tier } from './types'

/** file format: { app, version, exportedAt, board }. A bare State object is accepted too. */
export const FORMAT = 'tier-list-maker'
export const VERSION = 1

const THEMES: State['theme'][] = ['pastel', 'arcade', 'dark']
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown) => (typeof v === 'string' ? v : undefined)

/**
 * Validate and repair anything that claims to be a board (file, share link, localStorage).
 * Returns null if it is not recognisable as one. Cards that no tier or the pool mention are
 * put back in the pool; unknown ids and duplicates are dropped.
 */
export function parseBoard(input: unknown): State | null {
  const raw = isObj(input) && isObj(input.board) ? input.board : input
  if (!isObj(raw) || !Array.isArray(raw.tiers) || !isObj(raw.cards)) return null

  const cards: Record<string, Card> = {}
  for (const [key, c] of Object.entries(raw.cards)) {
    if (!isObj(c)) continue
    const id = str(c.id) ?? key
    if (c.kind === 'image') {
      const url = str(c.imageDataUrl)
      if (!url?.startsWith('data:image/')) continue // data URLs only, never remote
      cards[id] = { id, kind: 'image', imageDataUrl: url, note: str(c.note) }
    } else {
      cards[id] = { id, kind: 'text', text: str(c.text) ?? '', note: str(c.note) }
    }
  }

  const placed = new Set<string>()
  const take = (ids: unknown): string[] =>
    (Array.isArray(ids) ? ids : []).filter((id): id is string => {
      if (typeof id !== 'string' || !cards[id] || placed.has(id)) return false
      placed.add(id)
      return true
    })

  const seenTier = new Set<string>()
  const tiers: Tier[] = []
  for (const t of raw.tiers) {
    if (!isObj(t)) continue
    let id = str(t.id) ?? Math.random().toString(36).slice(2, 10)
    while (seenTier.has(id)) id += 'x'
    seenTier.add(id)
    const color = str(t.color)
    tiers.push({
      id,
      label: str(t.label)?.trim() || '?',
      cardIds: take(t.cardIds),
      ...(color && /^#[0-9a-f]{6}$/i.test(color) ? { color } : {}),
    })
  }
  if (tiers.length === 0) return null

  const pool = take(raw.pool)
  for (const id of Object.keys(cards)) if (!placed.has(id)) pool.push(id)

  return {
    title: str(raw.title) ?? 'Tier List',
    tiers,
    pool,
    cards,
    theme: THEMES.includes(raw.theme as State['theme']) ? (raw.theme as State['theme']) : 'pastel',
    muted: raw.muted === true,
  }
}

export function serializeBoard(state: State): string {
  return JSON.stringify({ app: FORMAT, version: VERSION, exportedAt: new Date().toISOString(), board: state }, null, 2)
}

/** "<title>.tierlist.json", with characters Windows/macOS dislike removed (Thai is fine) */
export function boardFileName(title: string): string {
  const base = title.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60)
  return `${base || 'tierlist'}.tierlist.json`
}
