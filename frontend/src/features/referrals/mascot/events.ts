import type { VoltMood } from './rig'

export type VoltRun = 'copy' | 'team' | 'earnings' | 'tiers' | 'withdraw'

/** Something Volt should say or do right now, from anywhere on the page */
export interface VoltSay {
  text: string
  mood?: VoltMood
  burst?: 'confetti' | 'hearts' | 'sparkles'
  /** how long it stays up, in ms (default 5000) */
  ms?: number
  action?: { label: string; run: VoltRun }
}

/** Other parts of the page tell Volt what just happened (a link copied, a filter changed): it reacts */
export const voltSay = (detail: VoltSay) => window.dispatchEvent(new CustomEvent<VoltSay>('volt:say', { detail }))
