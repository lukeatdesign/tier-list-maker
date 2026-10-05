# Tier List Maker — Spec (EP.4 live demo)

## 1. Goal
A single-page tier list maker, built live in ~60 minutes by prompting Claude Code, in front of an audience of designers. Visual polish and "feel" matter more than code quality. The session must end with:
1. a live Vercel URL, and
2. a PNG exported from the app and posted to the Teams chat.

## 2. Constraints
- No backend, no auth, no database. Everything runs in the browser.
- One page, no router. Keep dependencies few so install/build/deploy stay fast and nothing breaks mid-live.
- Desktop-first (screen share). Touch support is a bonus, not a requirement.
- No assets are prepared in advance. Cards are created at runtime from text or an image file.
- Thai and English text must both render correctly, including in the exported PNG.
- Build in phases (section 6). Commit and push at the end of every phase so Vercel always has a working version.

## 3. Stack
- Vite + React + TypeScript + Tailwind CSS
- `@dnd-kit/core` + `@dnd-kit/sortable` for drag and drop
- `canvas-confetti` for confetti
- `zzfx` for sound effects (tiny, synthesized, no audio files). Verify the package name and export when installing; if it does not work, fall back to a small Web Audio oscillator helper
- `html-to-image` for PNG export
- `@fontsource/*` for fonts (self-hosted, so export renders them reliably). Use a Thai-capable font (e.g. Noto Sans Thai) as the base
- No shadcn, no state library. `useReducer` or `useState` is enough
- Deploy: GitHub repo + Vercel (Claude Code has access to both)

## 4. Data model
```ts
type Card = {
  id: string
  kind: 'text' | 'image'
  text?: string
  imageDataUrl?: string // downscaled, see 7.2
  note?: string
}

type Tier = {
  id: string
  label: string        // editable
  cardIds: string[]    // ordered
}

type State = {
  title: string        // editable
  tiers: Tier[]        // default: S, A, B, C, D
  pool: string[]       // unranked card ids
  cards: Record<string, Card>
  theme: 'pastel' | 'arcade' | 'dark'
  muted: boolean
}
```
- Persist the whole state to `localStorage` under the key `tierlist.v1`.
- Tier colors are NOT stored. They come from theme tokens by position (`--tier-1` ... `--tier-5`).
- First load: default tiers S/A/B/C/D and ~6 neutral sample text cards in the pool (e.g. food), so dragging can be shown in the first minute.

## 5. Layout
- **Top bar:** editable title, theme switcher, mute toggle, Export PNG, Reset (with confirm).
- **Board:** one row per tier. Left: colored label block (editable). Right: drop zone where cards wrap.
- **Card pool** below the board, with an add-card input (type text, Enter to add), an image upload button, and support for pasting or dropping image files onto the pool.
- **Export area** = title + board only. Pool and controls are excluded.
- Empty tier shows a faint hint. Empty pool shows a friendly empty state.

## 6. Phases

### Phase 1 (0–15 min): Look + drag and drop + first deploy
- Project scaffold, pastel theme with real personality (not Tailwind defaults)
- Layout from section 5
- Drag cards between the pool and tiers, and reorder within a tier. A plain click must NOT start a drag (use a pointer activation distance of ~6px)
- Add text cards and image cards
- Auto-save and restore from localStorage
- **Deploy v1:** git init, GitHub repo `tier-list-maker`, push, Vercel deploy, report the live URL

Done when: dragging works smoothly, a refresh keeps everything, and the live URL opens.

### Phase 2 (15–30 min): Tier names + animation + sound
- Every tier label is editable (click, type, Enter or blur to save). Empty label falls back to the previous value
- On drop, the dropped card plays a spring bounce (about 450ms, scale roughly 0.8 → 1.12 → 0.96 → 1, overshoot easing)
- Drop into the FIRST tier: confetti burst originating from the card position + win sound
- Drop into the LAST tier: "sad drop" (card falls heavily from slightly above, small shake, briefly desaturated) + sad sound
- Any other tier: normal bounce + pop sound
- Sounds via zzfx: `pop`, `win`, `sad`. Unlock audio on the first pointer interaction. Mute toggle is persisted
- Respect `prefers-reduced-motion` (skip confetti and shake, keep sound)

Done when: all three drop outcomes are clearly different and the mute button works.

### Phase 3 (30–45 min): Export PNG
- Export Image button using `html-to-image` (`toPng`) on the export area
- `pixelRatio: 2`, explicit `backgroundColor` taken from the current theme surface color
- Thai text must render correctly and nothing may be clipped
- Downloads as `tierlist.png`. Also a Copy image button using the Clipboard API (`ClipboardItem`) so the image can be pasted straight into Teams chat. Show a small toast on success or failure
- Verify by actually exporting once and viewing the PNG

Done when: the PNG matches what is on screen, including image cards and Thai text.

### Phase 4 (45–60 min): Themes + notes
- Theme switcher with three themes, implemented as CSS variables on `<html data-theme="...">`:
  - **pastel:** soft colors, rounded corners (~16px), gentle shadows
  - **arcade:** dark navy background, neon tier colors, hard pixel-style offset shadows, pixel font for headings only (the pixel font has no Thai glyphs, so fall back to the Thai base font)
  - **dark:** neutral dark surface, muted tier colors, minimal shadow
- Switching must not shift the layout. Persist the theme
- Click a card (not a drag) to open a small dialog or popover: edit the card text, a short note ("why this tier?"), and a delete button. Autosave on blur, Esc closes
- A card with a note shows a small dot indicator
- Re-check that Export PNG looks right in all three themes

Done when: the theme switch is instant and clean, and notes persist after a refresh.

## 7. Details and gotchas

### 7.1 Drag vs click
Use a pointer sensor with an activation distance so clicking a card opens the note dialog and dragging moves it.

### 7.2 Image cards and storage
- Read uploaded or pasted files into a data URL
- Downscale before storing: longest side max 256px, re-encode as WebP or JPEG at ~0.8 quality
- Use data URLs only (never remote URLs), so export is not blocked by cross-origin canvas tainting
- `localStorage` is about 5MB. Catch `QuotaExceededError` and show a toast instead of crashing

### 7.3 Fonts and export
Self-host fonts with `@fontsource` and make sure they are loaded before export (`document.fonts.ready`). Remote font CSS often fails inside `html-to-image`.

### 7.4 Audio
Browsers block audio until a user gesture. The first drag counts as one. Do not play sound on page load.

## 8. Stretch (only if time is left)
- Add or remove tiers
- "Load sample cards" with presets, e.g. Claude use cases and funny topics (8 cards each), so the topic can be picked live
- Keyboard accessibility for moving cards

## 9. Out of scope
Hot take (guess-the-tier) mode, live audience voting, any backend, login or accounts, multi-user sync.

## 10. Priority and cut order
If time runs short, protect from the top and cut from the bottom:
1. **Never cut:** drag and drop, live deploy, Export PNG
2. Cut first: card notes
3. Then: themes (shrink to two themes, then to pastel only)
4. Then: sound
5. Then: confetti and sad-drop extras (keep the simple bounce)

## 11. Definition of done
- [ ] Live Vercel URL works in a fresh browser
- [ ] Drag cards pool ↔ tiers, reorder inside a tier
- [ ] Add text and image cards
- [ ] Rename every tier; reload keeps everything
- [ ] Bounce, confetti (top tier), sad drop (bottom tier), sounds, mute
- [ ] Export PNG looks correct, Thai text included; Copy image works
- [ ] Three themes, no layout jump
- [ ] Card note dialog works
- [ ] PNG posted to the Teams chat
