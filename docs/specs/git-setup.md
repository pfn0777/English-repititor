# Spec: Git setup + .gitignore

## Maqsad
Loyihani Git'ga push qilishdan oldin `.gitignore` yaratish va repozitoriyaga tushishi kerak bo'lmagan fayllarni (jumladan `CLAUDE.md`) kuzatuvdan chiqarish.

## Nega kerak
Hozir `CLAUDE.md` va `.claude/launch.json` Git index'ga qo'shilgan. `CLAUDE.md` — AI yo'riqnomasi (shaxsiy/lokal), `.claude/` esa lokal sozlamalar. Bular umumiy repozitoriyada turishi shart emas. `.gitignore` yo'qligi sababli kelajakda ham tasodifan lokal/maxfiy fayllar tushib ketishi mumkin.

## Qamrov ICHIDA
- `.gitignore` yaratish quyidagilarni e'tiborsiz qoldiradi:
  - `CLAUDE.md` (foydalanuvchi so'rovi)
  - `.claude/` (lokal agent/IDE sozlamalari, jumladan `settings.local.json`)
  - Maxfiy/muhit fayllari: `.env`, `.env.*`, `*.local`
  - OS axlati: `.DS_Store`, `Thumbs.db`, `desktop.ini`
  - Tahrir/bog'lov: `.vscode/`, `.idea/`, `node_modules/`, `*.log`
- Allaqachon stage qilingan `CLAUDE.md` va `.claude/` ni index'dan chiqarish (`git rm --cached`), fayllar diskda qoladi.

## Qamrov TASHQARISIDA (bularni qilma!)
- `docs/specs/` ni e'tiborsiz qoldirish — yo'q, ular foydali loyiha hujjati, repozitoriyada qoladi.
- `index.html` / `admin.html` ni ignor qilish — yo'q, bular asosiy ilova.
- Git remote qo'shish / push qilish — bu spec faqat tayyorgarlik; push'ni foydalanuvchi so'raganda qilamiz.
- Git history'dan eski commitlarni tozalash — kerak emas (hali commit yo'q, faqat stage).

## Texnik
- Yangi fayl: `.gitignore` (repo ildizida)
- O'zgaradi: Git index (`git rm --cached CLAUDE.md .claude`)
- DB: yo'q
- Locale: izohlar inglizcha, fayl nomlari inglizcha

## Qoidalar (EARS)
- QACHON loyiha Git'ga push qilinsa
  TIZIM `CLAUDE.md` va `.claude/` ni kuzatmasligi SHART
  VA bu fayllarni diskdan o'chirMASLIGI SHART.

- AGAR repozitoriyada `.env` yoki `*.local` fayl paydo bo'lsa
  TIZIM uni avtomatik e'tiborsiz qoldirishi SHART.

## Acceptance criteria
- [ ] `.gitignore` mavjud va yuqoridagi naqshlarni o'z ichiga oladi
- [ ] `git status` da `CLAUDE.md` va `.claude/launch.json` endi "staged" emas
- [ ] `CLAUDE.md` va `.claude/` fayllari diskda saqlanib qoladi
- [ ] `index.html`, `admin.html`, `docs/specs/` hali ham kuzatiladi

## Test (maxfiylik tekshiruvi)
- `git ls-files` da hech qanday maxfiy fayl (`.env`, kalit) yo'qligini tasdiqla
- Client fayllarida (`index.html`/`admin.html`) faqat public Supabase anon kalit borligini, service-role kalit yoki API kalit YO'Qligini tekshir
