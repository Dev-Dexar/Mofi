import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Loader2, LogOut } from 'lucide-react'
import CenterWindow from '@/components/ui/CenterWindow'
import { Collapse } from '@/components/ui/Collapse'
import TwoFactorSection, { TwoFactorView } from './components/TwoFactorSection'
import ThemeSetting from './components/ThemeSetting'
import { field } from '@/components/ui/SettingsUI'
import { AdminIcon, BackIcon, SettingsIcon, CameraIcon, CrossIcon, EyeIcon, GoogleMark, LockIcon, MailIcon } from '@/icons'
import { api } from '@/lib/api'
import type { UserProfile } from '@/lib/api'
import {
  NAME_MAX,
  PASSWORD_MAX,
  PASSWORD_MIN,
  cleanFullName,
  fullNameProblem,
  getSignInMethods,
  getTotpFactor,
  passwordProblem,
  updatePassword,
} from '@/lib/auth'
import AvatarCropper from './components/AvatarCropper'
import { avatarErrorMessage, cropToBlob, isCustomAvatar, openPhoto, removeAvatar, saveAvatar } from './avatar'
import { useToast } from '@/context/ToastContext'
import SignOutConfirm from '@/features/auth/SignOutConfirm'

const memberSince = (iso: string) => {
  const d = new Date(iso)
  return isNaN(d.getTime()) ? null : d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

/** The profile, in a window that scales up from the middle of the screen.  */
const SPRING = 'ease-[cubic-bezier(0.34,1.56,0.64,1)]' // overshoots a little, then settles

export default function ProfileWindow({ onClosed, instant = false }: { onClosed: () => void; instant?: boolean }) {
  const toast = useToast()
  const inPanel = useLocation().pathname.startsWith('/admin') // in the admin panel the button goes back to the app instead
  const [confirmSignOut, setConfirmSignOut] = useState(false)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [changing, setChanging] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [pwOpen, setPwOpen] = useState(false)
  const [pwHad, setPwHad] = useState(false) // whether a password existed when the form opened: the form keeps its wording while it slides shut
  const photoInput = useRef<HTMLInputElement>(null)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [photoBroken, setPhotoBroken] = useState(false) // the picture's address stopped working: fall back to the letter
  // Choosing a photo opens the crop screen; nothing is uploaded until "Save photo" there
  const [cropBitmap, setCropBitmap] = useState<ImageBitmap | null>(null)
  const pickPhoto = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // so choosing the same photo again still fires
    if (!file || !profile || photoBusy) return
    try {
      setPhotoBusy(true)
      setCropBitmap(await openPhoto(file))
      swap('crop')
    } catch (err) {
      toast.error(avatarErrorMessage(err))
    } finally {
      setPhotoBusy(false)
    }
  }
  const saveCrop = async (area: { x: number; y: number; size: number }) => {
    if (!profile || !cropBitmap) return
    try {
      setPhotoBusy(true)
      const next = await saveAvatar(profile.id, await cropToBlob(cropBitmap, area))
      setProfile((p) => (p ? { ...p, ...next } : next))
      setPhotoBroken(false)
      toast.success('Photo updated')
      swap('profile')
    } catch (err) {
      toast.error(avatarErrorMessage(err))
    } finally {
      setPhotoBusy(false)
    }
  }
  // The little menu that pops out of the photo: change it, or remove one you uploaded
  const [menuOpen, setMenuOpen] = useState(false)
  const photoBox = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!menuOpen) return
    const away = (e: PointerEvent) => !photoBox.current?.contains(e.target as Node) && setMenuOpen(false)
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation() // closes the menu, not the whole window
        setMenuOpen(false)
      }
    }
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', esc, true)
    return () => {
      document.removeEventListener('pointerdown', away)
      document.removeEventListener('keydown', esc, true)
    }
  }, [menuOpen])
  const dropPhoto = async () => {
    if (!profile || photoBusy) return
    try {
      setPhotoBusy(true)
      const next = await removeAvatar(profile.id)
      setProfile((p) => (p ? { ...p, ...next } : next))
      setPhotoBroken(false)
    } catch {
      toast.error('Could not remove your photo. Please try again.')
    } finally {
      setPhotoBusy(false)
    }
  }
  // The window shows either the profile or the two-factor flow; the swap fades and blurs, and the window grows or shrinks to fit
  const [factorId, setFactorId] = useState<string | null | undefined>(undefined) // undefined: loading, null: off
  const [view, setView] = useState<'profile' | 'mfa' | 'crop'>('profile')
  const [mfaMode, setMfaMode] = useState<'enable' | 'disable'>('enable')
  const [leaving, setLeaving] = useState(false)
  const swapping = useRef(false)
  const swap = (next: 'profile' | 'mfa' | 'crop') => {
    if (swapping.current) return
    swapping.current = true
    setLeaving(true)
    window.setTimeout(() => {
      if (next !== 'profile') setPwOpen(false)
      if (next === 'profile') setCropBitmap((b) => (b?.close(), null))
      setView(next)
      setLeaving(false)
      swapping.current = false
    }, 180)
  }
  const pwBox = useRef<HTMLDivElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  // The window keeps one height; opening a section slides it open, and the scroll follows the growing box frame by frame
  // (not once afterwards), leaving a little room under it. Closing needs nothing: the browser clamps the scroll as it shrinks.
  useEffect(() => {
    if (!pwOpen) return
    const box = pwBox.current
    const area = scroller.current
    if (!box || !area) return
    const start = performance.now()
    let raf = 0
    const follow = (now: number) => {
      const over = box.getBoundingClientRect().bottom + 16 - area.getBoundingClientRect().bottom
      if (over > 0) area.scrollTop += over
      if (now - start < 340) raf = requestAnimationFrame(follow)
    }
    raf = requestAnimationFrame(follow)
    const focus = window.setTimeout(() => document.getElementById('new-password')?.focus({ preventScroll: true }), 120)
    return () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(focus)
    }
  }, [pwOpen])
  const [methods, setMethods] = useState<{
    google: boolean
    password: boolean
  } | null>(null)

  useEffect(() => {
    api
      .getMe()
      .then((d) => {
        setProfile(d.profile)
        setName(d.profile.full_name ?? '')
      })
      .catch((err) => toast.error(err.message || 'Could not load your profile'))
    getTotpFactor()
      .then((f) => setFactorId(f?.id ?? null))
      .catch(() => setFactorId(null))
    getSignInMethods()
      .then(setMethods)
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const unchanged = cleanFullName(name) === (profile?.full_name ?? '')
  const display = profile?.full_name || profile?.email || 'Your account'
  const initial = display[0]?.toUpperCase() ?? 'U'
  const hasGoogle = methods?.google ?? profile?.signup_method === 'google'
  const hasPassword = methods?.password ?? profile?.signup_method !== 'google'
  const since = profile ? memberSince(profile.created_at) : null

  const saveName = async (e: FormEvent) => {
    e.preventDefault()
    const problem = fullNameProblem(name)
    if (problem) return setError(problem)
    try {
      setSaving(true)
      setError(null)
      const res = await api.updateProfile(cleanFullName(name))
      setProfile((p) => (p ? { ...p, ...res.profile } : res.profile))
      setName(res.profile.full_name ?? '')
      toast.success('Name updated')
    } catch (err: any) {
      setError(err.message || 'Could not save your name')
    } finally {
      setSaving(false)
    }
  }

  const changePassword = async (e: FormEvent) => {
    e.preventDefault()
    const problem = passwordProblem(password, profile?.email ?? undefined)
    if (problem) return setPasswordError(problem)
    if (password !== confirm) return setPasswordError('Passwords do not match.')
    try {
      setChanging(true)
      setPasswordError(null)
      await updatePassword(password)
      toast.success(hasPassword ? 'Password updated' : 'Password set. You can now sign in with email too.', 'password-updated')
      setMethods((m) => ({ google: m?.google ?? false, password: true }))
      setPwOpen(false)
      setPassword('')
      setConfirm('')
    } catch (err) {
      const code = (err as { code?: string })?.code
      setPasswordError(
        code === 'same_password'
          ? 'That is already your password. Choose a different one.'
          : code === 'weak_password'
            ? 'That password is too easy to guess. Try another.'
            : 'Could not update your password. Please try again.',
      )
    } finally {
      setChanging(false)
    }
  }

  const eye = (shown: boolean, toggle: () => void) => (
    <button
      type="button"
      onClick={toggle}
      aria-label={shown ? 'Hide password' : 'Show password'}
      aria-pressed={shown}
      className="absolute right-1 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full text-muted transition-colors hover:text-text"
    >
      <EyeIcon open={shown} />
    </button>
  )
  const passwordReady = password.length >= PASSWORD_MIN && password === confirm
  const ready = !!profile && !!methods
  const bone = 'animate-pulse rounded-full bg-ink/[0.07]' // stands in for a value that has not arrived, same size as the real one
  const pillBtn =
    'inline-flex h-7 items-center rounded-full bg-ink/10 px-3.5 text-xs font-bold text-text transition-[transform,background-color,opacity,filter,scale,translate] hover:bg-ink/15 active:scale-95'

  return (
    <CenterWindow
      instant={instant}
      reveal="clip"
      title={
        <span key={view} className="view-in inline-flex items-center gap-1.5">
          {view !== 'profile' ? (
            <>
              <span className="text-muted">Profile</span>
              <span className="text-muted/50">/</span>
              {view === 'mfa' ? 'Two-factor' : 'Photo'}
            </>
          ) : (
            'Profile'
          )}
        </span>
      }
      onBack={view !== 'profile' ? () => swap('profile') : undefined}
      headerLeft={
        profile?.role === 'admin' ? (
          <span className="inline-flex items-center gap-1.5">
          <Link
            to={inPanel ? '/dashboard' : '/admin'}
            aria-label={inPanel ? 'Back to app' : 'Admin panel'}
            title={inPanel ? 'Back to app' : 'Admin panel'}
            className="inline-flex size-7 items-center justify-center rounded-full bg-ink/10 text-text outline-none transition-[background-color,scale] hover:bg-ink/15 focus-visible:ring-2 focus-visible:ring-ink/70 active:scale-95"
          >
            {inPanel ? <BackIcon className="size-3.5" /> : <AdminIcon className="size-4" />}
          </Link>
          {/* on a phone the admin menu has no room for Settings, so it is here (the desktop rail has it); admins only */}
          {inPanel && (
            <Link to="/admin/settings" aria-label="Settings" title="Settings" className="inline-flex size-7 items-center justify-center rounded-full bg-ink/10 text-text outline-none transition-[background-color,scale] hover:bg-ink/15 focus-visible:ring-2 focus-visible:ring-ink/70 active:scale-95 md:hidden">
              <SettingsIcon className="size-4" />
            </Link>
          )}
          </span>
        ) : undefined
      }
      onClosed={onClosed}
      width="narrow"
      snug={view === 'mfa'}
    >
      {/* One fixed size for both views, so switching never resizes the window; anything taller scrolls inside it. The scroll area
          reaches over the window's top and bottom padding (and puts the same padding back inside), so content scrolls right up to
          the edges instead of being cut off a padding's width short of them. */}
      <div
        ref={scroller}
        className={`${
          view === 'mfa'
            ? '-my-2.5 h-[min(36rem,calc(82vh-3.25rem))] py-2.5'
            : '-my-6 h-[min(35rem,calc(82vh-3.25rem))] py-6 sm:-my-8 sm:h-[min(36rem,calc(82vh-3.25rem))] sm:py-8'
        } overflow-y-auto overflow-x-hidden transition-[height] duration-300 overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`}
      >
        <div key={view} className={`${leaving ? 'reveal-out' : 'reveal-in'} flex min-h-full flex-col`}>
          {view === 'crop' && cropBitmap ? (
            <AvatarCropper bitmap={cropBitmap} busy={photoBusy} onCancel={() => swap('profile')} onSave={saveCrop} />
          ) : view === 'mfa' ? (
            <TwoFactorView
              mode={mfaMode}
              factorId={factorId ?? null}
              onCancel={() => swap('profile')}
              onChanged={(on, id) => setFactorId(on ? id : null)}
              onDone={() => swap('profile')}
            />
          ) : (
            <>
              {/* Who you are: the name is the field, no box around it */}
              <form onSubmit={saveName} noValidate className="text-left">
                <div className="flex items-center gap-4 rounded-2xl border border-ink/[0.06] bg-ink/[0.03] p-4">
                  <div ref={photoBox} className="relative shrink-0">
                    {!profile ? (
                      <span className={`block size-16 ${bone}`} aria-hidden="true" />
                    ) : (
                      <>
                        <input ref={photoInput} type="file" accept="image/*" onChange={pickPhoto} className="sr-only" tabIndex={-1} aria-hidden="true" />
                        <button
                          type="button"
                          onClick={() => (isCustomAvatar(profile.avatar_url) && !photoBroken ? setMenuOpen((v) => !v) : photoInput.current?.click())}
                          disabled={photoBusy}
                          aria-label="Profile photo"
                          aria-haspopup={isCustomAvatar(profile.avatar_url) && !photoBroken ? 'menu' : undefined}
                          aria-expanded={isCustomAvatar(profile.avatar_url) && !photoBroken ? menuOpen : undefined}
                          className={`group relative block size-16 rounded-full outline-none transition-[scale,box-shadow] duration-300 ${SPRING} focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${
                            menuOpen ? 'scale-105 shadow-[0_0_0_3px_var(--color-surface),0_0_0_5px_var(--color-primary)]' : ''
                          }`}
                        >
                          {profile.avatar_url && !photoBroken ? (
                            <img
                              src={profile.avatar_url}
                              alt=""
                              onError={() => setPhotoBroken(true)}
                              className="size-16 rounded-full object-cover ring-1 ring-ink/15"
                            />
                          ) : (
                            <span className="grid size-16 place-items-center rounded-full bg-gradient-to-b from-[#34d399] to-[#059669] text-2xl font-bold text-white">
                              {initial}
                            </span>
                          )}
                          <span
                            className={`absolute inset-0 grid place-items-center rounded-full bg-black/55 text-white transition-opacity duration-200 ${
                              photoBusy ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100'
                            }`}
                          >
                            {photoBusy ? <Loader2 className="size-5 animate-spin" aria-hidden="true" /> : <CameraIcon className="size-5" />}
                          </span>
                          {/* the permanent camera is only a hint for an account with no photo of its own */}
                          {!(isCustomAvatar(profile.avatar_url) && !photoBroken) && (
                            <span className="absolute -bottom-0.5 -right-0.5 grid size-6 place-items-center rounded-full bg-white text-slate-900 ring-2 ring-surface">
                              <CameraIcon className="size-3.5" />
                            </span>
                          )}
                        </button>

                        {/* Pops out of the photo: springs up from it with a little pointer, then its two choices arrive one after the other */}
                        <div
                          role="menu"
                          aria-hidden={!menuOpen}
                          className={`absolute left-0 top-full z-30 mt-2.5 w-44 origin-[1.5rem_0] rounded-xl border border-ink/10 bg-popover p-1 transition-[opacity,scale,translate,filter] duration-[420ms] ${SPRING} ${
                            menuOpen && isCustomAvatar(profile.avatar_url) && !photoBroken
                              ? 'translate-y-0 scale-100 opacity-100 blur-none'
                              : 'pointer-events-none -translate-y-2 scale-75 opacity-0 blur-sm'
                          }`}
                        >
                          <span aria-hidden="true" className="absolute -top-1 left-[1.25rem] size-2 rotate-45 border-l border-t border-ink/10 bg-popover" />
                          {[
                            { label: 'Change photo', icon: CameraIcon, danger: false, run: () => photoInput.current?.click() },
                            { label: 'Remove photo', icon: CrossIcon, danger: true, run: () => void dropPhoto() },
                          ].map((item, i) => (
                            <button
                              key={item.label}
                              type="button"
                              role="menuitem"
                              tabIndex={menuOpen ? 0 : -1}
                              onClick={() => {
                                setMenuOpen(false)
                                item.run()
                              }}
                              style={{ transitionDelay: menuOpen ? `${120 + i * 70}ms` : '0ms' }}
                              className={`flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-sm transition-[opacity,translate,filter,background-color] duration-300 ${SPRING} ${
                                menuOpen ? 'translate-y-0 opacity-100 blur-none' : 'translate-y-2 opacity-0 blur-[3px]'
                              } ${item.danger ? 'text-danger hover:bg-danger/10' : 'text-text hover:bg-ink/[0.07]'}`}
                            >
                              <item.icon className={`size-4 ${item.danger ? '' : 'text-muted'}`} />
                              {item.label}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <label htmlFor="profile-name" className="sr-only">
                      Full name
                    </label>
                    {!profile && <span className={`mt-1 block h-8 w-44 ${bone}`} aria-hidden="true" />}
                    <div className="flex items-center gap-2">
                      <input
                        id="profile-name"
                        type="text"
                        autoComplete="name"
                        maxLength={NAME_MAX}
                        value={name}
                        disabled={!profile}
                        placeholder="Your name"
                        onChange={(e) => {
                          setName(e.target.value)
                          setError(null)
                        }}
                        aria-invalid={!!error}
                        aria-describedby="profile-error"
                        className={`min-w-0 flex-1 border-b border-transparent bg-transparent pb-1 text-left text-xl font-bold tracking-tight text-text transition-colors placeholder:text-muted/50 hover:border-ink/15 focus:border-primary focus:outline-none ${profile ? '' : 'hidden'}`}
                      />
                    </div>
                    <p className="mt-1 flex h-5 items-center gap-1.5 text-sm text-muted">
                      {profile ? (
                        <>
                          {profile.email ?? ' '}
                          <LockIcon className="size-3 text-muted/60" />
                        </>
                      ) : (
                        <span className={`h-3.5 w-48 ${bone}`} aria-hidden="true" />
                      )}
                    </p>
                  </div>
                </div>
                {/* The Save button's row slides open once the name has changed (or there is something to say about it), instead of holding its room
                    all the time: the window has no height to spare on a phone, and a window that is even a little taller than its box scrolls under a thumb */}
                <Collapse open={!unchanged || !!error}>
                  <div className="flex items-center justify-between gap-3 pt-3">
                    <p id="profile-error" role="alert" className="min-w-0 text-xs text-danger">
                      {error}
                    </p>
                    <button
                      type="submit"
                      disabled={saving || unchanged}
                      className="ml-auto inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-full bg-primary px-5 text-sm font-bold text-[color:var(--color-base)] transition-[transform,opacity,filter,scale,translate] duration-300 active:scale-95 disabled:opacity-60"
                    >
                      {saving && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
                      {saving ? 'Saving…' : 'Save name'}
                    </button>
                  </div>
                </Collapse>
              </form>

              {/* The rest, as plain lines */}
              <div className="mt-4 divide-y divide-ink/[0.06] text-sm">
                <div className="flex h-12 items-center justify-between">
                  <span className="text-muted">Sign-in</span>
                  <span className="flex items-center gap-3 text-text">
                    {!ready && <span className={`h-4 w-24 ${bone}`} aria-hidden="true" />}
                    {ready && hasGoogle && (
                      <span className="inline-flex items-center gap-1.5">
                        <GoogleMark className="size-4" /> Google
                      </span>
                    )}
                    {ready && hasPassword && (
                      <span className="inline-flex items-center gap-1.5">
                        <MailIcon className="size-4 text-muted" /> Email
                      </span>
                    )}
                  </span>
                </div>
                <div className="flex h-12 items-center justify-between">
                  <span className="text-muted">Member since</span>
                  {profile ? <span className="text-text">{since ?? '—'}</span> : <span className={`h-4 w-28 ${bone}`} aria-hidden="true" />}
                </div>
                <div className="flex h-12 items-center justify-between gap-3">
                  <span className="text-muted">Appearance</span>
                  <ThemeSetting />
                </div>

                <div
                  ref={pwBox}
                  className={`py-3 transition-[background-color,padding,border-radius] duration-300 ${pwOpen ? 'my-1.5 rounded-2xl border border-ink/[0.06] bg-ink/[0.03] px-3.5' : 'rounded-2xl px-0'}`}
                >
                  <div className="flex h-6 items-center justify-between">
                    <span className="text-muted">Password</span>
                    {methods ? (
                      <button
                        type="button"
                        onClick={() => {
                          setPwHad(hasPassword)
                          setPwOpen(true)
                        }}
                        aria-expanded={pwOpen}
                        tabIndex={pwOpen ? -1 : 0}
                        className={`${pillBtn} duration-300 ${pwOpen ? 'pointer-events-none scale-95 opacity-0 blur-sm' : ''}`}
                      >
                        {hasPassword ? 'Change' : 'Set up'}
                      </button>
                    ) : (
                      <span className={`h-4 w-14 ${bone}`} aria-hidden="true" />
                    )}
                  </div>
                  <Collapse open={pwOpen}>
                    <form onSubmit={changePassword} noValidate className="space-y-2 pt-3">
                      {!pwHad && <p className="pb-1 text-xs text-muted">Add a password to also sign in with your email. Google keeps working.</p>}
                      <div className="relative">
                        <label htmlFor="new-password" className="sr-only">
                          New password
                        </label>
                        <input
                          id="new-password"
                          type={showPassword ? 'text' : 'password'}
                          autoComplete="new-password"
                          maxLength={PASSWORD_MAX}
                          placeholder={`New password (${PASSWORD_MIN}+ characters)`}
                          value={password}
                          onChange={(e) => {
                            setPassword(e.target.value)
                            setPasswordError(null)
                          }}
                          aria-invalid={!!passwordError}
                          className={`${field} pr-10`}
                        />
                        {eye(showPassword, () => setShowPassword((v) => !v))}
                      </div>
                      <div className="relative">
                        <label htmlFor="confirm-password" className="sr-only">
                          Confirm new password
                        </label>
                        <input
                          id="confirm-password"
                          type={showConfirm ? 'text' : 'password'}
                          autoComplete="new-password"
                          maxLength={PASSWORD_MAX}
                          placeholder="Confirm password"
                          value={confirm}
                          onChange={(e) => {
                            setConfirm(e.target.value)
                            setPasswordError(null)
                          }}
                          aria-invalid={!!passwordError}
                          className={`${field} pr-10`}
                        />
                        {eye(showConfirm, () => setShowConfirm((v) => !v))}
                      </div>
                      <p role="alert" className="min-h-4 text-xs text-danger">
                        {passwordError}
                      </p>
                      <div className="flex rounded-full bg-well-md p-1" role="group" aria-label="Password actions">
                        <button
                          type="button"
                          onClick={() => setPwOpen(false)}
                          className="flex-1 rounded-full py-2 text-xs font-bold text-danger transition-[background-color,transform,scale,translate] hover:bg-ink/[0.06] active:scale-95 active:bg-ink/10"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={changing || !passwordReady}
                          className="flex flex-[1.6] items-center justify-center gap-2 rounded-full bg-primary py-2 text-xs font-bold text-[color:var(--color-base)] transition-[transform,background-color,color,scale,translate] active:scale-95 disabled:bg-ink/10 disabled:text-muted disabled:active:scale-100"
                        >
                          {changing && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
                          {changing ? 'Saving…' : pwHad ? 'Update password' : 'Set password'}
                        </button>
                      </div>
                    </form>
                  </Collapse>
                </div>

                <TwoFactorSection
                  factorId={factorId}
                  onToggle={(mode) => {
                    setMfaMode(mode)
                    swap('mfa')
                  }}
                />
              </div>

              {/* the way out, held at the bottom of the window; it asks first, like the menu's sign-out button */}
              <div className="mt-auto pt-4">
                <button
                  type="button"
                  onClick={() => setConfirmSignOut(true)}
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-danger/10 text-sm font-bold text-danger transition-[background-color,scale] hover:bg-danger/20 active:scale-95"
                >
                  <LogOut className="size-4" aria-hidden="true" />
                  Sign out
                </button>
              </div>
              <SignOutConfirm open={confirmSignOut} onClose={() => setConfirmSignOut(false)} />
            </>
          )}
        </div>
      </div>
    </CenterWindow>
  )
}
