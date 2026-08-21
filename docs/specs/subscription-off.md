# Obuna uzilgan holat

Ilova hozir **obunasiz** yetkaziladi: to'lov so'ralmaydi, paywall chizilmaydi,
trial bosqichlari yo'q, erkin rejimlar hech narsa ortida turmaydi.

Bu `docs/specs/subscription-stars.md` ni bekor qilmaydi — o'sha spec kuchida
qoladi va obuna qaytarilganda yana o'sha tartib ishlaydi.

## Nima uchun

Maqsad o'zgardi: hozir daromad emas, **foydalanuvchi oqimi va fikr-mulohaza**
kerak. To'lov va kvota qulfi — kirishdagi ikkita to'siq; ular olib tashlanadi.
Mahsulot yetarlicha sayqallangach, obuna masalasi qaytadan ko'riladi.

## Nima o'zgardi

| | Obuna yoqilganda | Hozir (uzilgan) |
|---|---|---|
| Huquq (`entitlement`) | `trial` → `free` → `active` | hamma `active` |
| Kunlik AI chaqiruvi | 40 / 5 / 60 | hammaga **40** (`LIMIT_OPEN`) |
| Kunlik vazifa normasi | 3 / 1 / 5 | hammaga **5** |
| Erkin rejimlar | dars + 1 vazifa + obuna ortida | ochiq |
| Paywall / trial sanog'i | chiziladi | chizilmaydi |
| `billing` → `invoice` | havola beradi | `409 sub_off` |

**O'zgarmaganlar:** `GLOBAL_DAILY_LIMIT = 2000` (kunlik umumiy shift),
`daily_limit` admin override, kunlik vazifa normasi tushunchasining o'zi,
`tg-webhook` (kelgan to'lovni baribir qabul qiladi), admin `grant_sub`.

## Bayroqlar — uchta fayl, birga o'zgaradi

| Fayl | Bayroq |
|---|---|
| `index.html` §1c | `SUBSCRIPTION_ENABLED`, `FREE_MODES_GATED` (`let` — testlar almashtiradi) |
| `supabase/functions/chat/index.ts` | `SUBSCRIPTION_ENABLED`, `LIMIT_OPEN` |
| `supabase/functions/billing/index.ts` | `SUBSCRIPTION_ENABLED` |

Klient va server bir-biriga mos bo'lishi **shart**. Faqat klientda uzilsa —
foydalanuvchi ochiq tugmani bosib `429` oladi. Faqat serverda uzilsa —
odam hech kimga kerak bo'lmagan paywallni ko'rib turadi.

## Nima uchun bayroq, o'chirish emas

`entitlementOf()`, `limitFor()`, `tasksFor()`, `trialDaysLeft()` — sof
funksiyalar, ular **o'zgartirilmagan** va testlari o'z joyida. Bayroq faqat
`myEntitlement()`, `myTrialDaysLeft()`, `freeModeGate()` va serverdagi ikki
qatorga ta'sir qiladi. Qaytarish narxi — uch bayroq va bitta deploy.

`payments` jadvali, `tg-webhook`, admin paneldagi obuna ustuni ham joyida
qoladi: uzilgunga qadar kelgan to'lovlar tarixi yo'qolmasligi kerak.

## Qaytarish tartibi

1. Uchala faylda `SUBSCRIPTION_ENABLED = true` (klientda `FREE_MODES_GATED` ham).
2. `node scripts/test-program.mjs` — 27-bo'lim ataylab yiqiladi, uni ham
   yangi holatga moslash kerak.
3. `chat` va `billing` ni qayta deploy qilish (`verify_jwt` odatdagidek).
4. Klientni push qilish (Vercel `main` dan yig'adi).

## Testlar

`scripts/test-program.mjs`:

- Suite bayroqlar **yoqilgan** holatda yuradi (`api.setFlags(true, true)`) —
  obuna mantiqi uzilgan bo'lsa ham buzilmaganini kafolatlaydi.
- **27-bo'lim** bayroqlarni haqiqiy qiymatiga qaytaradi va yetkazilayotgan
  holatni tekshiradi: hamma `active`, kuniga 5 vazifa, qulf yo'q, paywall yo'q,
  lekin kunlik norma va sof funksiyalar joyida.

## Ochiq savol — 51-chi foydalanuvchi

40 chaqiruv × ~50 faol odam = `GLOBAL_DAILY_LIMIT`. Shift to'lganda `chat`
hammaga `429 busy` qaytaradi — birinchi kelgan yeydi. Ya'ni kechqurun kirgan
doimiy o'quvchi ertalabki tasodifiy odam tufayli qolishi mumkin.

Hozir bu nazariy: faol foydalanuvchi 50 dan ancha kam. Lekin **ogohlantirish
mexanizmi yo'q** — shift to'lganini faqat shikoyatdan bilib olasiz. Kelgusi
qadam: shift 80% ga yetganda log yoki xabar.
