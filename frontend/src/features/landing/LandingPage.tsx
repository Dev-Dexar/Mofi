import { useState, useEffect, useRef, useLayoutEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  ArrowDown,
  Plus,
} from 'lucide-react'
import { cleanReferralCode, getCurrentUser, hasStoredSession, rememberReferral, storedReferral } from '@/lib/auth'
import AnimatedLogo, { type AnimatedLogoHandle } from './components/AnimatedLogo'
import YieldCalculator from './components/YieldCalculator'
import PartnersStrip from './components/PartnersStrip'
import FeaturesShowcase from './components/FeaturesShowcase'
import OnboardingSteps from './components/onboarding/OnboardingSteps'
import RocketBadge from './components/RocketBadge'
import ClosingCta from './components/ClosingCta'
import CoinButton from './components/CoinButton'
import Footer from './components/Footer'
import { NAV_LINKS } from './config/nav'
import ThemeToggle from '@/components/ui/ThemeToggle'
import { pct, tierRates, useAppSettings, useSettingsReady } from '@/hooks/useAppSettings'

/** A figure that has not arrived yet */
function Pending({ className = '' }: { className?: string }) {
  return <span aria-hidden="true" className={`inline-block h-[0.8em] animate-pulse rounded-lg bg-ink/15 align-middle ${className}`} />
}

export default function LandingPage() {
  const [searchParams] = useSearchParams()
  const urlRef = cleanReferralCode(searchParams.get('ref'))
  const refCode = urlRef ?? storedReferral() // an opened link, or the one kept from an earlier visit: every button below carries it
  const [isAuthenticated, setIsAuthenticated] = useState(hasStoredSession) // right on first paint; confirmed below
  const logoRef = useRef<AnimatedLogoHandle>(null)
  const [openFaq, setOpenFaq] = useState<number | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const cfg = useAppSettings()
  const live = useSettingsReady() // false only on a first-ever visit, until the live rules arrive: figures show as placeholders, not as guesses
  const ratePct = pct(cfg.daily_rate) // e.g. 0.20%
  const aprPct = pct(cfg.daily_rate * 365, 1) // e.g. 73%
  const bonusPct = pct(cfg.direct_bonus_pct, 1) // e.g. 10%
  const tiers = cfg.referral_levels.length // admin-controlled referral tiers
  const [activeSection, setActiveSection] = useState<string | null>(null)
  // Shared transition for the desktop <-> hamburger swap
  const swap =
    'transition-[opacity,filter,scale,translate,visibility] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none'

  // Scroll-spy: highlight the nav link whose section crosses a reading line about a third of the way down the screen.
  // Two things keep the highlight from hopping through every link on the way:
  //  - tapping a link sends the highlight straight to it and holds it there until the page has stopped moving (the scroll passes the
  //    sections in between, and they must not light up); the person taking over (wheel, touch, keys) releases it at once;
  //  - a section only takes the highlight after it has held the reading line for a moment, so a fast flick or a dragged scrollbar
  //    goes past the ones it only crosses.
  const spyLock = useRef<string | null>(null)
  const lockTarget = (id: string) => {
    spyLock.current = id
    setActiveSection(id)
  }
  useEffect(() => {
    const ids = NAV_LINKS.map(([href]) => href.slice(1))
    const visible = new Set<string>()
    let settle = 0
    let hold = 0
    const candidate = () => ids.find((id) => visible.has(id)) ?? null
    const release = () => {
      if (spyLock.current === null) return
      spyLock.current = null
      setActiveSection(candidate())
    }
    const onScroll = () => {
      if (spyLock.current === null) return
      window.clearTimeout(settle)
      settle = window.setTimeout(release, 160) // the page has stopped
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => (e.isIntersecting ? visible.add(e.target.id) : visible.delete(e.target.id)))
        if (spyLock.current !== null) return
        window.clearTimeout(hold)
        hold = window.setTimeout(() => setActiveSection(candidate()), 110)
      },
      { rootMargin: '-35% 0px -60% 0px' },
    )
    ids.forEach((id) => {
      const el = document.getElementById(id)
      if (el) observer.observe(el)
    })
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('wheel', release, { passive: true })
    window.addEventListener('touchstart', release, { passive: true })
    window.addEventListener('keydown', release)
    return () => {
      observer.disconnect()
      window.clearTimeout(settle)
      window.clearTimeout(hold)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('wheel', release)
      window.removeEventListener('touchstart', release)
      window.removeEventListener('keydown', release)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The pill behind the active link sits on it and jumps to the next one when the section changes (no travelling animation).
  const navTrack = useRef<HTMLElement>(null)
  const navLinks = useRef<(HTMLAnchorElement | null)[]>([])
  const navJelly = useRef<HTMLSpanElement>(null)
  const activeIdx = NAV_LINKS.findIndex(([href]) => href.slice(1) === activeSection)
  useLayoutEffect(() => {
    const el = navJelly.current
    if (!el) return
    const box = (i: number) => {
      const a = navLinks.current[i]
      return a ? { l: a.offsetLeft, w: a.offsetWidth, t: a.offsetTop, h: a.offsetHeight } : null
    }
    const place = () => {
      const b = box(activeIdx)
      el.style.opacity = b ? '1' : '0'
      if (!b) return
      el.style.left = `${b.l}px`
      el.style.width = `${b.w}px`
      el.style.top = `${b.t}px`
      el.style.height = `${b.h}px`
    }
    place()

    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [activeIdx])

  // Collapse the mobile menu when the viewport grows to the desktop layout
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const onChange = () => mq.matches && setMenuOpen(false)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    rememberReferral(urlRef)
    getCurrentUser().then((user) => {
      setIsAuthenticated(!!user)
    })
  }, [urlRef])

  // Both carry the referral code; "Sign In" opens the sign-in tab, every call to action the sign-up tab
  const refQuery = refCode ? `&ref=${encodeURIComponent(refCode)}` : ''
  const signinUrl = `/login?mode=signin${refQuery}`
  const loginUrl = `/login?mode=signup${refQuery}`
  // Signed in already: the calls to action go straight in rather than through the login page
  const ctaUrl = isAuthenticated ? '/dashboard' : loginUrl

  const faqs = [
    {
      q: 'How much do I earn?',
      a: `${ratePct} of your deposit every day, which is ${aprPct} a year. It's credited to your wallet at 00:00 UTC.`,
    },
    {
      q: 'How long does my deposit earn?',
      a: `For as long as it's held. There is no end date and no cap: your principal earns ${ratePct} every day. Reinvest what it pays, by hand or automatically after every payout, and your daily income grows with it.`,
    },
    {
      q: 'How does the referral program work?',
      a: `You get ${bonusPct} of every deposit made by someone you invite. When people further down your network deposit, you earn a smaller commission too, up to ${tiers} levels deep.`,
    },
    {
      q: 'Which currencies can I use?',
      a: `Pay with USDT (BEP-20), Bitcoin, Ethereum, Gram or Solana. Whatever you pay with is saved as USDT and your returns are paid in USDT. Network fees are added to what you send, so the full amount is credited. The minimum deposit is ${cfg.min_deposit_usdt} USDT.`,
    },
    {
      q: 'Can I withdraw my deposit?',
      a: `No. Your deposited principal is locked permanently and keeps working for you. What it earns, plus any referral bonuses, is yours to withdraw.`,
    },
    {
      q: 'How do withdrawals work?',
      a: `Withdraw your earnings whenever you like, from ${cfg.min_withdraw_usdt} USDT, as USDT (BEP-20), Bitcoin, Ethereum, Gram or Solana. There is no approval step: it is sent automatically.`,
    },
  ]

  return (
    <div className="min-h-screen bg-base text-text selection:bg-primary selection:text-base">
      {/* Top Navbar (floating pill, expands on mobile) */}
      <header className="fixed top-4 inset-x-0 z-50 px-4 pointer-events-none">
        <div className="pointer-events-auto mx-auto max-w-5xl rounded-[2rem] backdrop-blur-md bg-base/80 border border-ink/10 shadow-2xl shadow-shade/50 ring-1 ring-inset ring-ink/5 overflow-hidden">
          <div className="relative h-16 pl-5 pr-2.5 flex items-center">
            {/* Logo */}
            <Link
              to="/"
              onClick={() => {
                setMenuOpen(false)
                logoRef.current?.ignite()
              }}
              className="flex items-center gap-2.5 group"
            >
              <AnimatedLogo ref={logoRef} className="w-8 h-8" />
              <span className="font-black text-lg tracking-tight text-text">
                MoFi <span className="text-primary font-black">Life</span>
              </span>
            </Link>

            {/* Desktop nav: centered in the pill. Blur/scale fades in at lg, out below */}
            <nav
              ref={navTrack}
              className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-1 whitespace-nowrap text-sm font-semibold text-muted ${swap} opacity-0 blur-md scale-95 invisible pointer-events-none lg:opacity-100 lg:blur-none lg:scale-100 lg:visible lg:pointer-events-auto`}
            >
              <span ref={navJelly} aria-hidden="true" className="pointer-events-none absolute left-0 top-0 h-9 w-0 rounded-full bg-ink/10 opacity-0" />
              {NAV_LINKS.map(([href, label], i) => (
                <a
                  key={href}
                  ref={(el) => {
                    navLinks.current[i] = el
                  }}
                  href={href}
                  onClick={() => lockTarget(href.slice(1))}
                  aria-current={activeSection === href.slice(1) ? 'true' : undefined}
                  className={`relative z-10 rounded-full px-4 py-2 transition-colors duration-300 ${
                    activeSection === href.slice(1) ? 'text-text' : 'hover:text-text'
                  }`}
                >
                  {label}
                </a>
              ))}
            </nav>

            {/* CTA Buttons (desktop) */}
            <div
              className={`absolute right-2.5 inset-y-0 flex items-center gap-2 origin-right whitespace-nowrap ${swap} opacity-0 blur-md scale-95 invisible pointer-events-none lg:opacity-100 lg:blur-none lg:scale-100 lg:visible lg:pointer-events-auto`}
            >
              <ThemeToggle />
              {isAuthenticated ? (
                <Link
                  to="/dashboard"
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-base transition hover:opacity-90 shadow-lg shadow-primary/25"
                >
                  Go to Dashboard
                </Link>
              ) : (
                <>
                  <Link
                    to={signinUrl}
                    className="rounded-full px-4 py-2.5 text-sm font-semibold text-text hover:bg-ink/10 transition"
                  >
                    Sign In
                  </Link>
                  <CoinButton to={loginUrl} size="sm">
                    Get Started
                  </CoinButton>
                </>
              )}
            </div>

            {/* Theme switch (mobile), left of the hamburger. Inverse of the desktop group, like the hamburger */}
            <div
              className={`absolute right-[3.25rem] top-1/2 -translate-y-1/2 origin-right ${swap} lg:opacity-0 lg:blur-md lg:scale-90 lg:invisible lg:pointer-events-none`}
            >
              <ThemeToggle />
            </div>

            {/* Hamburger (mobile). Inverse of the desktop group */}
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={menuOpen}
              aria-controls="mobile-menu"
              className={`absolute right-2.5 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full hover:bg-ink/10 origin-right ${swap} lg:opacity-0 lg:blur-md lg:scale-90 lg:invisible lg:pointer-events-none`}
            >
              {[
                menuOpen ? 'rotate-45' : '-translate-y-[6px]',
                menuOpen ? 'opacity-0' : '',
                menuOpen ? '-rotate-45' : 'translate-y-[6px]',
              ].map((cls, i) => (
                <span
                  key={i}
                  className={`absolute left-1/2 top-1/2 -ml-[9px] -mt-px h-0.5 w-[18px] rounded-full bg-text transition-all duration-300 ${cls}`}
                />
              ))}
            </button>
          </div>

          {/* Mobile menu: height animates via grid-template-rows */}
          <div
            id="mobile-menu"
            className={`grid transition-[grid-template-rows,opacity,filter] duration-300 ease-out motion-reduce:transition-none ${
              menuOpen ? 'grid-rows-[1fr] opacity-100 blur-none' : 'grid-rows-[0fr] opacity-0 blur-sm'
            }`}
            inert={!menuOpen}
          >
            <div className="overflow-hidden">
              <nav className="px-3 pb-3 flex flex-col gap-1 text-base font-semibold text-muted">
                <div className="h-px bg-ink/10 mx-2 mb-2" />
                {NAV_LINKS.map(([href, label]) => (
                  <a
                    key={href}
                    href={href}
                    onClick={() => {
                      setMenuOpen(false)
                      lockTarget(href.slice(1))
                    }}
                    aria-current={activeSection === href.slice(1) ? 'true' : undefined}
                    className={`px-4 py-3 transition ${
                      activeSection === href.slice(1) ? 'text-text' : 'hover:text-text'
                    }`}
                  >
                    {label}
                  </a>
                ))}
                <div className="flex flex-col gap-2 pt-2">
                  {isAuthenticated ? (
                    <Link
                      to="/dashboard"
                      className="rounded-full bg-primary px-5 py-3 text-center text-sm font-bold text-base"
                    >
                      Go to Dashboard
                    </Link>
                  ) : (
                    <>
                      <Link
                        to={signinUrl}
                        className="rounded-full border border-ink/10 bg-ink/5 px-5 py-3 text-center text-sm font-semibold text-text"
                      >
                        Sign In
                      </Link>
                      <CoinButton to={loginUrl} size="md">
                        Get Started
                      </CoinButton>
                    </>
                  )}
                </div>
              </nav>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative pt-28 pb-8 sm:pt-44 lg:pb-32 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto text-center space-y-7 sm:space-y-8">
        {/* Main Title */}
        <h1 className="text-[min(2.6rem,calc((100vw-2rem)/7.6))] min-[400px]:text-[min(3rem,calc((100vw-2rem)/7.6))] sm:text-7xl lg:text-8xl xl:text-9xl font-black tracking-[-0.04em] max-w-6xl mx-auto leading-[1.08] sm:leading-[1.05] text-balance">
          {/* each line stays one line: the two are nearly the same width, and a hair of difference in how the browser measures them (the rocket
              badge, the tight letter spacing, a larger text size set on the phone) used to push "autopilot." down on its own. The size is capped so
              the longer line always fits the screen. */}
          <span className="block whitespace-nowrap">
            Earn{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent2">
              {live ? ratePct : <Pending className="w-[3ch]" />} daily
            </span>
          </span>
          <span className="block whitespace-nowrap text-text/90">on <RocketBadge />autopilot.</span>
        </h1>

        <p className="text-base sm:text-2xl text-muted max-w-xs sm:max-w-lg mx-auto leading-relaxed text-balance">
          Deposit in any major crypto. Get paid in USDT every midnight.
        </p>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <CoinButton to={ctaUrl} className="w-full sm:w-auto">
            Start earning
          </CoinButton>
          <a
            href="#calculator"
            className="group w-full sm:w-auto rounded-full border border-ink/10 px-8 py-3.5 text-base font-semibold text-text/80 hover:text-text active:scale-95 transition-transform duration-200 flex items-center justify-center gap-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {/* Label rolls up and a copy rolls in from below, like the earnings digits */}
            <span className="relative block overflow-hidden leading-normal">
              <span className="block transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:-translate-y-full group-focus-visible:-translate-y-full">
                Calculate my ROI
              </span>
              <span aria-hidden="true" className="absolute inset-x-0 top-full block transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:-translate-y-full group-focus-visible:-translate-y-full text-primary">
                Calculate my ROI
              </span>
            </span>
            <span className="relative block size-4 overflow-hidden">
              <ArrowDown className="absolute inset-0 size-4 transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:translate-y-full group-focus-visible:translate-y-full" />
              <ArrowDown aria-hidden="true" className="absolute inset-0 size-4 -translate-y-full text-primary transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:translate-y-0 group-focus-visible:translate-y-0" />
            </span>
          </a>
        </div>

        {/* Stats Strip: a 4-up row on desktop; on phones two stats at a time roll up, forever */}
        {(() => {
          const stats = [
            [ratePct, 'Daily yield'],
            [aprPct, 'Annual (APR)'],
            [bonusPct, 'Direct bonus'],
            [String(tiers), 'Referral tiers'],
          ]
          const cell = ([value, label]: string[]) => (
            <div key={label} className="px-4">
              <dt className="text-2xl sm:text-4xl font-black tracking-tight text-text">{live ? value : <Pending className="w-[3ch]" />}</dt>
              <dd className="mt-1 text-xs sm:text-sm text-muted">{label}</dd>
            </div>
          )
          const pairs = [stats.slice(0, 2), stats.slice(2), stats.slice(0, 2)] // first pair repeats so the loop is seamless
          return (
            <>
              <dl className="hidden lg:grid pt-16 grid-cols-4 max-w-4xl mx-auto divide-x divide-ink/10">
                {stats.map(cell)}
              </dl>
              <div className="lg:hidden motion-reduce:hidden pt-6">
                <div
                  className="h-16 overflow-hidden"
                  style={{ maskImage: 'linear-gradient(transparent, #000 14%, #000 86%, transparent)', WebkitMaskImage: 'linear-gradient(transparent, #000 14%, #000 86%, transparent)' }}
                >
                <div className="stat-roll">
                  {pairs.map((pair, i) => (
                    <dl key={i} aria-hidden={i === 2 || undefined} className="h-16 grid grid-cols-2 content-center">
                      {pair.map(cell)}
                    </dl>
                  ))}
                </div>
                </div>
              </div>
              <dl className="hidden motion-reduce:grid lg:motion-reduce:hidden pt-6 grid-cols-2 gap-y-8">{stats.map(cell)}</dl>
            </>
          )
        })()}
      </section>

      {/* Where We Invest & Institutional Allocation */}
      <PartnersStrip />

      {/* Interactive Yield Calculator */}
      <section id="calculator" className="py-20 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto space-y-10">
        <div className="text-center space-y-3">
          <h2 className="text-4xl sm:text-5xl font-black tracking-tight text-balance">
            See what your deposit earns.
          </h2>
          <p className="text-lg text-muted">Pick an amount. Watch it grow.</p>
        </div>
        <div className={live ? '' : 'pointer-events-none animate-pulse opacity-40 blur-[3px]'}>
          <YieldCalculator />
        </div>
      </section>

      {/* Core Platform Features */}
      <section id="features" className="py-20 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto space-y-12">
        <div className="text-center space-y-3">
          <h2 className="text-4xl sm:text-5xl font-black tracking-tight text-balance">What you actually get.</h2>
          <p className="text-lg text-muted">Four rules, no fine print.</p>
        </div>

        <div className={live ? '' : 'pointer-events-none animate-pulse opacity-40 blur-[3px]'}>
          <FeaturesShowcase dailyRate={cfg.daily_rate} levels={tierRates(cfg)} />
        </div>
      </section>

      {/* How It Works (3 Steps) */}
      <section id="how-it-works" className="py-20 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto space-y-20">
        <div className="text-center space-y-3">
          <h2 className="text-4xl sm:text-5xl font-black tracking-tight text-balance">Start in three steps.</h2>
          <p className="text-lg text-muted">From sign-up to your first payout in minutes.</p>
        </div>
        <OnboardingSteps bonusPct={bonusPct} tiers={tiers} minDeposit={cfg.min_deposit_usdt} />
      </section>

      {/* FAQ */}
      <section id="faq" className="py-20 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.6fr] lg:gap-20">
          <div className="lg:sticky lg:top-28 lg:self-start space-y-3">
            <h2 className="text-4xl sm:text-5xl font-black tracking-tight text-balance">Questions, answered.</h2>
            <p className="text-lg text-muted">The short version of how MoFi Life works.</p>
          </div>

          <div>
            {faqs.map((faq, idx) => {
              const open = openFaq === idx
              return (
                <div key={faq.q} className="border-b border-ink/10 last:border-b-0">
                  <button
                    onClick={() => setOpenFaq(open ? null : idx)}
                    aria-expanded={open}
                    className="group flex w-full cursor-pointer items-center justify-between gap-6 py-6 text-left"
                  >
                    <span className={`text-lg font-semibold tracking-tight transition-colors ${open ? 'text-text' : 'text-text/80 group-hover:text-text'}`}>
                      {faq.q}
                    </span>
                    <Plus
                      className={`size-5 shrink-0 text-muted transition-transform duration-300 ${open ? 'rotate-45 text-text' : ''}`}
                    />
                  </button>
                  <div
                    className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none ${
                      open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                    }`}
                  >
                    <div className="overflow-hidden">
                      <p className="max-w-xl pb-6 text-base leading-relaxed text-muted">{faq.a}</p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Closing CTA */}
      <ClosingCta loginUrl={ctaUrl} ratePct={ratePct} />

      <Footer />
    </div>
  )
}
