-- Schema health check for the english-repititor project (wbcwavqbxjflgtxepdmf).
--
-- Why a .sql file and not a .mjs script: this repo has no package manager and no
-- node_modules, and the service-role key never leaves the server, so a local
-- script cannot reach the database. pg_indexes is also invisible to PostgREST.
-- Run this through the Supabase SQL editor or the Supabase MCP execute_sql.
--
-- Every row must read ok = true. A false row is a real defect: each of these
-- invariants is something an Edge Function silently depends on.
--
-- Watch out: uniqueness in this schema is enforced by PARTIAL UNIQUE INDEXES,
-- which do NOT appear in pg_constraint. Checking pg_constraint alone reports a
-- missing constraint that is in fact present (that mistake was made once).

with checks as (
  select
    'users.id has a uuid default' as check_name,
    'tg-webhook inserts a users row without id when someone pays before opening the Mini App' as why,
    exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'users'
        and column_name = 'id' and column_default is not null
    ) as ok

  union all select
    'users.tg_id is unique',
    'all three Edge Functions do .eq(tg_id).maybeSingle(); duplicates break the trial and hide subscriptions',
    exists (
      select 1 from pg_indexes
      where schemaname = 'public' and tablename = 'users'
        and indexdef like 'CREATE UNIQUE INDEX%(tg_id)%'
    )

  union all select
    'payments.charge_id is unique',
    'Telegram re-delivers successful_payment; without this a retry extends the subscription twice',
    exists (
      select 1 from pg_indexes
      where schemaname = 'public' and tablename = 'payments'
        and indexdef like 'CREATE UNIQUE INDEX%(charge_id)%'
    )

  union all select
    'app_secrets singleton row exists',
    'every function reads app_secrets where id = 1; a missing row disables the bot and the AI',
    exists (select 1 from public.app_secrets where id = 1)

  union all select
    'app_secrets RLS is enabled',
    'the row holds API keys, the admin password and the bot token; without RLS the anon key can read them',
    coalesce((
      select c.relrowsecurity from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = 'app_secrets'
    ), false)

  union all select
    'no duplicate tg_id rows',
    'belt and braces: proves the unique index is actually holding',
    not exists (
      select 1 from public.users
      where tg_id is not null
      group by tg_id having count(*) > 1
    )
)
select
  case when ok then 'OK  ' else 'FAIL' end as status,
  check_name,
  why
from checks
order by ok, check_name;
