import React, { type ComponentType, addTransitionType, startTransition, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, NavLink, useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import Logo from '@/components/brand/Logo'
import GlitchText from '@/components/brand/GlitchText'
import { AdminIcon, AppealIcon, ChartIcon, DashboardIcon, GiftIcon, HistoryIcon, SettingsIcon, UsersIcon, WalletIcon } from '@/icons'
import { useReloadScroll } from './useReloadScroll'
import ProfileWindow from '@/features/profile/ProfileWindow'
import { ArrowLeft, LogOut } from 'lucide-react'
import SignOutConfirm from '@/features/auth/SignOutConfirm'
import { api } from '@/lib/api'
import type { MeResponse } from '@/lib/api'
import { inkAlpha } from '@/lib/theme'

interface AppLayoutProps {
  children: React.ReactNode
  /** the member app, or the admin panel: the same frame, its own menu */
  mode?: 'app' | 'admin'
}

/** The count of what is waiting, sitting on the corner of a menu icon (over it, never beside it) */
function NavBadge({ n, small = false }: { n: number; small?: boolean }) {
  return (
    <span
      aria-label={`${n} waiting`}
      className={`absolute grid place-items-center rounded-full bg-accent2 font-black tabular-nums leading-none text-[color:var(--color-base)] ring-2 ring-surface ${
        small ? '-right-2 -top-1.5 h-3.5 min-w-3.5 px-1 text-[9px]' : '-right-2.5 -top-2 h-4 min-w-4 px-1 text-[10px]'
      }`}
    >
      {n > 99 ? '99+' : n}
    </span>
  )
}

type NavItem = { name: string; short?: string; to: string; icon: ComponentType<{ className?: string }>; badge?: number; /** in the desktop rail only: a phone's bar holds five */ railOnly?: boolean }

const APP_NAV: NavItem[] = [
  { name: 'Dashboard', short: 'Home', to: '/dashboard', icon: DashboardIcon },
  { name: 'Wallet', to: '/wallet', icon: WalletIcon },
  { name: 'Referrals', to: '/referrals', icon: GiftIcon },
  { name: 'History', to: '/history', icon: HistoryIcon },
]

const ADMIN_NAV: NavItem[] = [
  { name: 'Overview', short: 'Home', to: '/admin', icon: DashboardIcon },
  { name: 'Users', to: '/admin/users', icon: UsersIcon },
  { name: 'Money', to: '/admin/money', icon: WalletIcon },
  { name: 'Appeals', to: '/admin/appeals', icon: AppealIcon },
  { name: 'Analytics', short: 'Stats', to: '/admin/analytics', icon: ChartIcon },
  // five is as many as a phone's bar holds, so on a phone Settings is in the profile window instead (admins only)
  { name: 'Settings', to: '/admin/settings', icon: SettingsIcon, railOnly: true },
]

const ease = 'cubic-bezier(0.22,1,0.36,1)'
const DURATION = 360 // the rail and the page beside it move together, so it all reads as one motion
const OPEN_PX = 240
const CLOSED_PX = 72
const MID_PX = (OPEN_PX + CLOSED_PX) / 2 // dragged past this, it settles open; short of it, closed
const clampWidth = (w: number) => Math.min(OPEN_PX + 16, Math.max(CLOSED_PX, w))
const NAV_KEY = 'mofi_nav'
const WIDE = 1280 // from here the rail opens by itself, unless the visitor chose

/** Open or minimised: the visitor's choice when they made one, otherwise whatever suits the screen */
function useRail() {
  const read = (): 'open' | 'closed' | null => {
    try {
      const v = localStorage.getItem(NAV_KEY)
      return v === 'open' || v === 'closed' ? v : null
    } catch {
      return null
    }
  }
  const [chosen, setChosen] = useState(read)
  const [wide, setWide] = useState(() => window.innerWidth >= WIDE)
  useEffect(() => {
    const onResize = () => setWide(window.innerWidth >= WIDE)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  const open = chosen ? chosen === 'open' : wide
  const setOpen = (next: boolean) => {
    setChosen(next ? 'open' : 'closed')
    try {
      localStorage.setItem(NAV_KEY, next ? 'open' : 'closed')
    } catch {
      /* the choice just does not stick */
    }
  }
  return { open, setOpen }
}

export function AppLayout({ children, mode = 'app' }: AppLayoutProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const [userData, setUserData] = useState<MeResponse | null>(() => api.getCached<MeResponse>('/me'))
  useReloadScroll()
  const { open, setOpen } = useRail()

  // Grabbing the pill's edge stretches it live; letting go settles it open or minimised
  const [drag, setDrag] = useState<number | null>(null)
  const grab = useRef<{ startX: number; startW: number; w: number; moved: boolean } | null>(null)
  const width = drag ?? (open ? OPEN_PX : CLOSED_PX)
  const show = width > MID_PX // labels only once there is room for them
  useEffect(() => {
    if (drag === null) return
    document.body.style.cursor = 'ew-resize'
    document.body.style.userSelect = 'none'
    return () => {
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [drag === null])

  // Ends a grab, whichever way it ends: release, cancel, losing the pointer, the button already being up, or the window losing focus.
  // (Relying on pointerup alone could miss, leaving the rail glued to the cursor.)
  const endGrab = () => {
    const g = grab.current
    grab.current = null
    if (g) setOpen(g.moved ? g.w > MID_PX : !open) // a drag settles by where it ended; a click flips it
    setDrag(null)
  }
  useEffect(() => {
    if (drag === null) return
    window.addEventListener('blur', endGrab)
    return () => window.removeEventListener('blur', endGrab)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag === null])

  // The profile is a window over whatever page you are on, addressed as ?profile so it can be linked and the Back button closes it
  const profileOpen = searchParams.has('profile')

  useEffect(() => {
    let mounted = true
    api.getMe()
      .then((data) => {
        if (mounted) setUserData(data)
      })
      .catch(() => {}) // a suspended account is sent to /suspended by the API client itself
    return () => {
      mounted = false
    }
  }, [profileOpen]) // and when the profile window closes, so a new name or photo shows in the rail
  const openedHere = (location.state as { profile?: boolean } | null)?.profile === true
  const [clickedOpen, setClickedOpen] = useState(false) // opened by a click in this visit; a direct link or a reload starts already open

  const openProfile = (e: React.MouseEvent<HTMLElement>) => {
    e.preventDefault()
    setClickedOpen(true)
    const next = new URLSearchParams(searchParams)
    next.set('profile', '')
    navigate({ pathname: location.pathname, search: `?${next.toString().replace('profile=', 'profile')}` }, { state: { profile: true } })
  }
  const closeProfile = () => {
    if (openedHere) return navigate(-1) // opened by a click: step back to where we were
    const next = new URLSearchParams(searchParams)
    next.delete('profile')
    setSearchParams(next, { replace: true }) // opened by a link or reload: just drop the parameter
  }
  const [confirmSignOut, setConfirmSignOut] = useState(false) // signing out asks first

  const admin = mode === 'admin'
  // appeals waiting for review show as a count on their menu item (refreshed with every page change)
  const navItems = admin ? ADMIN_NAV.map((item) => (item.to === '/admin/appeals' ? { ...item, badge: userData?.pending_appeals || 0 } : item)) : APP_NAV
  // a page inside a section (one user, say) lights up its section; the overview only lights up on itself
  const activeIndex = navItems.findIndex((item) =>
    item.to === '/admin' ? location.pathname === '/admin' : location.pathname === item.to || location.pathname.startsWith(`${item.to}/`),
  )
  // the phone's bar has no room for the rail-only items
  const dockItems = navItems.filter((item) => !item.railOnly)
  const dockActive = dockItems.findIndex((item) =>
    item.to === '/admin' ? location.pathname === '/admin' : location.pathname === item.to || location.pathname.startsWith(`${item.to}/`),
  )
  // admins move between the app and the panel from the foot of the menu
  const switchTo = userData?.is_admin || admin ? (admin ? { to: '/dashboard', label: 'Back to app', icon: ArrowLeft } : { to: '/admin', label: 'Admin panel', icon: AdminIcon }) : null


  // Desktop rail: the same jelly as the phone bar, running down instead of across. The blob behind the active link gathers into a
  // droplet behind its icon, the droplet stretches down (or up) to the next icon and tightens, then spreads back into the blob.
  const track = useRef<HTMLElement>(null)
  const links = useRef<(HTMLAnchorElement | null)[]>([])
  const railJelly = useRef<HTMLSpanElement>(null)
  const railLast = useRef<number | null>(null)
  useLayoutEffect(() => {
    const el = railJelly.current
    if (!el) return
    const box = (i: number) => {
      const a = links.current[i]
      return a ? { t: a.offsetTop, h: a.offsetHeight } : null
    }
    const B = box(activeIndex)
    el.style.opacity = B ? '1' : '0'
    if (!B) return
    el.style.top = `${B.t}px`
    el.style.height = `${B.h}px`

    const before = railLast.current
    railLast.current = activeIndex
    const A = before !== null && before >= 0 ? box(before) : null
    const W = track.current?.offsetWidth ?? 0
    if (A && W && before !== activeIndex && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const soft = inkAlpha(0.09)
      const drop = 'rgba(16,185,129,0.55)'
      // the icon sits 16px in from the link's left edge and is 24px wide
      const bead = (t: number, h: number, extra = 0, w = 24) => ({
        left: `${16 + (24 - w) / 2}px`,
        width: `${w}px`,
        top: `${t + 12}px`,
        height: `${h + extra}px`,
        backgroundColor: drop,
      })
      const lo = Math.min(A.t, B.t)
      el.animate(
        [
          { left: '0px', width: `${W}px`, top: `${A.t}px`, height: `${A.h}px`, backgroundColor: soft, offset: 0, easing: 'cubic-bezier(0.5,0,0.7,0.4)' },
          { ...bead(A.t, 24), offset: 0.24, easing: 'cubic-bezier(0.4,0,0.2,1)' },
          { ...bead(lo, 24, Math.abs(B.t - A.t), 17), offset: 0.5, easing: 'cubic-bezier(0.3,0,0.3,1)' },
          { ...bead(B.t, 24), offset: 0.7, easing: 'cubic-bezier(0.3,0.6,0.4,1)' },
          { left: '-2px', width: `${W + 4}px`, top: `${B.t - 2}px`, height: `${B.h + 4}px`, backgroundColor: soft, offset: 0.88, easing: 'cubic-bezier(0.4,0,0.3,1)' },
          { left: '0px', width: `${W}px`, top: `${B.t}px`, height: `${B.h}px`, backgroundColor: soft, offset: 1 },
        ],
        { duration: 780 },
      )
    }
  }, [activeIndex, navItems.length])


  const name = userData?.profile?.full_name || 'Member'
  const email = userData?.profile?.email || ''
  const initial = (userData?.profile?.full_name || email || 'U')[0].toUpperCase()

  // Until the profile arrives: grey placeholders the same size as the real thing, never a made-up name or letter
  const loading = !userData
  const bone = 'animate-pulse rounded-full bg-ink/[0.07]'
  const [photoBroken, setPhotoBroken] = useState(false) // the picture's address stopped working: fall back to the letter
  useEffect(() => setPhotoBroken(false), [userData?.profile?.avatar_url])

  // Phones: one blob of "jelly" sits behind the active tab. Switching tabs, it gathers into a droplet behind the icon, the droplet stretches
  // across to the new icon and tightens again, then spreads back out into the blob with a small wobble. The icons change colour
  // in step: the old one lets go at once, the new one turns green as the droplet lands. (Driven by the Web Animations
  // API: the blob's own style always holds the resting state, the animation only plays on top of it.)
  const jelly = useRef<HTMLSpanElement>(null)
  const dockLinks = useRef<(HTMLAnchorElement | null)[]>([])
  const lastTab = useRef<number | null>(null)
  useLayoutEffect(() => {
    const el = jelly.current
    if (!el) return
    const INSET = 2
    const box = (i: number) => {
      const a = dockLinks.current[i]
      return a ? { l: a.offsetLeft, w: a.offsetWidth } : null
    }
    const place = () => {
      const r = box(dockActive)
      el.style.opacity = r ? '1' : '0'
      if (!r) return
      el.style.left = `${r.l + INSET}px`
      el.style.width = `${r.w - INSET * 2}px`
    }
    place()

    const before = lastTab.current
    lastTab.current = dockActive
    const A = before !== null && before >= 0 ? box(before) : null
    const B = box(dockActive)
    if (A && B && before !== dockActive && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const soft = inkAlpha(0.09)
      const drop = 'rgba(16,185,129,0.55)' // see-through, so the icon underneath still reads
      // the droplet is icon-sized and sits exactly behind the icon (tab: 4px pad + 8px to the icon, icon 20px)
      const bead = (cx: number, w = 20, h = 20) => ({ left: `${cx - w / 2}px`, width: `${w}px`, top: `${12 + (20 - h) / 2}px`, height: `${h}px`, backgroundColor: drop })
      const ac = A.l + A.w / 2
      const bc = B.l + B.w / 2
      el.animate(
        [
          { left: `${A.l + INSET}px`, width: `${A.w - INSET * 2}px`, top: '4px', height: '48px', backgroundColor: soft, offset: 0, easing: 'cubic-bezier(0.5,0,0.7,0.4)' },
          { ...bead(ac), offset: 0.24, easing: 'cubic-bezier(0.4,0,0.2,1)' },
          { ...bead((ac + bc) / 2, Math.abs(bc - ac) + 20, 13), offset: 0.5, easing: 'cubic-bezier(0.3,0,0.3,1)' },
          { ...bead(bc), offset: 0.7, easing: 'cubic-bezier(0.3,0.6,0.4,1)' },
          { left: `${B.l + INSET - 3}px`, width: `${B.w - INSET * 2 + 6}px`, top: '2px', height: '52px', backgroundColor: soft, offset: 0.88, easing: 'cubic-bezier(0.4,0,0.3,1)' },
          { left: `${B.l + INSET}px`, width: `${B.w - INSET * 2}px`, top: '4px', height: '48px', backgroundColor: soft, offset: 1 },
        ],
        { duration: 780 },
      )
    }
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [dockActive, dockItems.length])

  const avatar = (size: string) =>
    loading ? (
      <span className={`${size} block ${bone}`} aria-hidden="true" />
    ) : userData?.profile?.avatar_url && !photoBroken ? (
      <img src={userData.profile.avatar_url} alt="" onError={() => setPhotoBroken(true)} className={`${size} rounded-full object-cover`} />
    ) : (
      <span className={`${size} grid place-items-center rounded-full bg-ink/10 text-sm font-bold text-primary`}>{initial}</span>
    )

  // Labels fade and collapse with the rail; the row keeps its height
  // They leave quickly and come in a beat after the rail has started to open, drifting in from the left through a blur
  const fade = `transition-[opacity,filter,transform] ${
    show ? 'opacity-100 blur-0 translate-x-0 duration-300 delay-100' : 'pointer-events-none opacity-0 blur-[6px] -translate-x-2 duration-150'
  }`
  const label = `w-36 shrink-0 overflow-hidden whitespace-nowrap ${fade}`
  const row = 'flex h-12 w-full items-center gap-3 rounded-full pl-4 pr-3 text-left'

  return (
    <div className="min-h-screen bg-base text-text">
      {/* Desktop: a floating vertical pill down the left, open or minimised */}
      <aside
        className="group/rail fixed inset-y-4 left-4 z-40 hidden rounded-[2.25rem] border border-ink/10 bg-surface/40 backdrop-blur-2xl backdrop-saturate-150 md:block"
        style={{ width, transition: drag === null ? `width ${DURATION}ms ${ease}` : 'none', willChange: 'width' }}
      >
        {/* Grab the edge to stretch or shrink the pill, or just click it. It shows up while the pill is hovered. */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Menu width: drag to resize, click to minimise or expand"
          aria-valuenow={Math.round(width)}
          aria-valuemin={CLOSED_PX}
          aria-valuemax={OPEN_PX}
          tabIndex={0}
          title={show ? 'Drag to resize, click to minimise' : 'Drag to resize, click to expand'}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId)
            grab.current = { startX: e.clientX, startW: width, w: width, moved: false }
            setDrag(width)
          }}
          onPointerMove={(e) => {
            const g = grab.current
            if (!g) return
            if (e.pointerType === 'mouse' && e.buttons === 0) return endGrab() // the button was let go somewhere we did not hear about
            const dx = e.clientX - g.startX
            if (Math.abs(dx) > 4) g.moved = true
            if (g.moved) {
              g.w = clampWidth(g.startW + dx)
              setDrag(g.w)
            }
          }}
          onPointerUp={endGrab}
          onPointerCancel={endGrab}
          onLostPointerCapture={endGrab}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              setOpen(!open)
            } else if (e.key === 'ArrowLeft') setOpen(false)
            else if (e.key === 'ArrowRight') setOpen(true)
          }}
          className="group/handle absolute -right-3 top-1/2 z-10 flex h-24 w-6 -translate-y-1/2 cursor-ew-resize touch-none items-center justify-center focus:outline-none"
        >
          <span
            className={`h-10 w-1.5 rounded-full bg-ink/30 transition-[opacity,height,background-color] duration-200 group-hover/handle:h-14 group-hover/handle:bg-primary group-focus-visible/handle:bg-primary ${
              drag !== null ? 'h-14 bg-primary opacity-100' : 'opacity-0 group-hover/rail:opacity-100'
            }`}
          />
        </div>

        <div className="flex h-full flex-col gap-2 overflow-hidden rounded-[inherit] p-2">
        {/* the name plate: a dark inset panel with a thin outline and a faint green glow at the edges. The name glitches like an
            old screen: a short burst every few seconds and on hover, still the rest of the time so it does not pull the eye. */}
        <Link
          to="/"
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return // new tab etc.
            e.preventDefault()
            startTransition(() => {
              addTransitionType('to-landing') // see APP_EXIT in App.tsx
              navigate('/')
            })
          }}
          title="MoFi Life: home page"
          className={`${row} relative h-14 overflow-hidden bg-deep ring-1 ring-inset ring-ink/10 shadow-[inset_0_0_22px_rgba(16,185,129,0.12),inset_0_1px_0_rgba(255,255,255,0.07)]`}
        >
          {/* the logo is larger than the nav icons under it, but its slot is the same 24px, so they line up down the rail. The logo is
              centred on the slot by position (a grid would start it at the slot's corner and let it spill out right and down). */}
          <span className="relative size-6 shrink-0">
            <span className="absolute left-1/2 top-1/2 size-8 -translate-x-1/2 -translate-y-1/2">
              <GlitchText className="size-full" mask="/logo.svg">
                <Logo className="size-full max-w-none" />
              </GlitchText>
            </span>
          </span>
          <span className={`${label} relative text-[1.2rem] font-extrabold tracking-tight`}>
            <GlitchText>
              MoFi{' '}
              {admin ? (
                <span className="text-accent2 [text-shadow:0_0_12px_rgba(212,175,55,0.5)]">Admin</span>
              ) : (
                <span className="text-primary [text-shadow:0_0_12px_rgba(16,185,129,0.55)]">Life</span>
              )}
            </GlitchText>
          </span>
        </Link>

        <nav ref={track} className="relative flex flex-col gap-1">
          <span ref={railJelly} aria-hidden="true" className="pointer-events-none absolute inset-x-0 rounded-full bg-ink/[0.09] opacity-0" />
          {navItems.map((item, i) => {
            const Icon = item.icon
            const active = i === activeIndex
            return (
              <NavLink
                key={item.to}
                to={item.to}
                title={show ? undefined : item.name}
                aria-label={item.name}
                ref={(el) => {
                  links.current[i] = el
                }}
                className={`${row} relative text-sm font-semibold text-muted transition-colors duration-200 hover:text-text`}
              >
                <span className="relative shrink-0">
                  <Icon
                    className={`size-6 shrink-0 transition-[transform,color] duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
                      active ? 'scale-110 text-primary delay-[520ms]' : ''
                    }`}
                  />
                  {!!item.badge && <NavBadge n={item.badge} />}
                </span>
                <span className={label}>{item.name}</span>
              </NavLink>
            )
          })}
        </nav>

        {/* Account: no box, just the photo (ringed like the phone bar's) and Sign out. Open: name and email beside the photo, Sign out at the end.
            Minimised: the two stacked, left-aligned so their icons stay under the nav icons however wide the rail is mid-drag. */}
        <div className="mt-auto flex flex-col gap-1">
        {/* admins: over to the panel, or back to the app. On the same soft background as the profile below */}
        {switchTo && (
          <Link
            to={switchTo.to}
            title={show ? undefined : switchTo.label}
            aria-label={switchTo.label}
            className={`${row} bg-ink/[0.05] text-sm font-semibold text-muted transition-colors duration-200 hover:bg-ink/[0.09] hover:text-text`}
          >
            <switchTo.icon className={`size-6 shrink-0 ${admin ? '' : 'text-accent2'}`} />
            <span className={label}>{switchTo.label}</span>
          </Link>
        )}
        <div className={`flex gap-1 ${show ? 'items-center' : 'flex-col items-start'}`}>
          <Link
            to="?profile"
            onClick={openProfile}
            title={show ? undefined : loading ? 'Edit profile' : `${name}: edit profile`}
            aria-label={loading ? 'Edit profile' : `${name}: edit profile`}
            className={`group/me flex h-12 items-center gap-3 overflow-hidden rounded-full bg-ink/[0.05] pl-2 transition-colors hover:bg-ink/[0.09] ${
              show ? 'min-w-0 flex-1 pr-3' : 'w-14 shrink-0'
            }`}
          >
            <span
              className={`size-10 shrink-0 rounded-full p-[3px] ring-1 transition-[box-shadow,transform] duration-300 group-active/me:scale-95 ${
                profileOpen ? 'ring-2 ring-primary/60' : 'ring-ink/15 group-hover/me:ring-ink/30'
              }`}
            >
              {avatar('size-full')}
            </span>
            <span className={`min-w-0 flex-1 ${fade}`}>
                {loading ? (
                  <>
                    <span className="flex h-4 items-center">
                      <span className={`h-2.5 w-24 ${bone}`} aria-hidden="true" />
                    </span>
                    <span className="flex h-4 items-center">
                      <span className={`h-2 w-32 ${bone}`} aria-hidden="true" />
                    </span>
                  </>
                ) : (
                  <>
                    <span className="block truncate text-xs font-semibold leading-4 text-text">{name}</span>
                    <span className="block truncate text-[0.6875rem] leading-4 text-muted">{email}</span>
                  </>
                )}
            </span>
          </Link>

          <button
            onClick={() => setConfirmSignOut(true)}
            title="Sign out"
            aria-label="Sign out"
            className={`grid h-12 shrink-0 place-items-center rounded-full bg-ink/[0.05] text-muted transition-colors hover:bg-danger/15 hover:text-danger ${show ? 'w-12' : 'w-14'}`}
          >
            <LogOut className="size-5" />
          </button>
        </div>
        </div>
        </div>
      </aside>

      {/* The content makes room for the rail and follows it as it opens and closes */}
      {/* The rail takes its width off the left of the page; the content is centred in what is left, so opening the rail
          slides it across instead of squeezing it from one side */}
      <div
        className="w-full md:pl-(--rail) md:pr-6 lg:pr-8"
        style={{
          ['--rail' as string]: `${width + 36}px`,
          transition: drag === null ? `padding-left ${DURATION}ms ${ease}` : 'none',
        }}
      >
        <main className="mx-auto w-full max-w-6xl pb-[calc(8rem+env(safe-area-inset-bottom))] pl-4 pr-4 pt-6 sm:pl-6 sm:pr-6 md:px-0 md:pb-16 md:pt-4">{children}</main>
      </div>

      {/* Phones: a slim glass pill of tabs (icon over label) and the profile photo as its own round button. The active tab sits on a
          blob of jelly that gathers into a droplet behind the icon, slides across and spreads back out when you switch (see the effect above). */}
      <nav className="dock pointer-events-none fixed inset-x-3 bottom-[max(0.75rem,calc(env(safe-area-inset-bottom)+0.25rem))] z-40 mx-auto flex max-w-md items-center gap-3 md:hidden" aria-label="Main">
        <div className="pointer-events-auto relative flex min-w-0 flex-1 items-center overflow-hidden rounded-full border border-ink/10 bg-surface/40 p-1 backdrop-blur-2xl backdrop-saturate-150">
          <span
            ref={jelly}
            aria-hidden="true"
            className="pointer-events-none absolute left-0 top-1 h-12 w-0 rounded-full bg-ink/[0.09] opacity-0"
          />
          {dockItems.map((item, i) => {
            const Icon = item.icon
            const active = i === dockActive
            return (
              <NavLink
                key={item.to}
                to={item.to}
                ref={(el) => {
                  dockLinks.current[i] = el
                }}
                className="relative z-10 flex h-12 min-w-0 flex-1 basis-0 flex-col items-center justify-center gap-0.5 rounded-full text-muted outline-none"
              >
                <span className="relative">
                  <Icon
                    className={`size-5 shrink-0 transition-[transform,color] duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
                      active ? 'scale-110 text-primary delay-[520ms]' : ''
                    }`}
                  />
                  {!!item.badge && <NavBadge n={item.badge} small />}
                </span>
                <span className="max-w-full truncate text-[10px] font-semibold leading-none">{item.short ?? item.name}</span>
              </NavLink>
            )
          })}
        </div>

        <Link
          to="?profile"
          onClick={openProfile}
          aria-label="Profile"
          className={`pointer-events-auto grid size-14 shrink-0 place-items-center rounded-full bg-surface/40 p-[3px] ring-1 backdrop-blur-2xl backdrop-saturate-150 transition-[transform,box-shadow] duration-300 active:scale-90 ${
            profileOpen ? 'ring-2 ring-primary/60' : 'ring-ink/15'
          }`}
        >
          {avatar('size-full')}
        </Link>
      </nav>
      {/* Opened by a click here: it fades and scales in. Reached by a link or a reload: already open, and only the close animates. */}
      {profileOpen && <ProfileWindow onClosed={closeProfile} instant={!clickedOpen} />}
      <SignOutConfirm open={confirmSignOut} onClose={() => setConfirmSignOut(false)} />
    </div>
  )
}
