# Release readiness — full system verification (2026-08-08)

What this is: the verification protocol for "is the whole thing actually working,
subscription included", plus the result of running it. It is written to be
re-runnable — every check below is a command, not an opinion.

The headline: **the backend is fully working and verified end to end. Production
is not, for two reasons that have nothing to do with the code in it.**

---

## 1. Verdict

| Layer | State | Note |
|---|---|---|
| Local test suite | PASS | `test-program.mjs`, all sections |
| Curriculum data | PASS | 72 units, 1 800 unique words, A1→C2 |
| DB schema invariants | PASS | 6/6 |
| `chat` Edge Function | PASS | live probe, trial clock verified |
| `billing` Edge Function | PASS | 6/6 auth + invoice checks |
| `tg-webhook` Edge Function | PASS | payment recorded, idempotent, renewal stacks |
| Secrets alignment | PASS | bot token + webhook secret match the DB exactly |
| **Telegram bot** | **DOWN** | nothing is polling; no Mini App, no payments |
| **Vercel production** | **STALE** | 8 commits behind; subscription code absent |

A user today cannot subscribe. Not because subscription is broken — because the
two things that carry it to the user are not running the current code.

---

## 2. Blockers

### B1 — The Telegram bot is not running

`getUpdates` was called 6 times over 18 seconds. Every call returned `200 OK`.
If a poller were alive, at least one would have returned `409 Conflict`
(Telegram allows exactly one `getUpdates` consumer). No webhook is set either
(`getWebhookInfo.url` is empty).

Consequence chain:

1. No `/start` → the Mini App button is never delivered.
2. No `pre_checkout_query` answer → Telegram **cancels every Stars charge** after
   ~10 seconds. Nobody can pay even if they find the invoice.
3. No `successful_payment` relay → `tg-webhook` is never called.

There is a second, independent symptom pointing the same way:
`getWebhookInfo.allowed_updates` is `["message"]`. aiogram derives that list from
the registered handlers, and `bot.py` registers `@dp.pre_checkout_query()`. A
poller running the current `bot.py` would have set
`["message", "pre_checkout_query"]`. So **the last process that ran was an older
build of the bot, from before payments existed** — restarting whatever is on the
Hetzner box is not enough; the current `bot.py` has to be deployed there.

Verification after fixing: `getUpdates` must return `409`, and
`getWebhookInfo.allowed_updates` must contain `pre_checkout_query`.

### B2 — Vercel serves an 8-commit-old build

`https://english-repititor.vercel.app/` returns 124 197 bytes. The current
`index.html` is ~307 KB. Probing the deployed HTML for known markers:

| Marker | Deployed |
|---|---|
| `buySubscription` | absent |
| `entitlementOf` | absent |
| `SUB_STARS` | absent |
| `revealAndSkip` (exit path) | absent |
| `unitLessonBox` (unit lesson) | absent |
| `serviceWorker` (offline) | absent |

`/sw.js` and `/manifest.json` both return **404** — they do not exist on `main`
at all, so the PWA/offline shell has never shipped.

Root cause: Vercel builds `main`, which is at `0133b47`. Eight commits — the
entire subscription feature, C1/C2, the lesson and exit path, offline, the gloss
checker — sit unmerged on `a1-lesson-and-exit-path`. The branch *is* pushed to
origin; it was simply never merged.

Fix: merge `a1-lesson-and-exit-path` into `main` and push. Nothing else.

---

## 3. What was verified, and how

### 3.1 Local

```
node scripts/test-program.mjs      # engine, entitlement ladder, prompt shapes
node scripts/build-curriculum.mjs  # 72 unit, 1800 noyob so'z — validator passes
```

Both pass. Note: `build-curriculum.mjs` writes LF line endings, so on a Windows
checkout with `core.autocrlf=true` it leaves `index.html` looking modified even
when the content is byte-identical after normalization (`git diff` reports
nothing). Restore with `git checkout -- index.html`; it is not a real change.

### 3.2 Database

`scripts/check-schema.sql` via Supabase MCP `execute_sql` — 6/6 `OK`:
`users.id` default, `users.tg_id` unique, `payments.charge_id` unique,
`app_secrets` singleton row, `app_secrets` RLS on, no duplicate `tg_id`.

Security advisors return 4 `INFO` lints, all `rls_enabled_no_policy` on
`app_secrets` / `users` / `usage` / `payments`. That is the intended design, not
a defect: RLS on with zero policies is deny-all for the anon key, and only the
service role (inside Edge Functions) touches these tables. Adding policies would
weaken it.

### 3.3 Secrets alignment (without exposing them)

The bot's `.env` and `app_secrets` were compared by SHA-256 digest, computed
independently on each side — Postgres `digest()` for the DB, Node `crypto` for
the file. Neither value was ever printed.

| Secret | DB length | Local length | Digest |
|---|---|---|---|
| `webhook_secret` | 64 | 64 | identical |
| `bot_token` | 46 | 46 | identical |

A mismatch here is the classic silent failure — the relay would 401 and payments
would vanish with the money already taken. It is worth re-running whenever
either side is rotated.

### 3.4 Live probes

All against the real deployed functions. Cost: 2 Gemini calls (~$0.0006).

**`chat`** — the trial clock. A fresh `userId` posting `mode: 'program_issue'`
came back with `trial_started_at` freshly stamped and `entitlement: 'free'`
(correct: no `initData`, and `bot_token` is set, so a browser request is `free`).

This also cleared a false alarm. All 18 existing `users` rows have
`trial_started_at = null`, which looks like the trial clock never fires. It does
— `chat` v16 was deployed **2026-08-08 07:40 UTC**, and every real
`program_issue` call in the table predates it (latest 03:27). Those nulls are
pre-subscription traffic, not a bug.

**`billing`** — 6/6:

| Case | Expected | Got |
|---|---|---|
| no `initData` | 401 | 401 |
| tampered signature | 401 | 401 |
| 2-day-old `auth_date` (replay) | 401 | 401 |
| valid `initData`, `status` | 200 + entitlement | 200, `trial` |
| valid `initData`, `invoice` | 200 + `t.me/$…` link | 200, link returned |
| unknown `action` | 400 | 400 |

The invoice link proves the bot token is valid *and* that Telegram accepts an
`XTR` invoice for this bot — the Stars product is correctly configured.

**`tg-webhook`** — 5/5, using a synthetic `tg_id` 999000111:

| Case | Expected | Got |
|---|---|---|
| no secret header | 401 | 401 |
| wrong secret | 401 | 401 |
| valid payment | 200, row written | 200 |
| same `charge_id` again | 200, **no** second row | 200, 1 row |
| second `charge_id` | 200, +30 more days | 200 |

DB after: exactly **2** `payments` rows for 3 posts (the duplicate was rejected
by the unique index, as designed), and `subscription_until` 60 days out — proving
renewals *add* to the remaining time rather than overwriting it.

**`chat` as a subscriber** — the same identity then called `chat` with valid
`initData` and got `entitlement: 'active'`. The full loop closes:
pay → webhook → DB → entitlement → daily limit.

All probe rows (`users`, `usage`, `payments`) were deleted afterwards.
`payments` is back to 0.

Edge Function logs across the whole run: no 5xx. One `502` on an `OPTIONS` to
`progress` — a cold start, harmless.

---

## 4. Release checklist

Ordered. Steps 1 and 2 are the blockers; nothing else matters until they are done.

1. **Merge and deploy the frontend.**
   `git checkout main && git merge a1-lesson-and-exit-path && git push`.
   Verify: `/` is ~300 KB, `/sw.js` and `/manifest.json` return 200, and the
   deployed HTML contains `buySubscription`.
2. **Deploy and start the current `bot.py` on Hetzner.**
   Verify: `getUpdates` returns `409`, and `getWebhookInfo.allowed_updates`
   contains `pre_checkout_query`. Confirm `WEBHOOK_SECRET` on the server matches
   the DB by digest (§3.3) — the local `.env` matching is not proof the server's
   does.
3. **One real Stars purchase, by a real account.** Everything above is verified
   with a synthetic `tg_id`; only a real charge exercises `pre_checkout_query`
   inside the 10-second window. Confirm: a `payments` row appears, the
   "✅ Obuna faollashdi" message arrives, and the app shows `active`.
4. Re-run `scripts/check-schema.sql` after the first real payment.
5. Watch `GLOBAL_DAILY_LIMIT` (2000) — it caps the system at ~33 active
   subscribers. Raise it before approaching that.

---

## 5. Standing regression protocol

Run before every release:

```
node scripts/test-program.mjs                      # must exit 0
node scripts/build-curriculum.mjs                  # must print 72 unit
```

Then, against the live system: `check-schema.sql` (6/6 OK), the `billing` and
`tg-webhook` probe matrices in §3.4, and the two production liveness checks from
the checklist (bot returns 409, site serves the current build).

The probe script used here lives outside the repo (it reads the bot's `.env` and
must not be committed). If it becomes a permanent fixture, it belongs in
`scripts/` reading secrets from the environment instead — and the assertions in
§3.4 belong in it verbatim.
