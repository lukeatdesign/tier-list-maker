declare module 'zzfx' {
  export function zzfx(...parameters: (number | undefined)[]): unknown
  export const ZZFX: { volume: number; audioContext: AudioContext }
}
