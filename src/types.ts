export type Card = {
  id: string
  kind: 'text' | 'image'
  text?: string
  imageDataUrl?: string
  note?: string
}

export type Tier = { id: string; label: string; cardIds: string[]; color?: string }

export type State = {
  title: string
  tiers: Tier[]
  pool: string[]
  cards: Record<string, Card>
  theme: 'pastel' | 'arcade' | 'dark'
  muted: boolean
}
