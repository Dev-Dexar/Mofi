-- ==============================================================================================================
-- MoFi Life: complete database setup for a NEW, EMPTY Supabase project.
--
--   How: Supabase dashboard > SQL Editor > New query > paste this whole file > Run. Run it once, on an empty project.
--        (It creates everything below; it does not drop anything, so it will stop with an error on a project that already has these.)
--
--   What it builds, exactly as the live project has it:
--     1. the user_role type                      5. triggers (append-only money history, protected principal, updated_at,
--     2. 17 tables with every check and key         disposable-email sign-up block on auth.users)
--     3. indexes and foreign keys                6. row level security + policies on every table
--     4. 36 functions: all money and admin       7. access: the browser roles can touch nothing; only the backend's service role can
--        logic, locked to the service role       8. starting data: rules, 5 referral tiers, 66 disposable-email domains
--                                                9. the public "avatars" bucket for profile pictures and its policies
--
--   After it runs:
--     * Put the project URL and the service_role key in backend/.env, the URL and the anon key in frontend/.env.
--     * Sign up in the app once, then make yourself the first admin (run this in the SQL Editor, with your email):
--           UPDATE public.profiles SET role = 'admin' WHERE email = 'you@example.com';
--     * Auth dashboard: turn on "Leaked password protection" and set the Site URL / redirect URLs for your domain.
-- ==============================================================================================================


-- ==========================================================================================================
-- 1. TYPES
-- ==========================================================================================================

CREATE TYPE public.user_role AS ENUM (
    'user',
    'admin'
);


-- ==========================================================================================================
-- 2. TABLES
-- ==========================================================================================================

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    email text,
    full_name text,
    avatar_url text,
    role public.user_role DEFAULT 'user'::public.user_role NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    status_reason text,
    status_changed_at timestamp with time zone,
    referral_code text NOT NULL,
    referred_by uuid,
    signup_method text DEFAULT 'email'::text NOT NULL,
    auto_reinvest boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT profiles_status_check CHECK ((status = ANY (ARRAY['active'::text, 'suspended'::text])))
);

CREATE TABLE public.app_settings (
    id integer DEFAULT 1 NOT NULL,
    min_deposit_usdt numeric(16,2) DEFAULT 30.00 NOT NULL,
    max_deposit_usdt numeric(16,2) DEFAULT 100000.00 NOT NULL,
    min_withdraw_usdt numeric(16,2) DEFAULT 30.00 NOT NULL,
    min_reinvest_usdt numeric(16,2) DEFAULT 0.20 NOT NULL,
    daily_rate numeric(8,6) DEFAULT 0.002000 NOT NULL,
    deposits_enabled boolean DEFAULT true NOT NULL,
    withdrawals_enabled boolean DEFAULT true NOT NULL,
    reinvest_enabled boolean DEFAULT true NOT NULL,
    maintenance_mode boolean DEFAULT false NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    CONSTRAINT app_settings_check CHECK ((max_deposit_usdt >= min_deposit_usdt)),
    CONSTRAINT app_settings_daily_rate_check CHECK ((daily_rate >= (0)::numeric)),
    CONSTRAINT app_settings_id_check CHECK ((id = 1)),
    CONSTRAINT app_settings_min_deposit_usdt_check CHECK ((min_deposit_usdt > (0)::numeric)),
    CONSTRAINT app_settings_min_reinvest_usdt_check CHECK ((min_reinvest_usdt > (0)::numeric)),
    CONSTRAINT app_settings_min_withdraw_usdt_check CHECK ((min_withdraw_usdt > (0)::numeric)),
    CONSTRAINT app_settings_sane CHECK (((daily_rate <= 0.1) AND (min_deposit_usdt <> 'NaN'::numeric) AND (max_deposit_usdt <> 'NaN'::numeric) AND (min_withdraw_usdt <> 'NaN'::numeric) AND (min_reinvest_usdt <> 'NaN'::numeric) AND (daily_rate <> 'NaN'::numeric)))
);

CREATE TABLE public.appeals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    suspension_id uuid NOT NULL,
    user_id uuid NOT NULL,
    message text NOT NULL,
    response text,
    status text DEFAULT 'pending'::text NOT NULL,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT appeals_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'rejected'::text])))
);

CREATE TABLE public.audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    admin_id uuid,
    action text NOT NULL,
    target_type text,
    target_id uuid,
    target_user_id uuid,
    note text,
    details jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.deposits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    reference text NOT NULL,
    user_id uuid NOT NULL,
    order_id text NOT NULL,
    payment_id text,
    status text DEFAULT 'waiting'::text NOT NULL,
    price_amount numeric(16,2) NOT NULL,
    price_currency text DEFAULT 'usd'::text NOT NULL,
    pay_currency text NOT NULL,
    pay_amount numeric(24,8),
    pay_address text,
    pay_network text,
    actually_paid numeric(24,8) DEFAULT 0,
    credited_usdt numeric(16,2),
    fee_paid_by_user boolean DEFAULT true NOT NULL,
    payin_hash text,
    gateway_payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    expires_at timestamp with time zone,
    credited_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT deposits_finite CHECK (((price_amount <> 'NaN'::numeric) AND (credited_usdt IS DISTINCT FROM 'NaN'::numeric))),
    CONSTRAINT deposits_status_check CHECK ((status = ANY (ARRAY['waiting'::text, 'confirming'::text, 'confirmed'::text, 'sending'::text, 'partially_paid'::text, 'finished'::text, 'failed'::text, 'refunded'::text, 'expired'::text])))
);

CREATE TABLE public.disposable_email_domains (
    domain text NOT NULL
);

CREATE TABLE public.distribution_batches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    run_date date NOT NULL,
    triggered_by text NOT NULL,
    admin_id uuid,
    status text DEFAULT 'running'::text NOT NULL,
    payouts_count integer DEFAULT 0 NOT NULL,
    total_paid numeric(24,8) DEFAULT 0 NOT NULL,
    auto_reinvested_count integer DEFAULT 0 NOT NULL,
    days_paid integer DEFAULT 1 NOT NULL,
    error_detail jsonb DEFAULT '{}'::jsonb NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone,
    CONSTRAINT distribution_batches_status_check CHECK ((status = ANY (ARRAY['running'::text, 'completed'::text, 'partial'::text, 'failed'::text])))
);

CREATE TABLE public.otp_attempts (
    id bigint NOT NULL,
    key text NOT NULL,
    scope text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.payment_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider text DEFAULT 'nowpayments'::text NOT NULL,
    event_type text NOT NULL,
    external_id text,
    status text,
    signature_valid boolean DEFAULT false NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    result jsonb,
    error text,
    processed boolean DEFAULT false NOT NULL,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.referral_earnings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    earner_id uuid NOT NULL,
    source_user_id uuid NOT NULL,
    deposit_id uuid NOT NULL,
    level integer NOT NULL,
    amount numeric(24,8) NOT NULL,
    percentage numeric(6,4) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT referral_earnings_finite CHECK ((amount <> 'NaN'::numeric))
);

CREATE TABLE public.referral_levels (
    level integer NOT NULL,
    percentage numeric(6,4) NOT NULL,
    CONSTRAINT referral_levels_level_check CHECK (((level >= 1) AND (level <= 5))),
    CONSTRAINT referral_levels_percentage_check CHECK (((percentage >= (0)::numeric) AND (percentage <= (1)::numeric)))
);

CREATE TABLE public.stakes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    principal numeric(24,8) NOT NULL,
    source text NOT NULL,
    deposit_id uuid,
    earned_total numeric(24,8) DEFAULT 0.00000000 NOT NULL,
    last_payout_date date,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT stakes_finite CHECK (((principal <> 'NaN'::numeric) AND (earned_total <> 'NaN'::numeric))),
    CONSTRAINT stakes_principal_check CHECK ((principal > (0)::numeric)),
    CONSTRAINT stakes_source_check CHECK ((source = ANY (ARRAY['deposit'::text, 'reinvest'::text, 'admin'::text])))
);

CREATE TABLE public.suspensions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    reference text NOT NULL,
    user_id uuid NOT NULL,
    reason text NOT NULL,
    public_reason text,
    suspended_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    lifted_at timestamp with time zone,
    lifted_by uuid,
    lift_note text
);

CREATE TABLE public.wallet_ledger (
    id bigint NOT NULL,
    reference text NOT NULL,
    user_id uuid NOT NULL,
    entry_type text NOT NULL,
    source text NOT NULL,
    direction text NOT NULL,
    amount numeric(24,8) NOT NULL,
    currency text DEFAULT 'USDT'::text NOT NULL,
    balance_before numeric(24,8) NOT NULL,
    balance_after numeric(24,8) NOT NULL,
    fee numeric(16,2) DEFAULT 0 NOT NULL,
    status text DEFAULT 'completed'::text NOT NULL,
    deposit_id uuid,
    withdrawal_id uuid,
    stake_id uuid,
    related_user_id uuid,
    tier integer,
    tx_hash text,
    network text,
    address text,
    description text,
    meta jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT wallet_ledger_amount_check CHECK ((amount >= (0)::numeric)),
    CONSTRAINT wallet_ledger_direction_check CHECK ((direction = ANY (ARRAY['in'::text, 'out'::text]))),
    CONSTRAINT wallet_ledger_entry_type_check CHECK ((entry_type = ANY (ARRAY['deposit'::text, 'withdraw'::text, 'withdraw_refund'::text, 'daily_yield'::text, 'referral_bonus'::text, 'reinvest'::text, 'admin_adjustment'::text]))),
    CONSTRAINT wallet_ledger_finite CHECK (((amount <> 'NaN'::numeric) AND (balance_before <> 'NaN'::numeric) AND (balance_after <> 'NaN'::numeric))),
    CONSTRAINT wallet_ledger_source_check CHECK ((source = ANY (ARRAY['deposit'::text, 'returns'::text, 'referral'::text, 'reinvest'::text, 'system'::text, 'admin'::text]))),
    CONSTRAINT wallet_ledger_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'completed'::text, 'failed'::text])))
);

CREATE TABLE public.wallets (
    user_id uuid NOT NULL,
    deposit_balance numeric(24,8) DEFAULT 0.00000000 NOT NULL,
    returns_balance numeric(24,8) DEFAULT 0.00000000 NOT NULL,
    referral_balance numeric(24,8) DEFAULT 0.00000000 NOT NULL,
    total_deposited numeric(24,8) DEFAULT 0.00000000 NOT NULL,
    total_reinvested numeric(24,8) DEFAULT 0.00000000 NOT NULL,
    total_returns numeric(24,8) DEFAULT 0.00000000 NOT NULL,
    total_referral numeric(24,8) DEFAULT 0.00000000 NOT NULL,
    total_withdrawn numeric(24,8) DEFAULT 0.00000000 NOT NULL,
    usdt_balance numeric(24,8) GENERATED ALWAYS AS ((returns_balance + referral_balance)) STORED,
    total_earned numeric(24,8) GENERATED ALWAYS AS ((total_returns + total_referral)) STORED,
    total_balance numeric(24,8) GENERATED ALWAYS AS (((deposit_balance + returns_balance) + referral_balance)) STORED,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT wallets_deposit_balance_check CHECK ((deposit_balance >= (0)::numeric)),
    CONSTRAINT wallets_finite CHECK (((deposit_balance <> 'NaN'::numeric) AND (returns_balance <> 'NaN'::numeric) AND (referral_balance <> 'NaN'::numeric) AND (total_deposited <> 'NaN'::numeric) AND (total_reinvested <> 'NaN'::numeric) AND (total_returns <> 'NaN'::numeric) AND (total_referral <> 'NaN'::numeric) AND (total_withdrawn <> 'NaN'::numeric))),
    CONSTRAINT wallets_referral_balance_check CHECK ((referral_balance >= (0)::numeric)),
    CONSTRAINT wallets_returns_balance_check CHECK ((returns_balance >= (0)::numeric))
);

CREATE TABLE public.withdrawals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    reference text NOT NULL,
    user_id uuid NOT NULL,
    amount numeric(16,2) NOT NULL,
    from_returns numeric(16,2) DEFAULT 0 NOT NULL,
    from_referral numeric(16,2) DEFAULT 0 NOT NULL,
    currency text DEFAULT 'USDT'::text NOT NULL,
    network text NOT NULL,
    address text NOT NULL,
    fee numeric(16,2) DEFAULT 0 NOT NULL,
    payout_amount numeric(24,8),
    payout_id text,
    conversion_id text,
    payout_requested_at timestamp with time zone,
    tx_hash text,
    status text DEFAULT 'processing'::text NOT NULL,
    error text,
    gateway_payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    completed_at timestamp with time zone,
    refunded_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT withdrawals_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT withdrawals_finite CHECK (((amount <> 'NaN'::numeric) AND (from_returns <> 'NaN'::numeric) AND (from_referral <> 'NaN'::numeric))),
    CONSTRAINT withdrawals_status_check CHECK ((status = ANY (ARRAY['processing'::text, 'sending'::text, 'completed'::text, 'failed'::text])))
);

CREATE TABLE public.yield_distributions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    batch_id uuid NOT NULL,
    user_id uuid NOT NULL,
    stake_id uuid,
    payout_date date NOT NULL,
    eligible_principal numeric(24,8) NOT NULL,
    rate numeric(8,6) NOT NULL,
    amount numeric(24,8) NOT NULL,
    auto_reinvested boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT yield_distributions_finite CHECK (((amount <> 'NaN'::numeric) AND (eligible_principal <> 'NaN'::numeric)))
);

ALTER TABLE public.otp_attempts ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.otp_attempts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

ALTER TABLE public.wallet_ledger ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.wallet_ledger_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


-- ==========================================================================================================
-- 3. KEYS, CONSTRAINTS AND INDEXES
-- ==========================================================================================================

ALTER TABLE ONLY public.app_settings
    ADD CONSTRAINT app_settings_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.appeals
    ADD CONSTRAINT appeals_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.appeals
    ADD CONSTRAINT appeals_suspension_id_key UNIQUE (suspension_id);

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.deposits
    ADD CONSTRAINT deposits_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.deposits
    ADD CONSTRAINT deposits_reference_key UNIQUE (reference);

ALTER TABLE ONLY public.disposable_email_domains
    ADD CONSTRAINT disposable_email_domains_pkey PRIMARY KEY (domain);

ALTER TABLE ONLY public.distribution_batches
    ADD CONSTRAINT distribution_batches_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.otp_attempts
    ADD CONSTRAINT otp_attempts_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.payment_events
    ADD CONSTRAINT payment_events_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_referral_code_key UNIQUE (referral_code);

ALTER TABLE ONLY public.referral_earnings
    ADD CONSTRAINT referral_earnings_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.referral_levels
    ADD CONSTRAINT referral_levels_pkey PRIMARY KEY (level);

ALTER TABLE ONLY public.stakes
    ADD CONSTRAINT stakes_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.suspensions
    ADD CONSTRAINT suspensions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.suspensions
    ADD CONSTRAINT suspensions_reference_key UNIQUE (reference);

ALTER TABLE ONLY public.wallet_ledger
    ADD CONSTRAINT wallet_ledger_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.wallet_ledger
    ADD CONSTRAINT wallet_ledger_reference_key UNIQUE (reference);

ALTER TABLE ONLY public.wallets
    ADD CONSTRAINT wallets_pkey PRIMARY KEY (user_id);

ALTER TABLE ONLY public.withdrawals
    ADD CONSTRAINT withdrawals_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.withdrawals
    ADD CONSTRAINT withdrawals_reference_key UNIQUE (reference);

ALTER TABLE ONLY public.yield_distributions
    ADD CONSTRAINT yield_distributions_pkey PRIMARY KEY (id);


ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_avatar_url_check CHECK (((avatar_url IS NULL) OR (char_length(avatar_url) <= 2048)));
ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_full_name_check CHECK (((full_name IS NULL) OR ((char_length(full_name) >= 1) AND (char_length(full_name) <= 80))));
ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_no_self_referral CHECK (((referred_by IS NULL) OR (referred_by <> id)));
ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_referral_code_check CHECK ((referral_code ~ '^[A-Z0-9]{8}$'::text));
ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_signup_method_check CHECK ((signup_method = ANY (ARRAY['email'::text, 'google'::text])));
ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_status_reason_check CHECK (((status_reason IS NULL) OR (char_length(status_reason) <= 500)));
ALTER TABLE ONLY public.disposable_email_domains
    ADD CONSTRAINT disposable_email_domains_domain_check CHECK (((domain = lower(domain)) AND (domain <> ''::text)));

ALTER TABLE ONLY public.appeals
    ADD CONSTRAINT appeals_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.appeals
    ADD CONSTRAINT appeals_suspension_id_fkey FOREIGN KEY (suspension_id) REFERENCES public.suspensions(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.appeals
    ADD CONSTRAINT appeals_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_target_user_id_fkey FOREIGN KEY (target_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.deposits
    ADD CONSTRAINT deposits_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.distribution_batches
    ADD CONSTRAINT distribution_batches_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_referred_by_fkey FOREIGN KEY (referred_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.referral_earnings
    ADD CONSTRAINT referral_earnings_deposit_id_fkey FOREIGN KEY (deposit_id) REFERENCES public.deposits(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.referral_earnings
    ADD CONSTRAINT referral_earnings_earner_id_fkey FOREIGN KEY (earner_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.referral_earnings
    ADD CONSTRAINT referral_earnings_level_fkey FOREIGN KEY (level) REFERENCES public.referral_levels(level);

ALTER TABLE ONLY public.referral_earnings
    ADD CONSTRAINT referral_earnings_source_user_id_fkey FOREIGN KEY (source_user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.stakes
    ADD CONSTRAINT stakes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.suspensions
    ADD CONSTRAINT suspensions_lifted_by_fkey FOREIGN KEY (lifted_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.suspensions
    ADD CONSTRAINT suspensions_suspended_by_fkey FOREIGN KEY (suspended_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.suspensions
    ADD CONSTRAINT suspensions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.wallet_ledger
    ADD CONSTRAINT wallet_ledger_deposit_id_fkey FOREIGN KEY (deposit_id) REFERENCES public.deposits(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.wallet_ledger
    ADD CONSTRAINT wallet_ledger_related_user_id_fkey FOREIGN KEY (related_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.wallet_ledger
    ADD CONSTRAINT wallet_ledger_stake_id_fkey FOREIGN KEY (stake_id) REFERENCES public.stakes(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.wallet_ledger
    ADD CONSTRAINT wallet_ledger_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.wallet_ledger
    ADD CONSTRAINT wallet_ledger_withdrawal_id_fkey FOREIGN KEY (withdrawal_id) REFERENCES public.withdrawals(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.wallets
    ADD CONSTRAINT wallets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.withdrawals
    ADD CONSTRAINT withdrawals_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.yield_distributions
    ADD CONSTRAINT yield_distributions_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.distribution_batches(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.yield_distributions
    ADD CONSTRAINT yield_distributions_stake_id_fkey FOREIGN KEY (stake_id) REFERENCES public.stakes(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.yield_distributions
    ADD CONSTRAINT yield_distributions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX deposits_payment_id_key ON public.deposits USING btree (payment_id) WHERE (payment_id IS NOT NULL);

CREATE INDEX idx_appeals_status ON public.appeals USING btree (status, created_at);

CREATE INDEX idx_audit_created ON public.audit_logs USING btree (created_at DESC);

CREATE INDEX idx_audit_target_user ON public.audit_logs USING btree (target_user_id, created_at DESC);

CREATE INDEX idx_deposits_status_created ON public.deposits USING btree (status, created_at);

CREATE INDEX idx_deposits_user_status ON public.deposits USING btree (user_id, status);

CREATE INDEX idx_ledger_deposit ON public.wallet_ledger USING btree (deposit_id) WHERE (deposit_id IS NOT NULL);

CREATE INDEX idx_ledger_entry_type ON public.wallet_ledger USING btree (entry_type);

CREATE INDEX idx_ledger_stake ON public.wallet_ledger USING btree (stake_id) WHERE (stake_id IS NOT NULL);

CREATE INDEX idx_ledger_user_created ON public.wallet_ledger USING btree (user_id, created_at DESC);

CREATE INDEX idx_ledger_withdrawal ON public.wallet_ledger USING btree (withdrawal_id) WHERE (withdrawal_id IS NOT NULL);

CREATE INDEX idx_otp_attempts_lookup ON public.otp_attempts USING btree (scope, key, created_at);

CREATE INDEX idx_payment_events_external ON public.payment_events USING btree (external_id);

CREATE INDEX idx_profiles_referred_by ON public.profiles USING btree (referred_by);

CREATE INDEX idx_referral_deposit ON public.referral_earnings USING btree (deposit_id);

CREATE INDEX idx_referral_earner ON public.referral_earnings USING btree (earner_id, created_at DESC);

CREATE INDEX idx_referral_source ON public.referral_earnings USING btree (source_user_id);

CREATE INDEX idx_stakes_deposit ON public.stakes USING btree (deposit_id);

CREATE INDEX idx_stakes_payout_due ON public.stakes USING btree (last_payout_date, started_at);

CREATE INDEX idx_stakes_user_started ON public.stakes USING btree (user_id, started_at);

CREATE INDEX idx_suspensions_user ON public.suspensions USING btree (user_id, created_at DESC);

CREATE INDEX idx_withdrawals_payout_id ON public.withdrawals USING btree (payout_id);

CREATE INDEX idx_withdrawals_converting ON public.withdrawals USING btree (status) WHERE (conversion_id IS NOT NULL AND payout_requested_at IS NULL);

CREATE INDEX idx_withdrawals_user_status ON public.withdrawals USING btree (user_id, status);

CREATE INDEX idx_yield_batch ON public.yield_distributions USING btree (batch_id);

CREATE INDEX idx_yield_user_date ON public.yield_distributions USING btree (user_id, payout_date);

CREATE UNIQUE INDEX yield_distributions_stake_day_key ON public.yield_distributions USING btree (stake_id, payout_date);


-- ==========================================================================================================
-- 4. FUNCTIONS (all money and admin logic lives here; see section 7 for who may call them)
-- ==========================================================================================================

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Runs on auth.users (see section 5): a disposable address can never register, whichever client is used
CREATE FUNCTION public.block_disposable_signup() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  if new.email is not null and public.is_disposable_email(new.email) then
    raise exception 'Disposable email addresses are not allowed' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

CREATE FUNCTION public.admin_analytics(p_days integer DEFAULT 30) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
    v_days INT := LEAST(GREATEST(COALESCE(p_days, 30), 7), 366);
    v_to DATE := (now() AT TIME ZONE 'utc')::date;
    v_from DATE;
    v_series JSONB;
    v_start NUMERIC;
BEGIN
    v_from := v_to - (v_days - 1);
    SELECT COALESCE(sum(principal), 0) INTO v_start FROM public.stakes WHERE (started_at AT TIME ZONE 'utc')::date < v_from;

    WITH days AS (SELECT d::date AS day FROM generate_series(v_from, v_to, interval '1 day') d),
    su AS (SELECT (created_at AT TIME ZONE 'utc')::date AS day, count(*) AS n FROM public.profiles GROUP BY 1),
    dp AS (SELECT (credited_at AT TIME ZONE 'utc')::date AS day, count(*) AS n, sum(credited_usdt) AS amt FROM public.deposits WHERE status = 'finished' GROUP BY 1),
    wd AS (SELECT (created_at AT TIME ZONE 'utc')::date AS day, count(*) AS n, sum(amount) AS amt FROM public.withdrawals WHERE status <> 'failed' GROUP BY 1),
    py AS (SELECT payout_date AS day, sum(amount) AS amt FROM public.yield_distributions GROUP BY 1),
    ri AS (SELECT (started_at AT TIME ZONE 'utc')::date AS day, sum(principal) AS amt FROM public.stakes WHERE source = 'reinvest' GROUP BY 1),
    cm AS (SELECT (created_at AT TIME ZONE 'utc')::date AS day, sum(amount) AS amt FROM public.referral_earnings GROUP BY 1),
    pr AS (SELECT (started_at AT TIME ZONE 'utc')::date AS day, sum(principal) AS amt FROM public.stakes GROUP BY 1),
    s AS (
        SELECT d.day,
               COALESCE(su.n, 0) AS signups, COALESCE(dp.n, 0) AS deposits_count, COALESCE(dp.amt, 0) AS deposits,
               COALESCE(wd.n, 0) AS withdrawals_count, COALESCE(wd.amt, 0) AS withdrawals,
               COALESCE(py.amt, 0) AS payouts, COALESCE(ri.amt, 0) AS reinvested, COALESCE(cm.amt, 0) AS commissions,
               v_start + sum(COALESCE(pr.amt, 0)) OVER (ORDER BY d.day) AS principal
        FROM days d
        LEFT JOIN su ON su.day = d.day LEFT JOIN dp ON dp.day = d.day LEFT JOIN wd ON wd.day = d.day LEFT JOIN py ON py.day = d.day
        LEFT JOIN ri ON ri.day = d.day LEFT JOIN cm ON cm.day = d.day LEFT JOIN pr ON pr.day = d.day
    )
    SELECT jsonb_build_object(
        'days', v_days, 'from', v_from, 'to', v_to,
        'series', jsonb_agg(jsonb_build_object(
            'date', day, 'signups', signups, 'deposits_count', deposits_count, 'deposits', deposits::text,
            'withdrawals_count', withdrawals_count, 'withdrawals', withdrawals::text, 'payouts', payouts::text,
            'reinvested', reinvested::text, 'commissions', commissions::text, 'principal', principal::text) ORDER BY day),
        'totals', jsonb_build_object(
            'signups', sum(signups), 'deposits', sum(deposits)::text, 'deposits_count', sum(deposits_count),
            'withdrawals', sum(withdrawals)::text, 'withdrawals_count', sum(withdrawals_count),
            'payouts', sum(payouts)::text, 'reinvested', sum(reinvested)::text, 'commissions', sum(commissions)::text,
            'net_inflow', (sum(deposits) - sum(withdrawals))::text,
            'principal_start', v_start::text, 'principal_end', (SELECT principal FROM s ORDER BY day DESC LIMIT 1)::text))
    INTO v_series FROM s;
    RETURN v_series;
END;
$$;

CREATE FUNCTION public.admin_get_user(p_user_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
    v_profile JSONB;
BEGIN
    SELECT to_jsonb(p) INTO v_profile FROM public.profiles p WHERE p.id = p_user_id;
    IF v_profile IS NULL THEN
        RAISE EXCEPTION 'User not found';
    END IF;
    RETURN jsonb_build_object(
        'profile', v_profile,
        'wallet', (SELECT to_jsonb(w) FROM public.wallets w WHERE w.user_id = p_user_id),
        'investments', COALESCE((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.started_at DESC) FROM (
            SELECT id, principal, source, deposit_id, earned_total, last_payout_date, started_at FROM public.stakes WHERE user_id = p_user_id) s), '[]'::jsonb),
        'counts', jsonb_build_object(
            'transactions', (SELECT count(*) FROM public.wallet_ledger WHERE user_id = p_user_id),
            'deposits', (SELECT count(*) FROM public.deposits WHERE user_id = p_user_id),
            'withdrawals', (SELECT count(*) FROM public.withdrawals WHERE user_id = p_user_id),
            'payout_days', (SELECT count(DISTINCT payout_date) FROM public.yield_distributions WHERE user_id = p_user_id))
    );
END;
$$;

CREATE FUNCTION public.admin_list_users(p_search text DEFAULT NULL::text, p_status text DEFAULT NULL::text, p_role text DEFAULT NULL::text, p_sort text DEFAULT 'newest'::text, p_limit integer DEFAULT 25, p_offset integer DEFAULT 0) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
    v_total INT;
    v_items JSONB;
BEGIN
    SELECT count(*) INTO v_total FROM public.profiles p
    WHERE (p_status IS NULL OR p.status = p_status)
      AND (p_role IS NULL OR p.role = p_role::public.user_role)
      AND (p_search IS NULL OR p.email ILIKE '%' || p_search || '%' OR p.full_name ILIKE '%' || p_search || '%' OR p.referral_code ILIKE '%' || p_search || '%');

    SELECT COALESCE(jsonb_agg(to_jsonb(sub)), '[]'::jsonb) INTO v_items FROM (
        SELECT p.id, p.email, p.full_name, p.avatar_url, p.role, p.status, p.referral_code, p.signup_method, p.auto_reinvest, p.created_at,
               COALESCE(w.deposit_balance, 0)::text AS principal, COALESCE(w.usdt_balance, 0)::text AS withdrawable,
               COALESCE(w.total_deposited, 0)::text AS deposited, COALESCE(w.total_withdrawn, 0)::text AS withdrawn,
               COALESCE(w.total_earned, 0)::text AS earned
        FROM public.profiles p LEFT JOIN public.wallets w ON w.user_id = p.id
        WHERE (p_status IS NULL OR p.status = p_status)
          AND (p_role IS NULL OR p.role = p_role::public.user_role)
          AND (p_search IS NULL OR p.email ILIKE '%' || p_search || '%' OR p.full_name ILIKE '%' || p_search || '%' OR p.referral_code ILIKE '%' || p_search || '%')
        ORDER BY
            CASE WHEN p_sort = 'oldest' THEN p.created_at END ASC,
            CASE WHEN p_sort = 'principal' THEN w.deposit_balance END DESC NULLS LAST,
            CASE WHEN p_sort = 'withdrawable' THEN w.usdt_balance END DESC NULLS LAST,
            CASE WHEN p_sort = 'deposited' THEN w.total_deposited END DESC NULLS LAST,
            CASE WHEN p_sort = 'withdrawn' THEN w.total_withdrawn END DESC NULLS LAST,
            p.created_at DESC
        LIMIT LEAST(GREATEST(p_limit, 1), 100) OFFSET GREATEST(p_offset, 0)
    ) sub;

    RETURN jsonb_build_object('total', v_total, 'items', v_items);
END;
$$;

CREATE FUNCTION public.admin_resolve_deposit(p_admin_id uuid, p_deposit_id uuid, p_action text, p_amount numeric DEFAULT NULL::numeric, p_note text DEFAULT ''::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
    v_dep RECORD;
    v_res JSONB;
BEGIN
    PERFORM public.assert_admin(p_admin_id);
    SELECT * INTO v_dep FROM public.deposits WHERE id = p_deposit_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Deposit not found';
    END IF;
    IF v_dep.status = 'finished' THEN
        RAISE EXCEPTION 'This deposit is already credited.';
    END IF;

    IF p_action = 'credit' THEN
        IF v_dep.payment_id IS NULL THEN
            RAISE EXCEPTION 'This deposit never reached the gateway, so there is no payment to credit.';
        END IF;
        v_res := public.process_confirmed_deposit(v_dep.payment_id, NULL, 'finished', NULL,
                                                  jsonb_build_object('resolved_by', p_admin_id, 'note', p_note), COALESCE(p_amount, v_dep.price_amount));
        INSERT INTO public.audit_logs (admin_id, action, target_type, target_id, target_user_id, note, details)
        VALUES (p_admin_id, 'deposit_credit', 'deposit', p_deposit_id, v_dep.user_id, p_note,
                jsonb_build_object('reference', v_dep.reference, 'amount', COALESCE(p_amount, v_dep.price_amount)));
        RETURN v_res;
    ELSIF p_action = 'reject' THEN
        UPDATE public.deposits SET status = 'failed', updated_at = now() WHERE id = p_deposit_id;
        INSERT INTO public.audit_logs (admin_id, action, target_type, target_id, target_user_id, note, details)
        VALUES (p_admin_id, 'deposit_reject', 'deposit', p_deposit_id, v_dep.user_id, p_note, jsonb_build_object('reference', v_dep.reference));
        RETURN jsonb_build_object('status', 'rejected', 'deposit_id', p_deposit_id);
    END IF;
    RAISE EXCEPTION 'Unknown action %', p_action;
END;
$$;

CREATE FUNCTION public.admin_resolve_withdrawal(p_admin_id uuid, p_withdrawal_id uuid, p_action text, p_tx_hash text DEFAULT NULL::text, p_note text DEFAULT ''::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
    v_w RECORD;
    v_res JSONB;
BEGIN
    PERFORM public.assert_admin(p_admin_id);
    SELECT * INTO v_w FROM public.withdrawals WHERE id = p_withdrawal_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Withdrawal not found';
    END IF;
    IF v_w.status NOT IN ('processing', 'sending') THEN
        RAISE EXCEPTION 'This withdrawal is already %.', CASE v_w.status WHEN 'failed' THEN 'refunded' ELSE v_w.status END;
    END IF;

    IF p_action = 'complete' THEN
        v_res := public.complete_withdrawal(p_withdrawal_id, p_tx_hash, jsonb_build_object('resolved_by', p_admin_id, 'note', p_note));
        INSERT INTO public.audit_logs (admin_id, action, target_type, target_id, target_user_id, note, details)
        VALUES (p_admin_id, 'withdrawal_complete', 'withdrawal', p_withdrawal_id, v_w.user_id, p_note,
                jsonb_build_object('reference', v_w.reference, 'tx_hash', p_tx_hash));
    ELSIF p_action = 'refund' THEN
        v_res := public.fail_withdrawal(p_withdrawal_id, p_note, jsonb_build_object('resolved_by', p_admin_id));
        INSERT INTO public.audit_logs (admin_id, action, target_type, target_id, target_user_id, note, details)
        VALUES (p_admin_id, 'withdrawal_refund', 'withdrawal', p_withdrawal_id, v_w.user_id, p_note, jsonb_build_object('reference', v_w.reference));
    ELSE
        RAISE EXCEPTION 'Unknown action %', p_action;
    END IF;
    RETURN v_res;
END;
$$;

CREATE FUNCTION public.admin_review_appeal(p_admin_id uuid, p_appeal_id uuid, p_decision text, p_response text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
    v_app RECORD;
BEGIN
    PERFORM public.assert_admin(p_admin_id);
    SELECT * INTO v_app FROM public.appeals WHERE id = p_appeal_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Appeal not found';
    END IF;
    IF v_app.status <> 'pending' THEN
        RAISE EXCEPTION 'This appeal was already reviewed.';
    END IF;

    IF p_decision = 'accept' THEN
        UPDATE public.appeals SET status = 'accepted', response = p_response, reviewed_by = p_admin_id, reviewed_at = now() WHERE id = p_appeal_id;
        IF EXISTS (SELECT 1 FROM public.profiles WHERE id = v_app.user_id AND status = 'suspended') THEN
            PERFORM public.admin_set_user_status(p_admin_id, v_app.user_id, 'active', 'Appeal accepted' || COALESCE(': ' || p_response, ''));
        END IF;
        INSERT INTO public.audit_logs (admin_id, action, target_type, target_id, target_user_id, note)
        VALUES (p_admin_id, 'appeal_accept', 'appeal', p_appeal_id, v_app.user_id, p_response);
    ELSIF p_decision = 'reject' THEN
        IF btrim(COALESCE(p_response, '')) = '' THEN
            RAISE EXCEPTION 'A rejection needs a reply the user can read.';
        END IF;
        UPDATE public.appeals SET status = 'rejected', response = p_response, reviewed_by = p_admin_id, reviewed_at = now() WHERE id = p_appeal_id;
        INSERT INTO public.audit_logs (admin_id, action, target_type, target_id, target_user_id, note)
        VALUES (p_admin_id, 'appeal_reject', 'appeal', p_appeal_id, v_app.user_id, p_response);
    ELSE
        RAISE EXCEPTION 'Invalid decision %', p_decision;
    END IF;

    RETURN jsonb_build_object('status', 'success', 'decision', p_decision);
END;
$$;

CREATE FUNCTION public.admin_set_user_role(p_admin_id uuid, p_user_id uuid, p_role text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
    v_current TEXT;
BEGIN
    PERFORM public.assert_admin(p_admin_id);
    IF p_role NOT IN ('user', 'admin') THEN
        RAISE EXCEPTION 'Invalid role %', p_role;
    END IF;
    IF p_admin_id = p_user_id AND p_role <> 'admin' THEN
        RAISE EXCEPTION 'You cannot remove your own admin role.';
    END IF;
    SELECT role::text INTO v_current FROM public.profiles WHERE id = p_user_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'User not found';
    END IF;
    IF v_current = p_role THEN
        RAISE EXCEPTION 'This account is already %.', p_role;
    END IF;

    UPDATE public.profiles SET role = p_role::public.user_role, updated_at = now() WHERE id = p_user_id;
    INSERT INTO public.audit_logs (admin_id, action, target_type, target_id, target_user_id, details)
    VALUES (p_admin_id, 'user_role', 'user', p_user_id, p_user_id, jsonb_build_object('from', v_current, 'to', p_role));

    RETURN jsonb_build_object('status', 'success', 'user_id', p_user_id, 'role', p_role);
END;
$$;

CREATE FUNCTION public.admin_set_user_status(p_admin_id uuid, p_user_id uuid, p_status text, p_reason text DEFAULT NULL::text, p_public_reason text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
    v_current TEXT;
    v_ref TEXT;
BEGIN
    PERFORM public.assert_admin(p_admin_id);
    IF p_status NOT IN ('active', 'suspended') THEN
        RAISE EXCEPTION 'Invalid status %', p_status;
    END IF;
    SELECT status INTO v_current FROM public.profiles WHERE id = p_user_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'User not found';
    END IF;
    IF p_status = v_current THEN
        RAISE EXCEPTION 'This account is already %.', v_current;
    END IF;

    IF p_status = 'suspended' THEN
        IF p_admin_id = p_user_id THEN
            RAISE EXCEPTION 'You cannot suspend your own account.';
        END IF;
        IF btrim(COALESCE(p_reason, '')) = '' THEN
            RAISE EXCEPTION 'A suspension needs a reason.';
        END IF;
        v_ref := 'SUS-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 10));
        INSERT INTO public.suspensions (reference, user_id, reason, public_reason, suspended_by)
        VALUES (v_ref, p_user_id, p_reason, NULLIF(btrim(COALESCE(p_public_reason, '')), ''), p_admin_id);
    ELSE
        UPDATE public.suspensions SET lifted_at = now(), lifted_by = p_admin_id, lift_note = p_reason
        WHERE user_id = p_user_id AND lifted_at IS NULL;
    END IF;

    UPDATE public.profiles
    SET status = p_status, status_reason = CASE WHEN p_status = 'suspended' THEN p_reason ELSE NULL END,
        status_changed_at = now(), updated_at = now()
    WHERE id = p_user_id;

    INSERT INTO public.audit_logs (admin_id, action, target_type, target_id, target_user_id, note, details)
    VALUES (p_admin_id, 'user_status', 'user', p_user_id, p_user_id, p_reason,
            jsonb_build_object('from', v_current, 'to', p_status, 'reference', v_ref, 'public_reason', p_public_reason));

    RETURN jsonb_build_object('status', 'success', 'user_id', p_user_id, 'new_status', p_status);
END;
$$;

CREATE FUNCTION public.admin_update_settings(p_user_id uuid, p_changes jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
    v_old JSONB;
    v_new JSONB;
    v_key TEXT;
    v_diff JSONB := '{}'::jsonb;
    v_lvl TEXT;
    v_pct NUMERIC;
    v_old_pct NUMERIC;
    v_row RECORD;
BEGIN
    PERFORM public.assert_admin(p_user_id);
    SELECT to_jsonb(s) INTO v_old FROM public.app_settings s WHERE id = 1 FOR UPDATE;

    UPDATE public.app_settings
    SET min_deposit_usdt = COALESCE((p_changes->>'min_deposit_usdt')::numeric, min_deposit_usdt),
        max_deposit_usdt = COALESCE((p_changes->>'max_deposit_usdt')::numeric, max_deposit_usdt),
        min_withdraw_usdt = COALESCE((p_changes->>'min_withdraw_usdt')::numeric, min_withdraw_usdt),
        min_reinvest_usdt = COALESCE((p_changes->>'min_reinvest_usdt')::numeric, min_reinvest_usdt),
        daily_rate = COALESCE((p_changes->>'daily_rate')::numeric, daily_rate),
        deposits_enabled = COALESCE((p_changes->>'deposits_enabled')::boolean, deposits_enabled),
        withdrawals_enabled = COALESCE((p_changes->>'withdrawals_enabled')::boolean, withdrawals_enabled),
        reinvest_enabled = COALESCE((p_changes->>'reinvest_enabled')::boolean, reinvest_enabled),
        maintenance_mode = COALESCE((p_changes->>'maintenance_mode')::boolean, maintenance_mode)
    WHERE id = 1;

    SELECT * INTO v_row FROM public.app_settings WHERE id = 1;
    IF v_row.max_deposit_usdt < v_row.min_deposit_usdt THEN
        RAISE EXCEPTION 'The largest deposit cannot be below the smallest.';
    END IF;

    SELECT to_jsonb(s) INTO v_new FROM public.app_settings s WHERE id = 1;
    FOREACH v_key IN ARRAY ARRAY['min_deposit_usdt', 'max_deposit_usdt', 'min_withdraw_usdt', 'min_reinvest_usdt', 'daily_rate',
                                 'deposits_enabled', 'withdrawals_enabled', 'reinvest_enabled', 'maintenance_mode'] LOOP
        IF (v_old->v_key) IS DISTINCT FROM (v_new->v_key) THEN
            v_diff := v_diff || jsonb_build_object(v_key, jsonb_build_object('old', v_old->v_key, 'new', v_new->v_key));
        END IF;
    END LOOP;

    IF p_changes ? 'referral_levels' THEN
        FOR v_lvl IN SELECT jsonb_object_keys(p_changes->'referral_levels') LOOP
            v_pct := (p_changes->'referral_levels'->>v_lvl)::numeric;
            SELECT percentage INTO v_old_pct FROM public.referral_levels WHERE level = v_lvl::int;
            IF NOT FOUND THEN
                RAISE EXCEPTION 'There is no tier %', v_lvl;
            END IF;
            IF v_pct IS DISTINCT FROM v_old_pct THEN
                UPDATE public.referral_levels SET percentage = v_pct WHERE level = v_lvl::int;
                v_diff := v_diff || jsonb_build_object('referral_level_' || v_lvl, jsonb_build_object('old', v_old_pct, 'new', v_pct));
            END IF;
        END LOOP;
    END IF;

    IF v_diff = '{}'::jsonb THEN
        RETURN jsonb_build_object('status', 'unchanged');
    END IF;

    UPDATE public.app_settings SET updated_at = now(), updated_by = p_user_id WHERE id = 1;
    INSERT INTO public.audit_logs (admin_id, action, target_type, note, details)
    VALUES (p_user_id, 'settings_update', 'app_settings', 'Rules changed', jsonb_build_object('changes', v_diff));
    RETURN jsonb_build_object('status', 'success', 'changed', v_diff);
END;
$$;

CREATE FUNCTION public.append_only() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
    RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END;
$$;

CREATE FUNCTION public.assert_admin(p_user_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id AND role = 'admin' AND status = 'active') THEN
        RAISE EXCEPTION 'Access denied: Admin role required.';
    END IF;
END;
$$;

CREATE FUNCTION public.auto_reinvest_flush(p_user_id uuid, p_sum numeric, p_balance numeric) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
    v_stake_id UUID;
BEGIN
    IF p_sum IS NULL OR p_sum <= 0 THEN
        RETURN;
    END IF;
    INSERT INTO public.stakes (user_id, principal, source, started_at)
    VALUES (p_user_id, p_sum, 'reinvest', now())
    RETURNING id INTO v_stake_id;

    UPDATE public.wallets
    SET deposit_balance = deposit_balance + p_sum, total_reinvested = total_reinvested + p_sum, updated_at = now()
    WHERE user_id = p_user_id;

    INSERT INTO public.wallet_ledger (reference, user_id, entry_type, source, direction, amount, balance_before, balance_after, stake_id, description)
    VALUES ('MF-REI-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 12)), p_user_id, 'reinvest', 'reinvest', 'out', p_sum,
            p_balance + p_sum, p_balance, v_stake_id, 'Daily return reinvested automatically');
END;
$$;

CREATE FUNCTION public.clean_full_name(raw text) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
    RETURN trim(regexp_replace(replace(replace(regexp_replace(raw, '[\x00-\x1f\x7f]', ' ', 'g'), '<', ''), '>', ''), '\s+', ' ', 'g'));
END;
$$;

CREATE FUNCTION public.complete_withdrawal(p_withdrawal_id uuid, p_tx_hash text DEFAULT NULL::text, p_payload jsonb DEFAULT '{}'::jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
    v_w RECORD;
BEGIN
    SELECT * INTO v_w FROM public.withdrawals WHERE id = p_withdrawal_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Withdrawal not found';
    END IF;
    IF v_w.status = 'completed' THEN
        RETURN jsonb_build_object('status', 'already_completed', 'withdrawal_id', p_withdrawal_id);
    END IF;
    IF v_w.status = 'failed' THEN
        -- the balance was already refunded and the gateway then sent it anyway: a person has to look
        RETURN jsonb_build_object('status', 'conflict_after_refund', 'withdrawal_id', p_withdrawal_id, 'tx_hash', p_tx_hash);
    END IF;

    UPDATE public.withdrawals
    SET status = 'completed', tx_hash = COALESCE(p_tx_hash, tx_hash), gateway_payload = p_payload,
        completed_at = now(), updated_at = now()
    WHERE id = p_withdrawal_id;

    UPDATE public.wallet_ledger
    SET status = 'completed', tx_hash = COALESCE(p_tx_hash, tx_hash)
    WHERE withdrawal_id = p_withdrawal_id AND entry_type = 'withdraw';

    RETURN jsonb_build_object('status', 'completed', 'withdrawal_id', p_withdrawal_id);
END;
$$;

CREATE FUNCTION public.expire_unpaid_deposits(p_window text DEFAULT '3600 seconds'::text, p_deposit_id uuid DEFAULT NULL::uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
    v_count INT;
BEGIN
    WITH exp AS (
        UPDATE public.deposits
        SET status = 'expired', updated_at = now()
        WHERE status = 'waiting'
          AND (p_deposit_id IS NULL OR id = p_deposit_id)
          AND created_at < (now() - p_window::interval)
        RETURNING id
    )
    SELECT count(*) INTO v_count FROM exp;
    RETURN v_count;
END;
$$;

CREATE FUNCTION public.fail_withdrawal(p_withdrawal_id uuid, p_reason text, p_payload jsonb DEFAULT '{}'::jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
    v_w RECORD;
    v_before NUMERIC;
    v_after NUMERIC;
BEGIN
    SELECT * INTO v_w FROM public.withdrawals WHERE id = p_withdrawal_id FOR UPDATE;
    IF NOT FOUND OR v_w.status IN ('completed', 'failed') THEN
        RETURN jsonb_build_object('status', 'noop');
    END IF;

    UPDATE public.withdrawals
    SET status = 'failed', error = p_reason, gateway_payload = p_payload, refunded_at = now(), updated_at = now()
    WHERE id = p_withdrawal_id;

    UPDATE public.wallets
    SET returns_balance = returns_balance + v_w.from_returns,
        referral_balance = referral_balance + v_w.from_referral,
        total_withdrawn = total_withdrawn - v_w.amount,
        updated_at = now()
    WHERE user_id = v_w.user_id
    RETURNING usdt_balance - v_w.amount, usdt_balance INTO v_before, v_after;

    UPDATE public.wallet_ledger SET status = 'failed' WHERE withdrawal_id = p_withdrawal_id AND entry_type = 'withdraw';

    INSERT INTO public.wallet_ledger (reference, user_id, entry_type, source, direction, amount, balance_before, balance_after,
                                      withdrawal_id, description)
    VALUES ('MF-RFD-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 12)), v_w.user_id, 'withdraw_refund', 'system', 'in',
            v_w.amount, v_before, v_after, p_withdrawal_id, 'Withdrawal refunded: ' || COALESCE(p_reason, 'not delivered'));

    RETURN jsonb_build_object('status', 'refunded', 'withdrawal_id', p_withdrawal_id);
END;
$$;

CREATE FUNCTION public.forbid_truncate() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
    RAISE EXCEPTION '% cannot be truncated', TG_TABLE_NAME;
END;
$$;

CREATE FUNCTION public.generate_referral_code() RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
    new_code TEXT;
    done BOOLEAN := FALSE;
BEGIN
    WHILE NOT done LOOP
        new_code := upper(substring(md5(random()::text) FROM 1 FOR 8));
        IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE referral_code = new_code) THEN
            done := TRUE;
        END IF;
    END LOOP;
    RETURN new_code;
END;
$$;

CREATE FUNCTION public.get_admin_stats() RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
    w RECORD;
    v_rate NUMERIC;
    v_investors INT;
    v_parts INT;
    v_auto INT;
    v_pending_n INT;
    v_pending_sum NUMERIC;
    v_review INT;
    v_users INT;
    v_last JSONB;
    v_recent JSONB;
BEGIN
    SELECT daily_rate INTO v_rate FROM public.app_settings WHERE id = 1;
    SELECT count(*) INTO v_users FROM public.profiles;
    SELECT COALESCE(sum(deposit_balance), 0) AS principal, COALESCE(sum(returns_balance), 0) AS returns_bal,
           COALESCE(sum(referral_balance), 0) AS referral_bal, COALESCE(sum(total_deposited), 0) AS deposited,
           COALESCE(sum(total_reinvested), 0) AS reinvested, COALESCE(sum(total_returns), 0) AS returns_all,
           COALESCE(sum(total_referral), 0) AS referral_all, COALESCE(sum(total_withdrawn), 0) AS withdrawn
    INTO w FROM public.wallets;
    SELECT count(*) INTO v_investors FROM public.wallets WHERE deposit_balance > 0;
    SELECT count(*) INTO v_parts FROM public.stakes;
    SELECT count(*) INTO v_auto FROM public.profiles WHERE auto_reinvest;
    SELECT count(*), COALESCE(sum(amount), 0) INTO v_pending_n, v_pending_sum FROM public.withdrawals WHERE status IN ('processing', 'sending');
    SELECT count(*) INTO v_review FROM public.deposits WHERE status = 'partially_paid';

    SELECT jsonb_build_object(
        'run_date', b.run_date, 'status', b.status, 'triggered_by', b.triggered_by, 'days_paid', b.days_paid,
        'payouts', b.payouts_count, 'total_paid', b.total_paid::text, 'auto_reinvested', b.auto_reinvested_count, 'finished_at', b.finished_at)
    INTO v_last FROM public.distribution_batches b ORDER BY b.started_at DESC LIMIT 1;

    SELECT COALESCE(jsonb_agg(to_jsonb(x)), '[]'::jsonb) INTO v_recent FROM (
        SELECT l.id::text AS id, l.user_id, l.entry_type AS type, l.currency, l.amount::text AS amount, l.status, l.source, l.description,
               l.tx_hash, l.reference, l.network, l.address, l.fee::text AS fee, NULL::timestamptz AS expires_at, l.deposit_id, l.withdrawal_id,
               l.meta, l.created_at, p.email AS user_email, p.full_name AS user_name
        FROM public.wallet_ledger l JOIN public.profiles p ON p.id = l.user_id
        ORDER BY l.created_at DESC, l.id DESC LIMIT 10
    ) x;

    RETURN jsonb_build_object(
        'total_users', v_users,
        'investors', v_investors,
        'principal_locked', w.principal::text,
        'withdrawable_liability', (w.returns_bal + w.referral_bal)::text,
        'total_deposited', w.deposited::text,
        'total_reinvested', w.reinvested::text,
        'total_returns', w.returns_all::text,
        'total_referral', w.referral_all::text,
        'total_earned', (w.returns_all + w.referral_all)::text,
        'total_withdrawn', w.withdrawn::text,
        'daily_rate', v_rate::text,
        'next_payout_estimate', round(w.principal * v_rate, 8)::text,
        'monthly_payout_estimate', round(w.principal * v_rate * 30, 8)::text,
        'principal_parts', v_parts,
        'auto_reinvest_users', v_auto,
        'pending_withdrawals_count', v_pending_n,
        'pending_withdrawals_sum', v_pending_sum::text,
        'deposits_needing_review', v_review,
        'last_run', v_last,
        'recent_transactions', v_recent
    );
END;
$$;

CREATE FUNCTION public.get_my_suspension(p_user_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
    v_s RECORD;
    v_a RECORD;
BEGIN
    SELECT * INTO v_s FROM public.suspensions WHERE user_id = p_user_id AND lifted_at IS NULL ORDER BY created_at DESC LIMIT 1;
    IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id AND status = 'suspended') THEN
        RETURN jsonb_build_object('suspended', false);
    END IF;
    SELECT * INTO v_a FROM public.appeals WHERE suspension_id = v_s.id ORDER BY created_at DESC LIMIT 1;
    RETURN jsonb_build_object(
        'suspended', true,
        'suspension', jsonb_build_object('reference', v_s.reference, 'message', v_s.public_reason, 'since', v_s.created_at),
        'appeal', CASE WHEN v_a.id IS NULL THEN NULL ELSE jsonb_build_object(
            'status', v_a.status, 'message', v_a.message, 'response', v_a.response,
            'submitted_at', v_a.created_at, 'reviewed_at', v_a.reviewed_at) END
    );
END;
$$;

CREATE FUNCTION public.get_referral_summary(p_user_id uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
    WITH RECURSIVE tree AS (
        SELECT id, 1 AS lvl FROM public.profiles WHERE referred_by = p_user_id
        UNION ALL
        SELECT p.id, t.lvl + 1 FROM public.profiles p JOIN tree t ON p.referred_by = t.id WHERE t.lvl < 5
    )
    SELECT jsonb_build_object(
        'level_counts', (SELECT jsonb_object_agg(g::text, (SELECT count(*) FROM tree WHERE lvl = g)) FROM generate_series(1, 5) g),
        'earnings_by_level', COALESCE((SELECT jsonb_object_agg(level::text, round(total, 8)::text)
                                       FROM (SELECT level, sum(amount) AS total FROM public.referral_earnings WHERE earner_id = p_user_id GROUP BY level) e),
                                      '{}'::jsonb)
    );
$$;

CREATE FUNCTION public.is_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin' AND status = 'active'
    );
$$;

CREATE FUNCTION public.is_disposable_email(addr text) RETURNS boolean
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
    d TEXT;
BEGIN
    d := lower(split_part(addr, '@', 2));
    RETURN EXISTS (SELECT 1 FROM public.disposable_email_domains WHERE domain = d);
END;
$$;

CREATE FUNCTION public.list_user_history(p_user_id uuid, p_type text DEFAULT NULL::text, p_status text DEFAULT NULL::text, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
    WITH h AS (
        SELECT l.id::text AS id, l.user_id, l.entry_type AS type, l.currency, l.amount, l.status, l.source, l.description, l.tx_hash,
               l.reference, l.network, l.address, l.fee, NULL::timestamptz AS expires_at, l.deposit_id, l.withdrawal_id, l.meta, l.created_at
        FROM public.wallet_ledger l
        WHERE l.user_id = p_user_id
        UNION ALL
        SELECT d.id::text, d.user_id, 'deposit', 'USDT', d.price_amount,
               CASE WHEN d.status IN ('waiting', 'confirming', 'confirmed', 'sending', 'partially_paid') THEN 'pending' ELSE 'failed' END,
               'deposit', 'Deposit (' || d.status || ')', d.payin_hash, d.reference, d.pay_network, d.pay_address, 0::numeric, d.expires_at,
               d.id, NULL::uuid,
               jsonb_build_object('payment_id', d.payment_id, 'pay_currency', d.pay_currency, 'pay_amount', d.pay_amount, 'gateway_status', d.status),
               d.created_at
        FROM public.deposits d
        WHERE d.user_id = p_user_id AND d.status <> 'finished'
    ), f AS (
        SELECT * FROM h WHERE (p_type IS NULL OR type = p_type) AND (p_status IS NULL OR status = p_status)
    )
    SELECT jsonb_build_object(
        'total', (SELECT count(*) FROM f),
        'items', COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM f ORDER BY created_at DESC, id DESC LIMIT p_limit OFFSET p_offset) x), '[]'::jsonb)
    );
$$;

CREATE FUNCTION public.mark_withdrawal_sent(p_withdrawal_id uuid, p_payout_id text DEFAULT NULL::text, p_payload jsonb DEFAULT '{}'::jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
    v_w RECORD;
BEGIN
    SELECT * INTO v_w FROM public.withdrawals WHERE id = p_withdrawal_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Withdrawal not found';
    END IF;
    -- a late "sending" report never undoes a withdrawal that is already settled
    IF v_w.status NOT IN ('processing', 'sending') THEN
        RETURN jsonb_build_object('status', 'noop', 'withdrawal_status', v_w.status);
    END IF;
    UPDATE public.withdrawals
    SET status = 'sending', payout_id = COALESCE(p_payout_id, payout_id), gateway_payload = p_payload, updated_at = now()
    WHERE id = p_withdrawal_id;
    RETURN jsonb_build_object('status', 'sending', 'withdrawal_id', p_withdrawal_id);
END;
$$;

CREATE FUNCTION public.process_confirmed_deposit(p_payment_id text, p_actually_paid numeric DEFAULT NULL::numeric, p_gateway_status text DEFAULT 'finished'::text, p_payin_hash text DEFAULT NULL::text, p_payload jsonb DEFAULT '{}'::jsonb, p_credit_usdt numeric DEFAULT NULL::numeric) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
    v_dep RECORD;
    v_amount NUMERIC;
    v_stake_id UUID;
    v_sponsor UUID;
    v_current UUID;
    v_level INT;
    v_rate NUMERIC;
    v_bonus NUMERIC;
    v_before NUMERIC;
    v_after NUMERIC;
BEGIN
    SELECT * INTO v_dep FROM public.deposits WHERE payment_id = p_payment_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Deposit with payment_id % not found', p_payment_id;
    END IF;
    IF v_dep.status = 'finished' THEN
        RETURN jsonb_build_object('status', 'already_processed', 'deposit_id', v_dep.id);
    END IF;

    v_amount := round(COALESCE(p_credit_usdt, v_dep.price_amount), 8);
    IF v_amount IS NULL OR v_amount <= 0 THEN
        RAISE EXCEPTION 'Nothing to credit';
    END IF;

    UPDATE public.deposits
    SET status = 'finished',
        actually_paid = COALESCE(p_actually_paid, actually_paid),
        credited_usdt = v_amount,
        payin_hash = COALESCE(p_payin_hash, payin_hash),
        gateway_payload = p_payload,
        credited_at = now(),
        updated_at = now()
    WHERE id = v_dep.id;

    INSERT INTO public.wallets (user_id) VALUES (v_dep.user_id) ON CONFLICT DO NOTHING;

    INSERT INTO public.stakes (user_id, principal, source, deposit_id, started_at)
    VALUES (v_dep.user_id, v_amount, 'deposit', v_dep.id, now())
    RETURNING id INTO v_stake_id;

    UPDATE public.wallets
    SET deposit_balance = deposit_balance + v_amount,
        total_deposited = total_deposited + v_amount,
        updated_at = now()
    WHERE user_id = v_dep.user_id
    RETURNING deposit_balance - v_amount, deposit_balance INTO v_before, v_after;

    -- the ledger row carries the deposit's own reference, so History shows one id from "waiting" to "credited"
    INSERT INTO public.wallet_ledger (reference, user_id, entry_type, source, direction, amount, balance_before, balance_after,
                                      deposit_id, stake_id, tx_hash, network, address, description, meta)
    VALUES (v_dep.reference, v_dep.user_id, 'deposit', 'deposit', 'in', v_amount, v_before, v_after,
            v_dep.id, v_stake_id, COALESCE(p_payin_hash, v_dep.payin_hash), v_dep.pay_network, v_dep.pay_address,
            'Deposit credited', jsonb_build_object('payment_id', p_payment_id, 'pay_currency', v_dep.pay_currency));

    -- up the sponsor chain, one tier at a time
    v_current := v_dep.user_id;
    FOR v_level IN 1..5 LOOP
        SELECT referred_by INTO v_sponsor FROM public.profiles WHERE id = v_current;
        EXIT WHEN v_sponsor IS NULL OR v_sponsor = v_dep.user_id;

        SELECT percentage INTO v_rate FROM public.referral_levels WHERE level = v_level;
        v_bonus := round(v_amount * COALESCE(v_rate, 0), 8);
        IF v_bonus > 0 THEN
            INSERT INTO public.referral_earnings (earner_id, source_user_id, deposit_id, level, amount, percentage)
            VALUES (v_sponsor, v_dep.user_id, v_dep.id, v_level, v_bonus, v_rate);

            UPDATE public.wallets
            SET referral_balance = referral_balance + v_bonus,
                total_referral = total_referral + v_bonus,
                updated_at = now()
            WHERE user_id = v_sponsor
            RETURNING referral_balance - v_bonus, referral_balance INTO v_before, v_after;

            INSERT INTO public.wallet_ledger (reference, user_id, entry_type, source, direction, amount, balance_before, balance_after,
                                              deposit_id, related_user_id, tier, description)
            VALUES ('MF-REF-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 12)), v_sponsor, 'referral_bonus', 'referral', 'in',
                    v_bonus, v_before, v_after, v_dep.id, v_dep.user_id, v_level,
                    CASE WHEN v_level = 1 THEN 'Direct referral bonus' ELSE 'Tier ' || v_level || ' referral bonus' END);
        END IF;
        v_current := v_sponsor;
    END LOOP;

    RETURN jsonb_build_object('status', 'success', 'deposit_id', v_dep.id, 'credited', v_amount);
END;
$$;

CREATE FUNCTION public.process_reinvest_earnings(p_user_id uuid, p_amount numeric DEFAULT NULL::numeric) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
    v_enabled BOOLEAN;
    v_min NUMERIC;
    v_w RECORD;
    v_amount NUMERIC;
    v_from_returns NUMERIC;
    v_from_ref NUMERIC;
    v_stake_id UUID;
    v_ledger_id BIGINT;
    v_before NUMERIC;
BEGIN
    SELECT reinvest_enabled, min_reinvest_usdt INTO v_enabled, v_min FROM public.app_settings WHERE id = 1;
    IF NOT v_enabled THEN
        RAISE EXCEPTION 'Reinvesting is currently paused for system maintenance.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id AND status = 'active') THEN
        RAISE EXCEPTION 'This account cannot reinvest.';
    END IF;

    SELECT * INTO v_w FROM public.wallets WHERE user_id = p_user_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Wallet not found.';
    END IF;

    v_before := v_w.returns_balance + v_w.referral_balance;
    v_amount := round(COALESCE(p_amount, v_before), 8);
    IF v_amount <= 0 OR v_amount < v_min THEN
        RAISE EXCEPTION 'Minimum reinvestment is % USDT', v_min;
    END IF;
    IF v_before < v_amount THEN
        RAISE EXCEPTION 'Insufficient withdrawable earnings to reinvest.';
    END IF;

    v_from_returns := LEAST(v_w.returns_balance, v_amount);
    v_from_ref := v_amount - v_from_returns;

    INSERT INTO public.stakes (user_id, principal, source, started_at)
    VALUES (p_user_id, v_amount, 'reinvest', now())
    RETURNING id INTO v_stake_id;

    UPDATE public.wallets
    SET returns_balance = returns_balance - v_from_returns,
        referral_balance = referral_balance - v_from_ref,
        deposit_balance = deposit_balance + v_amount,
        total_reinvested = total_reinvested + v_amount,
        updated_at = now()
    WHERE user_id = p_user_id;

    INSERT INTO public.wallet_ledger (reference, user_id, entry_type, source, direction, amount, balance_before, balance_after, stake_id, description)
    VALUES ('MF-REI-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 12)), p_user_id, 'reinvest', 'reinvest', 'out', v_amount,
            v_before, v_before - v_amount, v_stake_id, 'Earnings reinvested into principal')
    RETURNING id INTO v_ledger_id;

    RETURN jsonb_build_object(
        'status', 'success', 'investment_id', v_stake_id, 'transaction_id', v_ledger_id::text,
        'amount', v_amount, 'from_returns', v_from_returns, 'from_referral', v_from_ref
    );
END;
$$;

CREATE FUNCTION public.process_withdraw_request(p_user_id uuid, p_amount numeric, p_network text, p_address text, p_meta jsonb DEFAULT '{}'::jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
    v_enabled BOOLEAN;
    v_min NUMERIC;
    v_w RECORD;
    v_id UUID;
    v_ledger_id BIGINT;
    v_ref TEXT;
    v_from_returns NUMERIC;
    v_from_ref NUMERIC;
    v_before NUMERIC;
BEGIN
    SELECT withdrawals_enabled, min_withdraw_usdt INTO v_enabled, v_min FROM public.app_settings WHERE id = 1;
    IF NOT v_enabled THEN
        RAISE EXCEPTION 'Withdrawals are currently paused for system maintenance.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id AND status = 'active') THEN
        RAISE EXCEPTION 'This account cannot withdraw.';
    END IF;
    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'Enter an amount to withdraw.';
    END IF;
    -- the withdrawal record keeps two places; a finer amount would debit more than it records and break a refund
    IF p_amount <> round(p_amount, 2) THEN
        RAISE EXCEPTION 'Withdrawals are in whole cents (two decimal places).';
    END IF;
    IF p_amount < v_min THEN
        RAISE EXCEPTION 'Minimum withdrawal is % USDT', v_min;
    END IF;
    IF COALESCE(btrim(p_network), '') = '' OR COALESCE(btrim(p_address), '') = '' THEN
        RAISE EXCEPTION 'A coin and an address are required.';
    END IF;

    SELECT * INTO v_w FROM public.wallets WHERE user_id = p_user_id FOR UPDATE;
    IF NOT FOUND OR (v_w.returns_balance + v_w.referral_balance) < p_amount THEN
        RAISE EXCEPTION 'Insufficient withdrawable balance.';
    END IF;

    v_from_returns := LEAST(v_w.returns_balance, p_amount);
    v_from_ref := p_amount - v_from_returns;
    v_before := v_w.returns_balance + v_w.referral_balance;
    v_ref := 'MF-WTH-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 12));

    INSERT INTO public.withdrawals (reference, user_id, amount, from_returns, from_referral, network, address, status, gateway_payload)
    VALUES (v_ref, p_user_id, p_amount, v_from_returns, v_from_ref, p_network, p_address, 'processing', p_meta)
    RETURNING id INTO v_id;

    UPDATE public.wallets
    SET returns_balance = returns_balance - v_from_returns,
        referral_balance = referral_balance - v_from_ref,
        total_withdrawn = total_withdrawn + p_amount,
        updated_at = now()
    WHERE user_id = p_user_id;

    -- pending until the gateway has delivered it
    INSERT INTO public.wallet_ledger (reference, user_id, entry_type, source, direction, amount, balance_before, balance_after,
                                      status, withdrawal_id, network, address, description)
    VALUES (v_ref, p_user_id, 'withdraw', CASE WHEN v_from_returns > 0 THEN 'returns' ELSE 'referral' END, 'out', p_amount,
            v_before, v_before - p_amount, 'pending', v_id, p_network, p_address, 'Withdrawal requested')
    RETURNING id INTO v_ledger_id;

    RETURN jsonb_build_object('withdrawal_id', v_id, 'reference', v_ref, 'transaction_id', v_ledger_id::text);
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

CREATE FUNCTION public.provision_profile(p_user_id uuid, p_email text, p_full_name text, p_avatar_url text, p_signup_method text, p_referral_code text DEFAULT NULL::text) RETURNS public.profiles
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
    v_sponsor UUID;
    v_profile public.profiles;
BEGIN
    SELECT * INTO v_profile FROM public.profiles WHERE id = p_user_id;
    IF NOT FOUND THEN
        IF p_referral_code IS NOT NULL AND btrim(p_referral_code) <> '' THEN
            SELECT id INTO v_sponsor FROM public.profiles WHERE referral_code = upper(btrim(p_referral_code)) AND id <> p_user_id;
        END IF;
        INSERT INTO public.profiles (id, email, full_name, avatar_url, referral_code, referred_by, signup_method)
        VALUES (
            p_user_id, p_email, NULLIF(left(public.clean_full_name(p_full_name), 80), ''), left(p_avatar_url, 2048),
            public.generate_referral_code(), v_sponsor, CASE WHEN p_signup_method = 'google' THEN 'google' ELSE 'email' END
        )
        ON CONFLICT (id) DO NOTHING;
        SELECT * INTO v_profile FROM public.profiles WHERE id = p_user_id;
    END IF;
    INSERT INTO public.wallets (user_id) VALUES (p_user_id) ON CONFLICT DO NOTHING;
    RETURN v_profile;
END;
$$;

CREATE FUNCTION public.reconcile_wallets() RETURNS jsonb
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
    WITH parts AS (SELECT user_id, sum(principal) AS principal, sum(earned_total) AS earned FROM public.stakes GROUP BY user_id),
         paid AS (SELECT user_id, sum(amount) AS amount FROM public.yield_distributions GROUP BY user_id),
         comm AS (SELECT earner_id AS user_id, sum(amount) AS amount FROM public.referral_earnings GROUP BY earner_id),
         checks AS (
            SELECT w.user_id, 'deposit_balance matches principal parts' AS check_name, COALESCE(p.principal, 0) AS expected, w.deposit_balance AS actual
            FROM public.wallets w LEFT JOIN parts p ON p.user_id = w.user_id
            UNION ALL
            SELECT w.user_id, 'total_returns matches daily payouts', COALESCE(y.amount, 0), w.total_returns
            FROM public.wallets w LEFT JOIN paid y ON y.user_id = w.user_id
            UNION ALL
            SELECT w.user_id, 'daily payouts match parts earned', COALESCE(p.earned, 0), COALESCE(y.amount, 0)
            FROM public.wallets w LEFT JOIN parts p ON p.user_id = w.user_id LEFT JOIN paid y ON y.user_id = w.user_id
            UNION ALL
            SELECT w.user_id, 'total_referral matches commissions', COALESCE(c.amount, 0), w.total_referral
            FROM public.wallets w LEFT JOIN comm c ON c.user_id = w.user_id
         )
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'user_id', user_id, 'check_name', check_name, 'expected', round(expected, 8)::text, 'actual', round(actual, 8)::text
    )), '[]'::jsonb)
    FROM checks WHERE round(expected, 8) <> round(actual, 8);
$$;

CREATE FUNCTION public.run_daily_returns(p_run_date date DEFAULT NULL::date, p_triggered_by text DEFAULT 'scheduler'::text, p_admin_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    SET "TimeZone" TO 'UTC'
    AS $$
DECLARE
    v_today DATE := (now() AT TIME ZONE 'utc')::date;
    v_target DATE;
    v_from DATE;
    v_day DATE;
    v_days INT := 0;
    v_batch_id UUID;
    v_rate NUMERIC;
    v_reinvest_on BOOLEAN;
    v_count INT := 0;
    v_auto INT := 0;
    v_total NUMERIC := 0;
    v_amt NUMERIC;
    v_before NUMERIC;
    v_after NUMERIC;
    v_user UUID;          -- the member whose auto-reinvested payouts are being added up
    v_sum NUMERIC := 0;   -- ... and what they come to so far today
    v_base NUMERIC := 0;  -- ... and what that member could withdraw before it
    r RECORD;
BEGIN
    IF p_triggered_by NOT IN ('scheduler', 'startup', 'admin') THEN
        RAISE EXCEPTION 'Unknown trigger %', p_triggered_by;
    END IF;
    IF p_triggered_by = 'admin' THEN
        PERFORM public.assert_admin(p_admin_id);
    END IF;

    IF NOT pg_try_advisory_xact_lock(hashtext('mofi_daily_payout_lock')) THEN
        RETURN jsonb_build_object('status', 'busy');
    END IF;

    v_target := LEAST(COALESCE(p_run_date, v_today), v_today);

    SELECT min(COALESCE(last_payout_date, started_at::date) + 1) INTO v_from
    FROM public.stakes
    WHERE COALESCE(last_payout_date, started_at::date) + 1 <= v_target;
    IF v_from IS NULL THEN
        RETURN jsonb_build_object('status', 'up_to_date', 'date', v_target);
    END IF;

    SELECT daily_rate, reinvest_enabled INTO v_rate, v_reinvest_on FROM public.app_settings WHERE id = 1;

    INSERT INTO public.distribution_batches (run_date, triggered_by, admin_id, status)
    VALUES (v_target, p_triggered_by, p_admin_id, 'running')
    RETURNING id INTO v_batch_id;

    FOR v_day IN SELECT d::date FROM generate_series(v_from, v_target, interval '1 day') d LOOP
        v_days := v_days + 1;
        v_user := NULL;
        v_sum := 0;

        FOR r IN
            SELECT s.id AS stake_id, s.user_id, s.principal, p.auto_reinvest AND v_reinvest_on AS auto
            FROM public.stakes s
            JOIN public.profiles p ON p.id = s.user_id
            WHERE s.started_at::date < v_day
              AND (s.last_payout_date IS NULL OR s.last_payout_date < v_day)
            ORDER BY s.user_id, s.started_at
        LOOP
            -- a new member: put the last one's reinvested payouts into one new part
            IF v_user IS DISTINCT FROM r.user_id THEN
                IF v_user IS NOT NULL THEN
                    PERFORM public.auto_reinvest_flush(v_user, v_sum, v_base);
                END IF;
                v_user := r.user_id;
                v_sum := 0;
            END IF;

            v_amt := round(r.principal * v_rate, 8);

            IF v_amt > 0 THEN
                v_count := v_count + 1;
                v_total := v_total + v_amt;

                INSERT INTO public.yield_distributions (batch_id, user_id, stake_id, payout_date, eligible_principal, rate, amount, auto_reinvested)
                VALUES (v_batch_id, r.user_id, r.stake_id, v_day, r.principal, v_rate, v_amt, r.auto);

                IF r.auto THEN
                    v_auto := v_auto + 1;
                    -- earned, but not paid out to the balance: it joins a new principal part once all of the member's parts are done
                    UPDATE public.wallets
                    SET total_returns = total_returns + v_amt, updated_at = now()
                    WHERE user_id = r.user_id
                    RETURNING usdt_balance INTO v_base;

                    INSERT INTO public.wallet_ledger (reference, user_id, entry_type, source, direction, amount, balance_before, balance_after, stake_id, description)
                    VALUES ('MF-YLD-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 12)), r.user_id, 'daily_yield', 'returns', 'in', v_amt,
                            v_base + v_sum, v_base + v_sum + v_amt, r.stake_id, 'Daily return for ' || v_day);
                    v_sum := v_sum + v_amt;
                ELSE
                    UPDATE public.wallets
                    SET returns_balance = returns_balance + v_amt, total_returns = total_returns + v_amt, updated_at = now()
                    WHERE user_id = r.user_id
                    RETURNING usdt_balance - v_amt, usdt_balance INTO v_before, v_after;

                    INSERT INTO public.wallet_ledger (reference, user_id, entry_type, source, direction, amount, balance_before, balance_after, stake_id, description)
                    VALUES ('MF-YLD-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 12)), r.user_id, 'daily_yield', 'returns', 'in', v_amt,
                            v_before, v_after, r.stake_id, 'Daily return for ' || v_day);
                END IF;
            END IF;

            UPDATE public.stakes
            SET earned_total = earned_total + GREATEST(v_amt, 0), last_payout_date = v_day, updated_at = now()
            WHERE id = r.stake_id;
        END LOOP;

        IF v_user IS NOT NULL THEN
            PERFORM public.auto_reinvest_flush(v_user, v_sum, v_base);
        END IF;
    END LOOP;

    UPDATE public.distribution_batches
    SET status = 'completed', payouts_count = v_count, total_paid = v_total, auto_reinvested_count = v_auto,
        days_paid = v_days, finished_at = now()
    WHERE id = v_batch_id;

    RETURN jsonb_build_object(
        'status', 'success', 'run_id', v_batch_id, 'date', v_target, 'days_paid', v_days,
        'payouts', v_count, 'total_paid', v_total, 'auto_reinvested', v_auto, 'rate', v_rate
    );
END;
$$;

CREATE FUNCTION public.stakes_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Principal parts cannot be deleted';
    END IF;
    IF NEW.user_id IS DISTINCT FROM OLD.user_id
       OR NEW.principal IS DISTINCT FROM OLD.principal
       OR NEW.source IS DISTINCT FROM OLD.source
       OR NEW.deposit_id IS DISTINCT FROM OLD.deposit_id
       OR NEW.started_at IS DISTINCT FROM OLD.started_at THEN
        RAISE EXCEPTION 'A principal part''s owner, amount, source and start are fixed';
    END IF;
    IF NEW.earned_total < OLD.earned_total THEN
        RAISE EXCEPTION 'What a principal part has paid can only grow';
    END IF;
    IF OLD.last_payout_date IS NOT NULL AND (NEW.last_payout_date IS NULL OR NEW.last_payout_date < OLD.last_payout_date) THEN
        RAISE EXCEPTION 'A principal part''s last payout day can only move forward';
    END IF;
    RETURN NEW;
END;
$$;

CREATE FUNCTION public.submit_appeal(p_user_id uuid, p_message text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
    v_s RECORD;
    v_id UUID;
BEGIN
    IF char_length(btrim(COALESCE(p_message, ''))) < 20 OR char_length(p_message) > 3000 THEN
        RAISE EXCEPTION 'An appeal is between 20 and 3,000 characters.';
    END IF;
    SELECT * INTO v_s FROM public.suspensions WHERE user_id = p_user_id AND lifted_at IS NULL ORDER BY created_at DESC LIMIT 1;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'No active suspension found.';
    END IF;
    IF EXISTS (SELECT 1 FROM public.appeals WHERE suspension_id = v_s.id) THEN
        RAISE EXCEPTION 'You have already appealed this suspension.';
    END IF;
    INSERT INTO public.appeals (suspension_id, user_id, message, status)
    VALUES (v_s.id, p_user_id, btrim(p_message), 'pending')
    RETURNING id INTO v_id;
    RETURN jsonb_build_object('status', 'submitted', 'appeal_id', v_id);
END;
$$;

CREATE FUNCTION public.wallet_ledger_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Ledger rows cannot be deleted';
    END IF;
    -- only how a row ended up (status, hash, fee, wording) may change; who, what and how much never
    IF (to_jsonb(NEW) - 'status' - 'tx_hash' - 'fee' - 'description' - 'meta')
       IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'tx_hash' - 'fee' - 'description' - 'meta') THEN
        RAISE EXCEPTION 'A ledger row''s owner, amount and reference are fixed';
    END IF;
    RETURN NEW;
END;
$$;


-- ==========================================================================================================
-- 5. TRIGGERS (append-only ledger, protected principal parts, updated_at, disposable-email block)
-- ==========================================================================================================

CREATE TRIGGER audit_logs_append_only BEFORE DELETE OR UPDATE ON public.audit_logs FOR EACH ROW EXECUTE FUNCTION public.append_only();

CREATE TRIGGER referral_earnings_append_only BEFORE DELETE OR UPDATE ON public.referral_earnings FOR EACH ROW EXECUTE FUNCTION public.append_only();

CREATE TRIGGER stakes_guard BEFORE DELETE OR UPDATE ON public.stakes FOR EACH ROW EXECUTE FUNCTION public.stakes_guard();

CREATE TRIGGER wallet_ledger_guard BEFORE DELETE OR UPDATE ON public.wallet_ledger FOR EACH ROW EXECUTE FUNCTION public.wallet_ledger_guard();

CREATE TRIGGER wallet_ledger_no_truncate BEFORE TRUNCATE ON public.wallet_ledger FOR EACH STATEMENT EXECUTE FUNCTION public.forbid_truncate();

CREATE TRIGGER yield_distributions_append_only BEFORE DELETE OR UPDATE ON public.yield_distributions FOR EACH ROW EXECUTE FUNCTION public.append_only();


CREATE TRIGGER profiles_set_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER block_disposable_signup BEFORE INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.block_disposable_signup();


-- ==========================================================================================================
-- 6. ROW LEVEL SECURITY (on for every table; the browser has no table rights at all, these are a second lock)
-- ==========================================================================================================

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.appeals ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.deposits ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.disposable_email_domains ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.distribution_batches ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.otp_attempts ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.referral_earnings ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.referral_levels ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.stakes ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.suspensions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.wallet_ledger ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.withdrawals ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.yield_distributions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin view audit logs" ON public.audit_logs FOR SELECT USING (public.is_admin());

CREATE POLICY "Admin view batches" ON public.distribution_batches FOR SELECT USING (public.is_admin());

CREATE POLICY "Admin view payment events" ON public.payment_events FOR SELECT USING (public.is_admin());

CREATE POLICY "Public read app_settings" ON public.app_settings FOR SELECT USING (true);

CREATE POLICY "Public read disposable_domains" ON public.disposable_email_domains FOR SELECT USING (true);

CREATE POLICY "Public read referral_levels" ON public.referral_levels FOR SELECT USING (true);

CREATE POLICY "Users insert own appeals" ON public.appeals FOR INSERT WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE USING ((auth.uid() = id)) WITH CHECK ((auth.uid() = id));

CREATE POLICY "Users view own appeals" ON public.appeals FOR SELECT USING (((auth.uid() = user_id) OR public.is_admin()));

CREATE POLICY "Users view own deposits" ON public.deposits FOR SELECT USING (((auth.uid() = user_id) OR public.is_admin()));

CREATE POLICY "Users view own ledger" ON public.wallet_ledger FOR SELECT USING (((auth.uid() = user_id) OR public.is_admin()));

CREATE POLICY "Users view own profile" ON public.profiles FOR SELECT USING (((auth.uid() = id) OR public.is_admin()));

CREATE POLICY "Users view own referral earnings" ON public.referral_earnings FOR SELECT USING (((auth.uid() = earner_id) OR public.is_admin()));

CREATE POLICY "Users view own stakes" ON public.stakes FOR SELECT USING (((auth.uid() = user_id) OR public.is_admin()));

CREATE POLICY "Users view own suspensions" ON public.suspensions FOR SELECT USING (((auth.uid() = user_id) OR public.is_admin()));

CREATE POLICY "Users view own wallet" ON public.wallets FOR SELECT USING (((auth.uid() = user_id) OR public.is_admin()));

CREATE POLICY "Users view own withdrawals" ON public.withdrawals FOR SELECT USING (((auth.uid() = user_id) OR public.is_admin()));

CREATE POLICY "Users view own yields" ON public.yield_distributions FOR SELECT USING (((auth.uid() = user_id) OR public.is_admin()));


-- row-level-security policies call this for the signed-in role
-- (granted in section 7)


-- ==============================================================================================================
-- 7. ACCESS: the browser (anon / authenticated) gets no table rights and no function rights. Only the backend's service role does.
--    Every money rule runs inside the functions above, called by the backend; nothing can be moved from a browser.
-- ==============================================================================================================
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT p.oid::regprocedure AS sig
        FROM pg_proc p
        WHERE p.pronamespace = 'public'::regnamespace AND p.prokind = 'f'
          AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
    LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
    END LOOP;
END $$;
-- the row-level-security policies call this one for the signed-in role
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- Anything created in this schema from now on starts closed to the browser roles (Supabase's default would hand it to them).
-- Wrapped so a missing right never stops the script.
DO $$
DECLARE
    owner_role TEXT;
BEGIN
    FOREACH owner_role IN ARRAY ARRAY['postgres', 'supabase_admin'] LOOP
        BEGIN
            EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated', owner_role);
            EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated', owner_role);
            EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated', owner_role);
            EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC', owner_role);
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'default privileges for % left as they were: %', owner_role, SQLERRM;
        END;
    END LOOP;
END $$;

-- ==============================================================================================================
-- 8. STARTING DATA
-- ==============================================================================================================
-- The platform's rules (an admin changes them later from the Settings page)
INSERT INTO public.app_settings (id, min_deposit_usdt, max_deposit_usdt, min_withdraw_usdt, min_reinvest_usdt, daily_rate,
                                 deposits_enabled, withdrawals_enabled, reinvest_enabled, maintenance_mode)
VALUES (1, 30.00, 100000.00, 30.00, 0.20, 0.005000, TRUE, TRUE, TRUE, FALSE);

-- What a deposit pays up the sponsor chain: tier 1 is the direct sponsor
INSERT INTO public.referral_levels (level, percentage) VALUES (1, 0.1000), (2, 0.0500), (3, 0.0300), (4, 0.0200), (5, 0.0100);

-- Throw-away email providers that cannot sign up
INSERT INTO public.disposable_email_domains (domain) VALUES
    ('10minutemail.com'), ('10minutemail.net'), ('1secmail.com'), ('1secmail.net'),
    ('1secmail.org'), ('anonbox.net'), ('armyspy.com'), ('burnermail.io'),
    ('cuvox.de'), ('dayrep.com'), ('discard.email'), ('dispostable.com'),
    ('dropmail.me'), ('einrot.com'), ('emailfake.com'), ('emailondeck.com'),
    ('fakeinbox.com'), ('fakemail.net'), ('getnada.com'), ('gettempmail.com'),
    ('grr.la'), ('guerrillamail.com'), ('guerrillamail.net'), ('guerrillamail.org'),
    ('guerrillamailblock.com'), ('gustr.com'), ('harakirimail.com'), ('inboxkitten.com'),
    ('jetable.org'), ('jourrapide.com'), ('mail.tm'), ('mailcatch.com'),
    ('maildrop.cc'), ('mailforspam.com'), ('mailinator.com'), ('mailnesia.com'),
    ('mailpoof.com'), ('mintemail.com'), ('moakt.com'), ('mohmal.com'),
    ('mytemp.email'), ('nada.email'), ('rhyta.com'), ('sharklasers.com'),
    ('spam4.me'), ('spambox.us'), ('spamgourmet.com'), ('superrito.com'),
    ('teleworm.us'), ('temp-mail.io'), ('temp-mail.org'), ('tempail.com'),
    ('tempinbox.com'), ('tempm.com'), ('tempmail.com'), ('tempmail.net'),
    ('tempr.email'), ('throwawaymail.com'), ('tmpmail.net'), ('tmpmail.org'),
    ('trashmail.com'), ('trashmail.de'), ('trashmail.net'), ('yopmail.com'),
    ('yopmail.fr'), ('yopmail.net');

-- ==============================================================================================================
-- 9. STORAGE: the "avatars" bucket for profile pictures
--    Public to read (the picture is shown on the site), 2 MB, webp / jpeg / png only. Each member can list, add, replace and
--    delete files only inside their own folder (the folder is their user id); nobody else's.
-- ==============================================================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatars', 'avatars', TRUE, 2097152, ARRAY['image/webp', 'image/jpeg', 'image/png']);

CREATE POLICY "avatars: list own files" ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
CREATE POLICY "avatars: upload to own folder" ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
CREATE POLICY "avatars: replace own files" ON storage.objects FOR UPDATE TO authenticated
    USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text)
    WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
CREATE POLICY "avatars: delete own files" ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
