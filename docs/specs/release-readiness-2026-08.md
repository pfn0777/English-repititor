# Release readiness — full system verification (2026-08-08)

What this is: the verification protocol for "is the whole thing actually working,
subscription included", plus the result of running it. It is written to be
re-runnable — every check below is a command, not an opinion.

The headline: **the backend was already working and is now verified end to end.
Two delivery-layer blockers were found and both have been fixed.**

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
| Telegram bot | FIXED | ran a pre-payments build; current `bot.py` deployed |
| Vercel production | FIXED | was 8 commits behind; `main` merged and shipped |

Before the fixes, a user could not subscribe — not because subscription was
broken, but because neither delivery surface was running the code that contains
it.

---

## 2. Blockers found (both resolved)

### B1 — The Hetzner bot ran a pre-payments build

**First diagnosis was wrong, and the method is worth recording so it is not
repeated.** `getUpdates` was called 6 times over 18 seconds and every call
returned `200 OK`, which was read as "nothing is polling, the bot is down". That
inference is invalid. Telegram gives the **newest** `getUpdates` request priority
and returns `409` to the older in-flight poll — so a probe can keep winning
against a perfectly healthy bot. A later paired probe caught the conflict on the
second call, and the container logs showed it had been up for four weeks.

> **The asymmetry: a `409` proves the bot is alive. A `200` proves nothing.**
> To test liveness, check the container/process, not the API.

The real defect, found by looking at the server: `/opt/english-bot/bot.py` was
the **28 June** build — 4 152 bytes, **zero** payment handlers — and
`/opt/english-bot/.env` contained only `BOT_TOKEN`, no `WEBHOOK_SECRET`.
`requirements.txt` was also missing `aiohttp`, which the relay needs.

Consequences, which were real regardless of the misdiagnosis:

1. No `pre_checkout_query` handler → Telegram **cancels every Stars charge**
   after ~10 seconds.
2. No `successful_payment` relay → `tg-webhook` never called, payment lost.

The corroborating signal was `getWebhookInfo.allowed_updates == ["message"]`.
aiogram derives that list from the registered handlers, so a current build would
have registered `pre_checkout_query` too. **That, not the `getUpdates` status,
was the reliable tell.**

Fix applied: current `bot.py`, `config.py`, `requirements.txt`, `Dockerfile`,
`docker-compose.yml` copied to `/opt/english-bot`; `WEBHOOK_SECRET` appended to
the server `.env` and confirmed against the DB by SHA-256 (§3.3);
`docker compose up -d --build`.

Verified after: container `Up`, `Start polling` logged, and
`getWebhookInfo.allowed_updates == ["message", "pre_checkout_query"]`.

### B2 — Vercel served an 8-commit-old build

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

Root cause: Vercel builds `main`, which was at `0133b47`. Eight commits — the
entire subscription feature, C1/C2, the lesson and exit path, offline, the gloss
checker — sat unmerged on `a1-lesson-and-exit-path`. The branch *was* pushed to
origin; it was simply never merged.

Fix applied: `a1-lesson-and-exit-path` merged into `main` (fast-forward to
`cadde9c`) and pushed. Verified after: `/` serves 297 672 bytes, all six markers
present, `/sw.js` and `/manifest.json` return `200`.

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

Steps 1 and 2 were the blockers; both are **done**. Step 3 is the one thing that
still cannot be verified from a keyboard.

1. ~~**Merge and deploy the frontend.**~~ Done — `main` at `cadde9c`, pushed,
   Vercel rebuilt. Verified: 297 672 bytes, `buySubscription` present,
   `/sw.js` + `/manifest.json` `200`.
2. ~~**Deploy the current `bot.py` on Hetzner.**~~ Done — files copied,
   `WEBHOOK_SECRET` added to the server `.env` and digest-matched against the DB,
   container rebuilt. Verified: `Start polling` in the logs and
   `allowed_updates == ["message", "pre_checkout_query"]`.
3. **One real Stars purchase, by a real account.** ← still open. Everything
   above is verified with a synthetic `tg_id`; only a real charge exercises
   `pre_checkout_query` inside Telegram's 10-second window. Confirm: a `payments`
   row appears, the "✅ Obuna faollashdi" message arrives, and the app shows
   `active`.
4. Re-run `scripts/check-schema.sql` after the first real payment.
5. Watch `GLOBAL_DAILY_LIMIT` (2000) — it caps the system at ~33 active
   subscribers. Raise it before approaching that.

### Server facts worth keeping

The Hetzner box (`178.104.103.113`, reachable as `root` with the local SSH key)
also hosts unrelated containers — `mazzago-*` and a `telegram-bot-api` instance.
`deploy.sh` expects `rsync`; `scp` of the six tracked files plus
`docker compose up -d --build` does the same job from a Windows checkout.
The server `.env` is deliberately **not** synced by `deploy.sh` — it must be
edited in place, which is exactly how `WEBHOOK_SECRET` came to be missing.

---

## 5. Standing regression protocol

Run before every release:

```
node scripts/test-program.mjs                      # must exit 0
node scripts/build-curriculum.mjs                  # must print 72 unit
```

Then, against the live system: `check-schema.sql` (6/6 OK), the `billing` and
`tg-webhook` probe matrices in §3.4, and two production checks:

- **Site**: `/` is ~300 KB and contains `buySubscription`; `/sw.js` returns 200.
- **Bot**: `getWebhookInfo.allowed_updates` contains `pre_checkout_query`, and
  the container is `Up` (`docker compose ps`). Do **not** use `getUpdates` as a
  liveness test — see §2/B1; it steals the bot's poll and its `200` means
  nothing.

The probe script used here lives outside the repo (it reads the bot's `.env` and
must not be committed). If it becomes a permanent fixture, it belongs in
`scripts/` reading secrets from the environment instead — and the assertions in
§3.4 belong in it verbatim.
