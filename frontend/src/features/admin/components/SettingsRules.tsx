import { useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/api'
import type { AdminSettingsUpdate } from '@/lib/api'
import type { AppSettings } from '@/hooks/useAppSettings'
import { useToast } from '@/context/ToastContext'
import { Switch } from '@/components/ui/SettingsUI'
import { ActionDialog, panel } from './ui'
import { ALL_FIELDS, GROUPS, fromDisplay, readValue, show, toDisplay } from './settingsFields'
import type { Field } from './settingsFields'

/** One value in a pill: the number on the right, its unit after it. Typing is limited to digits and one point. `big` is the headline value of a card. */
function NumberField({ field, value, invalid, big, onChange }: { field: Field; value: string; invalid: boolean; big?: boolean; onChange: (v: string) => void }) {
  return (
    <label
      className={`flex w-full items-center gap-2 rounded-full bg-popover px-5 transition-shadow focus-within:ring-2 ${big ? 'h-12' : 'h-10'} ${
        invalid ? 'ring-2 ring-rose-500/50' : 'focus-within:ring-ink/20'
      }`}
    >
      <input
        aria-label={field.label}
        aria-invalid={invalid}
        inputMode="decimal"
        autoComplete="off"
        value={value}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => {
          const raw = e.target.value.replace(/[^0-9.]/g, '')
          const dot = raw.indexOf('.')
          onChange(dot === -1 ? raw : raw.slice(0, dot + 1) + raw.slice(dot + 1).replace(/\./g, ''))
        }}
        className={`min-w-0 flex-1 bg-transparent font-semibold tabular-nums text-text outline-none ${big ? 'text-xl' : 'text-sm'}`}
      />
      <span className={`shrink-0 font-medium text-muted ${big ? 'text-sm' : 'text-[11px]'}`}>{field.percent ? '%' : 'USDT'}</span>
    </label>
  )
}

type SwitchKey = 'deposits_enabled' | 'withdrawals_enabled' | 'reinvest_enabled' | 'maintenance_mode'

/** The platform's on/off switches. Each takes effect for every account within moments (open pages pick it up on their own). */
const SWITCHES: { key: SwitchKey; label: string; on: string; off: string; ask: string }[] = [
  { key: 'deposits_enabled', label: 'Deposits', on: 'Members can start new deposits', off: 'Paused: no new deposits. Payments already sent are still credited', ask: 'No one can start a new deposit. A payment already on its way is still credited when it arrives.' },
  { key: 'withdrawals_enabled', label: 'Withdrawals', on: 'Members can withdraw their earnings', off: 'Paused: no new withdrawals. Ones already sent still finish', ask: 'No one can request a withdrawal. Withdrawals already sent still finish, and balances are untouched.' },
  { key: 'reinvest_enabled', label: 'Reinvesting', on: 'Members can reinvest, and auto-reinvest runs', off: 'Paused: earnings stay available, auto-reinvest pays to the balance', ask: 'No one can reinvest, and automatic reinvesting pays to the balance until it is switched back on.' },
  { key: 'maintenance_mode', label: 'Maintenance', on: 'Everything is paused for everyone', off: 'Off', ask: '' },
]

/** The platform's rules as a short list, edited in place. A change is held until Save, which asks first, since it moves everyone's money. */
export default function SettingsRules({ onSaved }: { onSaved: () => void }) {
  const toast = useToast()
  const [saved, setSaved] = useState<AppSettings | null>(null)
  const [form, setForm] = useState<Record<string, string>>({})
  const [confirming, setConfirming] = useState(false)
  const [flip, setFlip] = useState<{ key: SwitchKey; next: boolean } | null>(null) // a switch waiting for its confirmation

  const apply = (s: AppSettings) => {
    setSaved(s)
    setForm(Object.fromEntries(ALL_FIELDS.map((f) => [f.key, toDisplay(f, readValue(f, s))])))
  }

  useEffect(() => {
    api.getAdminSettings().then((r) => apply(r.settings)).catch((e) => toast.error(e.message || 'Could not load the settings'))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // what is wrong with each value, if anything (the database refuses the same things)
  const errors = useMemo(() => {
    const out: Record<string, string> = {}
    for (const f of ALL_FIELDS) {
      const text = form[f.key] ?? ''
      const n = Number(text)
      if (text === '' || text === '.' || !Number.isFinite(n)) out[f.key] = 'Enter a number'
      else if (f.key === 'daily_rate' && (n <= 0 || n > 10)) out[f.key] = 'Between 0 and 10%'
      else if (f.key.startsWith('level_') && n > 100) out[f.key] = 'At most 100%'
      else if (!f.percent && n <= 0) out[f.key] = 'More than 0'
    }
    if (!out.max_deposit_usdt && !out.min_deposit_usdt && Number(form.max_deposit_usdt) < Number(form.min_deposit_usdt))
      out.max_deposit_usdt = 'Below the minimum deposit'
    return out
  }, [form])

  const edits = useMemo(() => {
    if (!saved) return []
    return ALL_FIELDS.filter((f) => !errors[f.key] && fromDisplay(f, form[f.key]) !== readValue(f, saved))
  }, [form, saved, errors])
  const hasErrors = Object.keys(errors).length > 0
  const dirty = edits.length > 0

  const save = async () => {
    const update: AdminSettingsUpdate = {}
    const levels: Record<number, number> = {}
    for (const f of edits) {
      const n = fromDisplay(f, form[f.key])
      if (f.key.startsWith('level_')) levels[Number(f.key.slice(6))] = n
      else (update as Record<string, number>)[f.key] = n
    }
    if (Object.keys(levels).length) update.referral_levels = levels
    const res = await api.updateAdminSettings(update) // an error shows inside the confirmation
    apply(res.settings)
    onSaved()
    toast.success(res.result.status === 'unchanged' ? 'Nothing changed' : 'Settings saved')
  }

  /** A field as a card holds it: its name, the pill, and a line under it (what it was when edited, else what it works out to, else what it is for) */
  const block = (f: Field, big = false) => {
    const error = errors[f.key]
    const edited = !!saved && edits.includes(f)
    const caption = edited && saved ? `Was ${show(f, toDisplay(f, readValue(f, saved)))}` : big && f.example ? f.example(Number(form[f.key])) : ''
    return (
      <div key={f.key} className="min-w-0">
        <p className="mb-1.5 pl-1 text-xs text-muted">{f.label}</p>
        {!saved ? (
          <div className={`sk w-full ${big ? 'h-12' : 'h-10'}`} />
        ) : (
          <NumberField field={f} value={form[f.key] ?? ''} invalid={!!error} big={big} onChange={(v) => setForm((p) => ({ ...p, [f.key]: v }))} />
        )}
        {saved && (error ?? caption) && (
            <p className={`mt-2 pl-1 text-xs leading-snug tabular-nums ${error ? 'text-rose-400' : edited ? 'text-accent2' : 'text-muted/70'}`}>{error ?? caption}</p>
        )}
      </div>
    )
  }
  // a switch is saved on its own (it does not wait for Save, and does not touch values being edited)
  const flipSwitch = async () => {
    if (!flip) return
    const res = await api.updateAdminSettings({ [flip.key]: flip.next }) // an error shows inside the confirmation
    setSaved((p) => (p ? { ...p, [flip.key]: res.settings[flip.key] } : res.settings))
    onSaved()
    const name = SWITCHES.find((x) => x.key === flip.key)?.label ?? ''
    toast.success(`${name} ${flip.next ? (flip.key === 'maintenance_mode' ? 'maintenance is on' : 'are on') : flip.key === 'maintenance_mode' ? 'maintenance is off' : 'are paused'}`.replace('Reinvesting are', 'Reinvesting is'))
  }
  const flipping = flip ? SWITCHES.find((x) => x.key === flip.key)! : null
  // switching a feature OFF (or maintenance ON) is the one that stops people, so it is the one that is warned about
  const stops = !!flip && (flip.key === 'maintenance_mode' ? flip.next : !flip.next)

  const [returns, referrals, limits] = GROUPS
  const head = (g: (typeof GROUPS)[number]) => <h2 className="mb-4 text-sm font-semibold text-text">{g.title}</h2>

  return (
    <div>
      <div className="grid gap-3 lg:grid-cols-5">
        <section className={`${panel} p-5 lg:col-span-5`}>
          <h2 className="mb-1 text-sm font-semibold text-text">Switches</h2>
          <ul className="divide-y divide-ink/[0.06]">
            {SWITCHES.map((sw) => {
              const on = saved ? (sw.key === 'maintenance_mode' ? !saved[sw.key] : saved[sw.key]) : true // maintenance reads the other way round: its switch is "platform open"
              const live = saved ? (sw.key === 'maintenance_mode' ? saved[sw.key] : saved[sw.key]) : false
              return (
                <li key={sw.key} className="flex items-center justify-between gap-4 py-3.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-text">{sw.key === 'maintenance_mode' ? 'Maintenance mode' : sw.label}</p>
                  </div>
                  {sw.key === 'maintenance_mode' ? (
                    <Switch label="Maintenance mode" checked={!!saved && live} disabled={!saved} onChange={(next) => setFlip({ key: sw.key, next })} />
                  ) : (
                    <Switch label={sw.label} checked={on} disabled={!saved} onChange={(next) => setFlip({ key: sw.key, next })} />
                  )}
                </li>
              )
            })}
          </ul>
        </section>
        <section className={`${panel} p-5 lg:col-span-2`}>
          {head(returns)}
          {block(returns.fields[0], true)}
        </section>
        <section className={`${panel} p-5 lg:col-span-3`}>
          {head(limits)}
          <div className="grid gap-x-3 gap-y-4 sm:grid-cols-2">{limits.fields.map((f) => block(f))}</div>
        </section>
        <section className={`${panel} p-5 lg:col-span-5`}>
          {head(referrals)}
          <div className="grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-3 lg:grid-cols-5">{referrals.fields.map((f) => block(f))}</div>
        </section>
      </div>

      {/* Appears with the first edit, floating above the page (and the phone's dock) */}
      <div className="pointer-events-none sticky bottom-24 z-30 mt-5 flex justify-center md:bottom-6">
        <div
          inert={!dirty}
          className={`flex items-center gap-1 rounded-full bg-surface/70 p-1.5 pl-5 ring-1 ring-inset ring-ink/[0.08] backdrop-blur-xl transition-[opacity,translate] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
            dirty ? 'pointer-events-auto' : 'translate-y-3 opacity-0'
          }`}
        >
          <span className={`mr-2 text-[13px] tabular-nums ${hasErrors ? 'text-rose-400' : 'text-muted'}`}>
            {hasErrors ? 'Fix the marked values' : `${edits.length} unsaved`}
          </span>
          <button
            type="button"
            onClick={() => saved && apply(saved)}
            className="h-9 rounded-full px-4 text-xs font-bold text-muted outline-none transition-colors hover:text-text focus-visible:ring-2 focus-visible:ring-ink/40"
          >
            Reset
          </button>
          <button
            type="button"
            disabled={hasErrors}
            onClick={() => setConfirming(true)}
            className="h-9 rounded-full bg-primary px-5 text-xs font-bold text-[color:var(--color-base)] outline-none transition-[opacity,scale] focus-visible:ring-2 focus-visible:ring-ink/60 active:scale-95 disabled:opacity-40 disabled:active:scale-100"
          >
            Save
          </button>
        </div>
      </div>

      <ActionDialog
        open={!!flip}
        title={
          !flipping || !flip
            ? ''
            : flip.key === 'maintenance_mode'
              ? flip.next ? 'Put the platform in maintenance?' : 'End maintenance?'
              : `${flip.next ? 'Turn on' : 'Pause'} ${flipping.label.toLowerCase()}?`
        }
        body={
          flipping && flip ? (
            <p>
              {flip.key === 'maintenance_mode'
                ? flip.next
                  ? 'Deposits, withdrawals and reinvesting stop for everyone until you end maintenance. Balances and payouts are not touched.'
                  : 'Deposits, withdrawals and reinvesting open again (each still follows its own switch).'
                : flip.next
                  ? `${flipping.on}, straight away.`
                  : flipping.ask}
            </p>
          ) : null
        }
        fields={[]}
        confirmLabel={stops ? 'Pause' : 'Turn on'}
        tone={stops ? 'danger' : 'primary'}
        onConfirm={flipSwitch}
        onClose={() => setFlip(null)}
      />

      <ActionDialog
        open={confirming}
        title={edits.length === 1 ? 'Save this change?' : `Save these ${edits.length} changes?`}
        body={
          <>
            <ul className="mt-1 space-y-1.5">
              {saved &&
                edits.map((f) => (
                  <li key={f.key} className="flex items-baseline justify-between gap-4 tabular-nums">
                    <span>{f.label}</span>
                    <span className="shrink-0">
                      <span className="text-muted/70 line-through">{show(f, toDisplay(f, readValue(f, saved)))}</span>
                      <span className="text-muted"> → </span>
                      <span className="font-semibold text-text">{show(f, Number(form[f.key]))}</span>
                    </span>
                  </li>
                ))}
            </ul>
            <p className="mt-3">Rates and limits apply to every account straight away; the daily return from the next payout.</p>
          </>
        }
        fields={[]}
        confirmLabel="Save"
        onConfirm={save}
        onClose={() => setConfirming(false)}
      />
    </div>
  )
}
