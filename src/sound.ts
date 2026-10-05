import { zzfx, ZZFX } from 'zzfx'

let unlocked = false

/** browsers block audio until a gesture — resume on the first pointer interaction */
export function unlockAudio() {
  if (unlocked) return
  unlocked = true
  void ZZFX.audioContext.resume()
}

const note = (f: number, delay: number) => setTimeout(() => zzfx(1, 0.02, f, 0.01, 0.09, 0.22, 0, 1.4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.7, 0.05), delay)

export const sounds = {
  pop: () => void zzfx(1, 0.05, 380, 0.005, 0.03, 0.08, 1, 1.8, -6, 0, 0, 0, 0, 0, 0, 0, 0, 0.6, 0.02),
  win: () => [523, 659, 784, 1047].forEach((f, i) => note(f, i * 90)),
  sad: () => {
    zzfx(1, 0.05, 220, 0.02, 0.2, 0.4, 2, 1.2, -8, 0, 0, 0, 0, 0, 0, 0.1, 0, 0.6, 0.1)
    setTimeout(() => zzfx(1, 0.05, 140, 0.02, 0.3, 0.5, 2, 1.2, -10, 0, 0, 0, 0, 0, 0, 0.1, 0, 0.6, 0.1), 260)
  },
}
