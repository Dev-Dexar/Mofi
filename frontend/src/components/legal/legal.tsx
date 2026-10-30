import type { ReactNode } from 'react'

export interface LegalDoc {
  id: 'privacy' | 'terms'
  title: string
  /** The document itself. Leave undefined and the window shows a placeholder. */
  body?: ReactNode
}

const UPDATED = 'Last updated 25 October 2026'
// the address shown in Terms and Privacy as the place to write to (VITE_SUPPORT_EMAIL in frontend/.env)
const SUPPORT = (import.meta.env.VITE_SUPPORT_EMAIL as string | undefined) || 'support@example.com'

function Doc({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="text-2xl font-black tracking-tight text-text sm:text-3xl">{title}</h3>
      <p className="mt-2 text-xs text-muted/70">{UPDATED}</p>
      <div className="mt-6 space-y-6">{children}</div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h4 className="text-sm font-semibold text-text">{title}</h4>
      <div className="mt-2 space-y-2 text-sm leading-relaxed text-muted">{children}</div>
    </section>
  )
}

function List({ items }: { items: ReactNode[] }) {
  return (
    <ul className="space-y-1.5">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2.5">
          <span aria-hidden="true" className="mt-[0.6rem] size-1 shrink-0 rounded-full bg-muted/60" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}

const TERMS = (
  <Doc title="Terms & Conditions">
    <p className="text-sm leading-relaxed text-muted">By creating an account or using MoFi Life you agree to these terms.</p>

    <Section title="Your account">
      <p>
        You must be at least 18 and allowed to use a service like this where you live. Keep your account secure: use a strong, unique password and turn on two-step
        sign-in (2FA) in your profile. Everything done from your account is your responsibility. We never ask for your password or your codes, so never share them with anyone.
      </p>
    </Section>

    <Section title="Principal">
      <p>
        Every deposit becomes principal and is locked forever. It can never be withdrawn, refunded or transferred. Only what it earns can be withdrawn. Send the exact
        amount shown, to the address and network shown, before the payment expires: a payment sent to a wrong address or network, or short of the amount, can be lost
        or held, and we cannot promise to return it.
      </p>
    </Section>

    <Section title="Daily returns">
      <p>
        Your principal earns a daily return at the current rate, paid every day at 00:00 UTC, for as long as it is held. A deposit earns from the first payout after
        it is credited. We set the rate and can change it; a change applies from the next payout.
      </p>
    </Section>

    <Section title="Withdrawals">
      <p>
        You can withdraw your earnings (daily returns and referral commissions) at any time, above the minimum shown in the app. You pay the network fee, and a payout
        sent to a wrong address cannot be taken back.
      </p>
    </Section>

    <Section title="Reinvesting">
      <p>
        Reinvesting moves your earned balance into your principal. It is locked forever like any deposit and cannot be withdrawn afterwards. Auto-reinvest does this
        after every payout until you turn it off.
      </p>
    </Section>

    <Section title="Not allowed">
      <p>If you try any of the following, your account can be suspended without notice:</p>
      <List
        items={[
          'sending fake, worthless or stolen coins, or any payment you have no right to make;',
          'faking or altering payments or balances;',
          'scams, fraud, or misleading other members;',
          'spam, abuse, or unwanted invitations;',
          'attacking the site or bypassing its limits, or any other behaviour we judge harmful or unrelated to normal use.',
        ]}
      />
    </Section>

    <Section title="Suspension">
      <p>
        A suspended account can have its earnings and commissions withheld or cancelled, and no money will be paid out. Locked principal stays locked. You can send one
        appeal; our decision is final.
      </p>
    </Section>

    <Section title="Risk">
      <p>
        Crypto is risky and its value can change. Returns are paid at the current rate, are not guaranteed, and can change or stop. Taxes on what you earn are your
        responsibility. MoFi Life is provided as it is, and to the extent the law allows we are not liable for losses from delays, outages, wrong addresses or your own mistakes.
      </p>
    </Section>

    <Section title="Changes">
      <p>We can pause deposits, withdrawals or reinvesting at any time, and update these terms. Using MoFi Life after a change means you accept it.</p>
    </Section>

    <Section title="Contact">
      <p>
        Questions, problems or a suspension you want to discuss: <a href={`mailto:${SUPPORT}`} className="text-text underline decoration-ink/25 underline-offset-2 hover:decoration-ink/70">{SUPPORT}</a>
      </p>
    </Section>
  </Doc>
)

const PRIVACY = (
  <Doc title="Privacy Policy">
    <Section title="What we keep">
      <p>
        Your name, email, profile picture, the wallet addresses you withdraw to, your deposit and withdrawal history, and basic security data such as your IP address
        and device. We use it to run your account and to stop fraud and abuse.
      </p>
    </Section>

    <Section title="Who sees it">
      <p>We do not sell your data or share it with anyone, except where the law requires it. Other members only ever see your first name and last initial.</p>
    </Section>

    <Section title="Your data">
      <p>You can change your name and picture in your profile. You can ask us to correct or delete your data, except records we must keep, such as money and security records.</p>
    </Section>

    <Section title="Keeping it safe">
      <p>
        Use a strong, unique password and turn on two-step sign-in (2FA) in your profile. We never ask for your password or your codes. If you think someone else
        has got into your account, contact us at once.
      </p>
    </Section>

    <Section title="Contact">
      <p>
        Questions about your data: <a href={`mailto:${SUPPORT}`} className="text-text underline decoration-ink/25 underline-offset-2 hover:decoration-ink/70">{SUPPORT}</a>
      </p>
    </Section>
  </Doc>
)

export const LEGAL_DOCS: Record<LegalDoc['id'], LegalDoc> = {
  privacy: { id: 'privacy', title: 'Privacy Policy', body: PRIVACY },
  terms: { id: 'terms', title: 'Terms & Conditions', body: TERMS },
}
