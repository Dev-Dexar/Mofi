import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { AdminDeposit, AdminWithdrawal } from '@/lib/api'
import { NotFoundIllustration } from '@/features/misc/NotFoundIllustration'
import { CopyIcon } from '@/icons'
import { coinSymbol } from '@/lib/coins'
import { useToast } from '@/context/ToastContext'
import { useCopy } from '@/features/referrals/components/shared'
import { truncateText } from '@/lib/formatters'
import { moneySource } from './moneySource'
import { ActionDialog, CoinChip, MoneyStatus, dangerBtn, depositLabel, goodBtn, money, pillBtn, when, withdrawalLabel } from './components/ui'

type User = { id: string; email: string | null; full_name: string | null; avatar_url?: string | null } | null

/** One deposit or withdrawal in the popup over the Money list: who, what, every id and hash with a copy button, and the fixes. */
export default function AdminMoneyDetails({
  kind,
  id,
  preview,
  onChanged,
}: {
  kind: 'deposits' | 'withdrawals'
  id: string
  preview?: AdminDeposit | AdminWithdrawal
  onChanged: () => void
}) {
  const deposit = kind === 'deposits'
  // opened from the list, the row is already known: shown at once, then refreshed. Only a link or a reload waits.
  const [row, setRow] = useState<AdminDeposit | AdminWithdrawal | null>(preview?.id === id ? preview : null)
  const [failed, setFailed] = useState(false)
  const [fix, setFix] = useState<'credit' | 'reject' | 'complete' | 'refund' | null>(null)
  const toast = useToast()

  const load = () =>
    (deposit ? moneySource.deposit(id) : moneySource.withdrawal(id))
      .then((r) => {
        setRow(r)
        setFailed(false)
      })
      .catch(() => setFailed(true))

  useEffect(() => {
    load()
  }, [id, kind]) // eslint-disable-line react-hooks/exhaustive-deps

  if (failed && !row) {
    return (
      <div className="flex min-h-[300px] flex-col items-center justify-center p-8 text-center select-none">
        <NotFoundIllustration
          title={deposit ? 'DEPOSIT NOT FOUND' : 'WITHDRAWAL NOT FOUND'}
          className="w-64 sm:w-72 h-auto select-none pointer-events-none drop-shadow-xl mb-4"
        />
        <Link
          to="/admin/money"
          className="inline-flex h-8 items-center rounded-full border border-ink/10 bg-ink/[0.04] px-5 text-xs font-medium text-text transition hover:bg-ink/10 hover:border-ink/20 active:scale-95"
        >
          Back
        </Link>
      </div>
    )
  }


  const d = deposit ? (row as AdminDeposit | null) : null
  const w = !deposit ? (row as AdminWithdrawal | null) : null
  const settleable = d ? !['finished', 'refunded', 'failed', 'waiting'].includes(d.status) : w ? w.status === 'processing' || w.status === 'sending' : false
  const user: User = row?.user ?? null

  return (
    <div className="sk-fade space-y-6">
      {/* Who, and the three things that matter most */}
      <div className="overflow-hidden rounded-3xl border border-ink/10 bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-4 p-5">
          <Person user={user} ready={!!row} />
          {user ? (
            <Link to={`/admin/users/${user.id}`} className={pillBtn}>
              Open account
            </Link>
          ) : (
            <div className="sk h-9 w-28" />
          )}
        </div>
        <dl className="grid grid-cols-1 border-t border-ink/[0.06] text-sm sm:grid-cols-3 [&>*]:px-5 [&>*]:py-3.5 [&>*+*]:border-t [&>*+*]:border-ink/[0.06] sm:[&>*+*]:border-l sm:[&>*+*]:border-t-0">
          <Cell label={deposit ? 'Ordered' : 'Amount'}>{row ? <span className="font-bold tabular-nums text-text">{money(d ? d.price_amount : w!.amount)}</span> : <div className="sk h-4 w-20" />}</Cell>
          <Cell label={deposit ? 'Paid in' : 'Paid out in'}>
            {row ? <CoinChip code={d ? d.pay_currency : w!.network} /> : <div className="sk h-6 w-20" />}
          </Cell>
          <Cell label="Status">{row ? <MoneyStatus status={row.status} label={deposit ? depositLabel(row.status) : withdrawalLabel(row.status)} /> : <div className="sk h-[22px] w-20" />}</Cell>
        </dl>
      </div>

      {/* Every figure, id and hash */}
      <div className="rounded-3xl border border-ink/10 bg-surface px-5 py-1">
        {d && (
          <dl className="divide-y divide-ink/[0.06]">
            <Row label="Reference" value={d.reference} copy mono />
            <Row label="Order ID" value={d.order_id} copy mono />
            <Row label="Payment ID" value={d.payment_id} copy mono />
            <Row label="Quoted" value={d.pay_amount && `${d.pay_amount} ${coinSymbol(d.pay_currency)}`} />
            <Row label="Actually paid" value={d.actually_paid && `${d.actually_paid} ${coinSymbol(d.pay_currency)}`} note={share(d)} />
            <Row label="Credited" value={d.credited_usdt && money(d.credited_usdt)} tone="text-primary" />
            <Row label="Pay-in hash" value={d.payin_hash} copy mono short />
            <Row label="Started" value={when(d.created_at)} />
            <Row label="Credited at" value={d.credited_at && when(d.credited_at)} />
          </dl>
        )}
        {w && (
          <dl className="divide-y divide-ink/[0.06]">
            <Row label="Reference" value={w.reference} copy mono />
            <Row label="Address" value={w.address} copy mono short />
            <Row label="Payout ID" value={w.payout_id} copy mono />
            <Row label="Payout amount" value={w.payout_amount && `${w.payout_amount} ${coinSymbol(w.network)}`} />
            <Row label="Transaction hash" value={w.tx_hash} copy mono short />
            <Row label="Requested" value={when(w.created_at)} />
            <Row label="Delivered" value={w.completed_at && when(w.completed_at)} />
            <Row label="Refunded" value={w.refunded_at && when(w.refunded_at)} />
          </dl>
        )}
        {!row && (
          <div className="space-y-3.5 py-4" aria-hidden="true">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="flex justify-between gap-6">
                <div className="sk h-4 w-24" />
                <div className="sk h-4 w-40" />
              </div>
            ))}
          </div>
        )}
      </div>

      {w?.error && (
        <div>
          <p className="mb-1.5 px-1 text-xs font-semibold text-muted">What the gateway said</p>
          <p className="rounded-2xl bg-[#3a1c24] px-4 py-3 text-sm leading-relaxed text-text [overflow-wrap:anywhere]">{w.error}</p>
        </div>
      )}

      {/* The two fixes, anchored to the bottom of the popup while the money is waiting on a person */}
      {settleable && (
        <div className="sticky bottom-0 isolate z-20 before:pointer-events-none before:absolute before:-inset-x-6 before:-bottom-6 before:-top-8 before:-z-10 before:bg-gradient-to-t before:from-surface before:via-surface/90 before:to-transparent sm:before:-inset-x-8 sm:before:-bottom-8">
          <div className="grid grid-cols-2 gap-2.5">
            <button type="button" onClick={() => setFix(deposit ? 'reject' : 'refund')} className={`${dangerBtn} h-11 justify-center`}>
              {deposit ? 'Reject' : 'Refund'}
            </button>
            <button type="button" onClick={() => setFix(deposit ? 'credit' : 'complete')} className={`${goodBtn} h-11 justify-center`}>
              {deposit ? 'Credit' : 'Mark delivered'}
            </button>
          </div>
        </div>
      )}

      {/* The fixes, each confirmed with a note for the admin log */}
      <ActionDialog
        open={fix === 'credit'}
        title="Credit this deposit"
        body={
          d && (
            <>
              Credits the amount as {d.user?.email}&apos;s locked principal, through the same ledger as the gateway, and pays referral commission on it. Ordered:{' '}
              <span className="text-text">{money(d.price_amount)}</span>
              {d.actually_paid && (
                <>
                  ; paid {d.actually_paid} of {d.pay_amount} {coinSymbol(d.pay_currency)}
                </>
              )}
              .
            </>
          )
        }
        fields={[
          { key: 'amount', label: 'USDT to credit (what really arrived)', type: 'number', required: true, initial: d ? estimate(d) : '' },
          { key: 'note', label: 'Note for the admin log', placeholder: 'e.g. checked on-chain, paid 96%', required: true },
        ]}
        confirmLabel="Credit"
        onConfirm={async (v) => {
          await moneySource.resolveDeposit(id, { action: 'credit', amount: Number(v.amount), note: v.note })
          toast.success('Deposit credited', 'wallet')
          onChanged()
          load()
        }}
        onClose={() => setFix(null)}
      />
      <ActionDialog
        open={fix === 'reject'}
        title="Reject this deposit?"
        body="It is marked failed and nothing is credited. Use this when the payment never really arrived, or was refunded at the gateway."
        fields={[{ key: 'note', label: 'Note for the admin log', placeholder: 'e.g. refunded by the gateway', required: true }]}
        confirmLabel="Reject"
        tone="danger"
        onConfirm={async (v) => {
          await moneySource.resolveDeposit(id, { action: 'reject', note: v.note })
          toast.error('Deposit rejected')
          onChanged()
          load()
        }}
        onClose={() => setFix(null)}
      />
      <ActionDialog
        open={fix === 'complete'}
        title="Mark as delivered"
        body="Only once you have seen the payout arrive on-chain. The withdrawal is completed with that transaction hash."
        fields={[
          { key: 'tx_hash', label: 'Transaction hash', placeholder: '0x…', required: true },
          { key: 'note', label: 'Note for the admin log', placeholder: 'e.g. confirmed on the explorer', required: true },
        ]}
        confirmLabel="Mark delivered"
        onConfirm={async (v) => {
          await moneySource.resolveWithdrawal(id, { action: 'complete', tx_hash: v.tx_hash.trim(), note: v.note })
          toast.success('Withdrawal marked delivered', 'wallet')
          onChanged()
          load()
        }}
        onClose={() => setFix(null)}
      />
      <ActionDialog
        open={fix === 'refund'}
        title="Refund this withdrawal?"
        body={
          w && (
            <>
              The full {money(w.amount)} goes back to their withdrawable balance. Only do this once you are sure the payout was not sent: if it was, they are paid twice.
            </>
          )
        }
        fields={[{ key: 'note', label: 'Note for the admin log', placeholder: 'e.g. gateway confirms it was never sent', required: true }]}
        confirmLabel="Refund"
        tone="danger"
        onConfirm={async (v) => {
          await moneySource.resolveWithdrawal(id, { action: 'refund', note: v.note })
          toast.info('Withdrawal refunded', 'wallet')
          onChanged()
          load()
        }}
        onClose={() => setFix(null)}
      />
    </div>
  )
}

/** What an underpaid deposit is worth, pro rata: the share of the coin amount that arrived, of what was ordered */
function estimate(d: AdminDeposit) {
  const paid = Number(d.actually_paid)
  const quoted = Number(d.pay_amount)
  const ordered = Number(d.price_amount)
  if (!(paid > 0) || !(quoted > 0)) return String(ordered)
  return String(Math.floor(Math.min(1, paid / quoted) * ordered * 100) / 100)
}

/** "97% of the quote" for a deposit that has some money in */
function share(d: AdminDeposit) {
  const paid = Number(d.actually_paid)
  const quoted = Number(d.pay_amount)
  return paid > 0 && quoted > 0 ? `${Math.round((paid / quoted) * 100)}% of the quote` : undefined
}

function Person({ user, ready }: { user: User; ready: boolean }) {
  const initial = (user?.full_name || user?.email || '?')[0].toUpperCase()
  return (
    <div className="flex min-w-0 items-center gap-3.5">
      {user?.avatar_url ? (
        <img src={user.avatar_url} alt="" className="size-12 shrink-0 rounded-full object-cover ring-2 ring-ink/15" />
      ) : (
        <span className="grid size-12 shrink-0 place-items-center rounded-full bg-ink/10 text-lg font-bold text-primary">{ready ? initial : ''}</span>
      )}
      <div className="min-w-0">
        {ready ? (
          <>
            <p className="truncate text-base font-black tracking-tight text-text">{user?.full_name || 'No name'}</p>
            <p className="truncate text-sm text-muted">{user?.email}</p>
          </>
        ) : (
          <>
            <div className="sk h-4 w-36" />
            <div className="sk mt-2 h-3.5 w-48" />
          </>
        )}
      </div>
    </div>
  )
}

function Cell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1">{children}</dd>
    </div>
  )
}

/** A label and its value; a long id or hash is shortened (the whole of it is what a click copies) */
function Row({ label, value, note, copy = false, mono = false, short = false, tone = 'text-text' }: { label: string; value?: string | null; note?: string; copy?: boolean; mono?: boolean; short?: boolean; tone?: string }) {
  const doCopy = useCopy()
  return (
    <div className="flex items-start justify-between gap-6 py-3 text-sm">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className={`min-w-0 text-right ${tone}`}>
        {value ? (
          copy ? (
            <button type="button" onClick={() => doCopy(value, label)} title={value} className={`group inline-flex max-w-full items-center gap-2 ${mono ? 'font-mono text-[13px]' : ''}`}>
              <span className="truncate">{short ? truncateText(value, 10, 8) : value}</span>
              <CopyIcon className="size-4 shrink-0 text-muted transition-colors group-hover:text-text" />
            </button>
          ) : (
            <span className="[overflow-wrap:anywhere]">{value}</span>
          )
        ) : (
          <span className="text-muted">—</span>
        )}
        {note && <span className="mt-0.5 block text-xs text-muted">{note}</span>}
      </dd>
    </div>
  )
}
