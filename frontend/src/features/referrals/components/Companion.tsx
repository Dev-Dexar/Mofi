import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ReferralOverview } from '@/lib/api'
import { formatDecimal } from '@/lib/formatters'
import type { VoltRun, VoltSay } from '../mascot/events'
import Mascot, { preloadMascot, type MascotHandle } from '../mascot/Mascot'
import type { Burst, VoltMood } from '../mascot/rig'
import { bone, useCopy } from './shared'

type Tip = { text: string; mood: VoltMood; fx?: Burst; shine?: boolean; hop?: boolean; action?: { label: string; run: VoltRun } }

const money = (v: string) => `$${formatDecimal(v)}`
const percent = (v: number) => `${+(v * 100).toFixed(2)}%`
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
const SLEEP_AFTER_MS = 50_000
const NAME = 'Mo'

/** What the coin has to say, from the numbers, most useful first. The first visit of a session opens with a hello. */
function tipsFor(d: ReferralOverview, name: string, hello: boolean): Tip[] {
  const { direct, active_direct: active, total } = d.members
  const deeper = Math.max(total - direct, 0)
  const first = d.levels[0] ? parseFloat(d.levels[0].percentage) : 0
  const deepShare = d.levels.filter((l) => l.level > 1).reduce((n, l) => n + parseFloat(l.percentage), 0)
  const thisMonth = parseFloat(d.this_month)
  const lastMonth = parseFloat(d.monthly[d.monthly.length - 2]?.amount ?? '0')
  const out: Tip[] = []

  if (hello) out.push({ text: `Hi! I'm ${name}, your referral buddy. I'll keep an eye on your numbers.`, mood: 'excited', fx: 'sparkles', hop: true })

  if (direct === 0)
    out.push({
      text: "It's quiet in here. Share your link and I'll cheer for every friend who joins!",
      mood: 'sleepy',
      action: { label: 'Copy link', run: 'copy' },
    })
  else if (active < direct) {
    const n = direct - active
    out.push({
      text: `*${n} of your ${direct}* friends ${n === 1 ? "hasn't" : "haven't"} deposited yet. A friendly nudge could help.`,
      mood: 'think',
      action: { label: 'See who', run: 'team' },
    })
  } else out.push({ text: `All *${direct}* of your friends have deposited. You're on a roll!`, mood: 'proud', fx: 'sparkles', shine: true })

  if (thisMonth > 0)
    out.push({
      text: `Cha-ching! You earned *${money(d.this_month)}* this month${lastMonth > 0 && thisMonth > lastMonth ? ', more than all of last month' : ''}.`,
      mood: 'rich',
      fx: 'coins',
      hop: true,
      action: { label: 'See earnings', run: 'earnings' },
    })
  else if (lastMonth > 0)
    out.push({ text: 'Nothing yet this month. A message to your friends could change that.', mood: 'sad', action: { label: 'Copy link', run: 'copy' } })

  if (parseFloat(d.available) > 0)
    out.push({
      text: `*${money(d.available)}* is ready to withdraw whenever you want it.`,
      mood: 'cool',
      shine: true,
      action: { label: 'Withdraw', run: 'withdraw' },
    })
  if (deeper > 0)
    out.push({
      text: `Your friends brought in *${deeper} more ${deeper === 1 ? 'person' : 'people'}*. You earn from them too, up to *${percent(deepShare)}*.`,
      mood: 'excited',
      fx: 'sparkles',
      action: { label: 'See tiers', run: 'tiers' },
    })
  if (first > 0)
    out.push({
      text: `A direct friend's deposit pays you *${percent(first)}*. Share your link where your friends already hang out.`,
      mood: 'happy',
      action: { label: 'Copy link', run: 'copy' },
    })
  return out
}

const plain = (t: string) => t.replace(/\*/g, '')

/** The first `n` letters of a message, with the parts between *stars* picked out in bold green */
function Letters({ text, n }: { text: string; n: number }) {
  let left = n
  return (
    <>
      {text.split('*').map((part, i) => {
        const take = part.slice(0, Math.max(left, 0))
        left -= part.length
        return i % 2 ? (
          <strong key={i} className="font-bold text-primary">
            {take}
          </strong>
        ) : (
          <span key={i}>{take}</span>
        )
      })}
    </>
  )
}

/** Types its text out; the full text is laid out invisibly underneath so the bubble never changes size. Says when it is typing, so the mouth can move. */
function Typed({ text, onTyping }: { text: string; onTyping: (typing: boolean) => void }) {
  const length = plain(text).length
  const [shown, setShown] = useState(0)
  useEffect(() => {
    if (reduced()) {
      setShown(length)
      return
    }
    setShown(0)
    const id = window.setInterval(() => setShown((n) => (n >= length ? (window.clearInterval(id), n) : n + 1)), 18)
    return () => window.clearInterval(id)
  }, [text, length])
  const typing = shown < length
  useEffect(() => {
    onTyping(typing)
    return () => onTyping(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typing])
  return (
    <span className="relative block">
      <span className="invisible">{plain(text)}</span>
      <span className="absolute inset-0" aria-hidden="true">
        <Letters text={text} n={shown} />
        {typing && <span className="ml-px inline-block h-3.5 w-0.5 translate-y-0.5 animate-pulse bg-primary" />}
      </span>
      <span className="sr-only">{plain(text)}</span>
    </span>
  )
}

const MOOD_LABEL: Record<VoltMood, string> = {
  idle: 'keeping watch',
  happy: 'feeling good',
  excited: 'excited',
  cool: 'chilling',
  sleepy: 'napping',
  think: 'thinking',
  sad: 'a bit down',
  proud: 'proud',
  love: 'happy',
  rich: 'cha-ching',
}

/**
 * The top half of the invite card, above the link: Mo, a small mascot who watches the numbers and says what is worth knowing. Everything it does is
 * automatic. The story sets its mood (cheering over earnings, thinking about friends who have not deposited, asleep when you have invited
 * no one, sunglasses when money is ready to withdraw, a crown when every friend has deposited), the page sets off reactions (a copied
 * link, a changed filter), it dozes off when left alone, and it perks up if you poke or hover it.
 */
export default function Companion({ data, onTab }: { data: ReferralOverview | null; onTab: (tab: 'overview' | 'earnings' | 'team') => void }) {
  const navigate = useNavigate()
  const copy = useCopy()
  const coin = useRef<MascotHandle>(null)
  useEffect(() => preloadMascot(), [])

  const [hello] = useState(() => {
    try {
      const seen = sessionStorage.getItem('mofi_mascot_hello')
      sessionStorage.setItem('mofi_mascot_hello', '1')
      return !seen
    } catch {
      return false
    }
  })
  const tips = useMemo(() => (data ? tipsFor(data, NAME, hello) : []), [data, hello])
  const [i, setI] = useState(0)
  const [paused, setPaused] = useState(false)
  const [talking, setTalking] = useState(false)
  const [asleep, setAsleep] = useState(false)
  const [say, setSay] = useState<(VoltSay & { key: number }) | null>(null)
  const sayTimer = useRef(0)
  const sayKey = useRef(0)

  const tip = tips.length ? tips[i % tips.length] : null
  const shown: { text: string; mood: VoltMood; action?: Tip['action'] } | null = say ? { text: say.text, mood: say.mood ?? 'happy', action: say.action } : tip
  const mood: VoltMood = asleep ? 'sleepy' : (shown?.mood ?? 'think')

  const speak = useCallback((m: VoltSay) => {
    window.clearTimeout(sayTimer.current)
    setSay({ ...m, key: ++sayKey.current })
    if (m.ms !== Infinity) sayTimer.current = window.setTimeout(() => setSay(null), m.ms ?? 5000)
    if (m.burst) coin.current?.burst(m.burst === 'confetti' ? 'confetti' : m.burst, m.burst === 'hearts' ? 8 : 16)
    coin.current?.hop(0.8)
  }, [])

  useEffect(() => () => window.clearTimeout(sayTimer.current), [])
  useEffect(() => setI(0), [tips])

  // a tip's own show: a hop, a burst of coins, a shine
  const tipKey = tip ? `${i % tips.length}-${tip.text}` : ''
  useEffect(() => {
    if (!tip || say || asleep) return
    const id = window.setTimeout(() => {
      if (tip.hop) coin.current?.hop()
      if (tip.fx) coin.current?.burst(tip.fx, tip.fx === 'coins' ? 12 : 10)
      if (tip.shine) coin.current?.shine()
    }, 350)
    return () => window.clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipKey])

  // one tip after another, unless the pointer rests on the card or something is being said
  useEffect(() => {
    if (tips.length < 2 || paused || say || asleep) return
    const id = window.setInterval(() => setI((n) => n + 1), 9500)
    return () => window.clearInterval(id)
  }, [tips, paused, say, asleep, i])

  // the page tells it what just happened
  useEffect(() => {
    const on = (e: Event) => {
      setAsleep(false)
      speak((e as CustomEvent<VoltSay>).detail)
    }
    window.addEventListener('volt:say', on)
    return () => window.removeEventListener('volt:say', on)
  }, [speak])

  // it dozes off when left alone, and startles awake when you come back
  const lastSeen = useRef(Date.now())
  const wake = useCallback(() => {
    setAsleep(false)
    setSay(null)
    coin.current?.hop(1.1)
    coin.current?.flash('excited', 1200)
    speak({ text: "Oh! You're back!", mood: 'excited', ms: 2600 })
  }, [speak])
  useEffect(() => {
    const seen = () => {
      lastSeen.current = Date.now()
    }
    const events = ['pointermove', 'keydown', 'pointerdown', 'scroll'] as const
    events.forEach((n) => window.addEventListener(n, seen, { passive: true }))
    const id = window.setInterval(() => {
      if (Date.now() - lastSeen.current > SLEEP_AFTER_MS && !asleep) {
        setAsleep(true)
        speak({ text: 'Zzz… wake me when something happens.', mood: 'sleepy', ms: Infinity })
      }
    }, 3000)
    return () => {
      events.forEach((n) => window.removeEventListener(n, seen))
      window.clearInterval(id)
    }
  }, [asleep, speak])
  useEffect(() => {
    if (!asleep) return
    const wakeUp = () => wake()
    const t = window.setTimeout(() => window.addEventListener('pointermove', wakeUp, { once: true }), 1200)
    return () => {
      window.clearTimeout(t)
      window.removeEventListener('pointermove', wakeUp)
    }
  }, [asleep, wake])

  // ----- what you can do to it -----
  const pokes = useRef({ n: 0, at: 0 })
  const petTimer = useRef(0)
  const petting = useRef(false)

  const poke = () => {
    if (asleep) return wake()
    const now = Date.now()
    pokes.current = { n: now - pokes.current.at < 2500 ? pokes.current.n + 1 : 1, at: now }
    const n = pokes.current.n
    coin.current?.hop()
    coin.current?.flash('excited', 1000)
    coin.current?.burst('coins', 5)
    if (n === 3) speak({ text: 'Hehe, that tickles!', mood: 'love', burst: 'hearts', ms: 3000 })
    else if (n === 6) {
      coin.current?.flip()
      speak({ text: 'Whee! Did you see that flip?', mood: 'proud', ms: 3200 })
    } else if (n === 9) {
      speak({ text: "Okay okay, I'm dizzy…", mood: 'think', ms: 3200 })
      pokes.current.n = 0
    } else setI((x) => x + 1)
  }
  const enter = () => {
    petTimer.current = window.setTimeout(() => {
      petting.current = true
      coin.current?.flash('love', 60_000)
      coin.current?.burst('hearts', 6)
    }, 900)
  }
  const leave = () => {
    window.clearTimeout(petTimer.current)
    if (petting.current) {
      petting.current = false
      coin.current?.flash('love', 300)
    }
  }

  const act = (run: VoltRun) => {
    if (run === 'copy') void copy(data?.share_link ?? '', 'Link')
    else if (run === 'withdraw') navigate('/wallet?tab=withdraw')
    else onTab(run === 'tiers' ? 'overview' : run)
  }

  const texts = [...tips.map((t) => plain(t.text)), ...(say ? [plain(say.text)] : [])]

  return (
    <div className="p-4" onPointerEnter={() => setPaused(true)} onPointerLeave={() => setPaused(false)}>
      <div className="flex items-center gap-1.5">
        {/* the mascot: it reacts to a poke or a hover, everything else it does by itself */}
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={poke}
            onPointerEnter={enter}
            onPointerLeave={leave}
            aria-label={`Poke ${NAME}`}
            className="block cursor-pointer touch-manipulation rounded-3xl outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          >
            <Mascot ref={coin} mood={mood} talking={talking && !asleep} className="size-28" />
          </button>
        </div>

        {/* what it says */}
        <div className="relative min-w-0 flex-1">
          <span aria-hidden="true" className="absolute -left-1.5 top-1/2 size-3 -translate-y-1/2 rotate-45 border-b border-l border-ink/5 bg-base" />
          <div className="rounded-2xl border border-ink/5 bg-base px-3.5 py-3" aria-live="polite">
            {shown ? (
              <>
                <div className="mb-1 flex items-center justify-between gap-3">
                  <p className="flex items-center gap-1.5 text-[0.625rem] font-bold uppercase tracking-wider text-primary">
                    {NAME}
                    <span className="font-medium normal-case tracking-normal text-muted">· {MOOD_LABEL[mood]}</span>
                  </p>
                  <div className="flex items-center gap-1" role="group" aria-label="Tips">
                    {tips.length > 1 &&
                      tips.map((_, n) => (
                        <button
                          key={n}
                          type="button"
                          aria-label={`Tip ${n + 1}`}
                          aria-current={n === i % tips.length}
                          onClick={() => {
                            setSay(null)
                            setI(n)
                          }}
                          className={`h-1.5 rounded-full transition-[width,background-color] duration-300 ${n === i % tips.length ? 'w-4 bg-primary' : 'w-1.5 bg-ink/20 hover:bg-ink/35'}`}
                        />
                      ))}
                  </div>
                </div>
                <div>
                  {/* every message is laid out invisibly in the same spot, so the bubble is always as tall as the longest one */}
                  <div className="grid text-[0.8125rem] leading-snug text-text/90">
                    {texts.map((t, n) => (
                      <span key={n} aria-hidden="true" className="invisible col-start-1 row-start-1">
                        {t}
                      </span>
                    ))}
                    <p className="col-start-1 row-start-1">
                      <Typed key={say ? `s${say.key}` : tipKey} text={shown.text} onTyping={setTalking} />
                    </p>
                  </div>
                  <div className="mt-2 flex h-7 items-center">
                    {shown.action && (
                      <button
                        type="button"
                        onClick={() => act(shown.action!.run)}
                        className="inline-flex h-7 items-center rounded-full bg-primary/15 px-3 text-xs font-bold text-primary transition-[background-color,scale] hover:bg-primary/25 active:scale-95"
                      >
                        {shown.action.label}
                      </button>
                    )}
                  </div>
                </div>
              </>
            ) : (
              // laid out like the real bubble (name row, three lines of text, the button row), so the card is the height it will be
              <div aria-hidden="true">
                <div className="mb-1 flex h-[0.9375rem] items-center">
                  <span className={`block h-2.5 w-20 ${bone}`} />
                </div>
                <div className="flex h-[3.35rem] flex-col justify-between py-[0.2rem]">
                  <span className={`block h-3 w-full ${bone}`} />
                  <span className={`block h-3 w-full ${bone}`} />
                  <span className={`block h-3 w-2/3 ${bone}`} />
                </div>
                <div className="mt-2 h-7" />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
