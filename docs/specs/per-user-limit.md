# Spec: Foydalanuvchiga alohida kunlik limit (admin tomonidan)

## Maqsad
Admin har bir foydalanuvchiga alohida kunlik so'rov limitini belgilay olsin (ko'tarish/tushirish). Alohida belgilanmagan foydalanuvchilar uchun umumiy (`app_secrets.daily_limit`) default ishlaydi.

## Nega kerak
Hozir limit hammaga bitta umumiy qiymat. Ba'zi foydalanuvchilarga (faol o'quvchi, test, VIP) ko'proq, ba'zilariga (suiiste'mol qiluvchi) kamroq berish kerak bo'ladi. Bitta global qiymat bunga imkon bermaydi.

## Qamrov ICHIDA
- `users` jadvaliga `daily_limit` (nullable integer) ustun qo'shiladi. `null` = umumiy default'ga qaytadi.
- `chat` Edge Function: amaldagi limit = `users.daily_limit` agar mavjud bo'lsa, aks holda `app_secrets.daily_limit`.
- `admin` Edge Function `stats`: har foydalanuvchi qatorida `daily_limit` (override qiymati) qaytadi.
- `admin` Edge Function yangi action `set_user_limit`: `{ userId, limit }` — `limit` raqam bo'lsa o'rnatadi, `null`/bo'sh bo'lsa override'ni o'chiradi (umumiyga qaytadi).
- `admin.html`: foydalanuvchilar ro'yxatida har birining yonida tahrirlash maydoni (limit raqami) + saqlash. Bo'sh = default. Joriy amaldagi limit ko'rinadi.

## Qamrov TASHQARISIDA (bularni qilma!)
- **Foydalanuvchi o'zi limitini ko'rishi/o'zgartirishi** — yo'q, faqat admin. Foydalanuvchi faqat limit tugaganda xabar oladi (hozirgidek).
- **Vaqtinchalik (muddatli) limit** (masalan "3 kunga 100") — yo'q, doimiy qiymat. Keyingi versiya.
- **Limit tarixi/audit log** (kim qachon o'zgartirgan) — yo'q. Keyin.
- **Rejim bo'yicha alohida limit** (writing 5, speaking 10) — yo'q, umumiy kunlik son.
- **Global `daily_limit` ni olib tashlash** — yo'q, u default sifatida qoladi.

## Texnik
- Component: `admin.html` (user ro'yxati + per-user limit input)
- Edge Function: `chat` (limit hisoblash), `admin` (`stats` select + yangi `set_user_limit` action)
- DB: `users` jadvaliga `daily_limit int null` ustun
- Migration: kerak — `alter table users add column daily_limit int` (nullable, default yo'q)
- Config: yangi sozlama yo'q (umumiy default app_secrets'da)
- Locale: UI o'zbekcha

## Qoidalar (EARS)
- QACHON foydalanuvchi xabar yuborsa
  AGAR `users.daily_limit` belgilangan bo'lsa (null emas)
  TIZIM o'sha qiymatni limit sifatida ishlatishi SHART
  AKS HOLDA `app_secrets.daily_limit` (umumiy) ni ishlatishi SHART.

- QACHON admin foydalanuvchiga limit raqam kiritib saqlasa
  TIZIM `users.daily_limit` ni shu qiymatga yangilashi SHART
  VA javobida boshqa foydalanuvchi maxfiy ma'lumotini qaytarMASLIGI SHART.

- QACHON admin limit maydonini bo'sh qoldirib saqlasa
  TIZIM `users.daily_limit` ni `null` qilishi SHART (umumiy default'ga qaytadi).

- AGAR admin auth muvaffaqiyatsiz bo'lsa
  TIZIM `set_user_limit` ni bajarMASLIGI SHART
  VA hech qanday ma'lumot qaytarMASLIGI SHART.

- AGAR kiritilgan limit manfiy yoki raqam bo'lmasa
  TIZIM uni rad etishi SHART (o'zgartirmaslik yoki 0 dan kichik bo'lmasin).

## Acceptance criteria (tugadi deganda)
- [ ] `users` jadvalida `daily_limit` (nullable) ustun bor
- [ ] Admin panelda har foydalanuvchi yonida limit input + saqlash bor
- [ ] Limit qo'yilgan foydalanuvchi o'sha songacha so'rov yubora oladi, oshsa bloklanadi
- [ ] Limit bo'sh foydalanuvchi umumiy default bilan ishlaydi
- [ ] Admin limitni ko'taradi → foydalanuvchi darhol ko'proq yubora oladi
- [ ] Admin limitni 0 qiladi → foydalanuvchi umuman yubora olmaydi
- [ ] Auth noto'g'ri bo'lsa `set_user_limit` ishlamaydi

## Test (MAJBURIY — admin huquqi + limit/pul)
- Foydalanuvchiga `daily_limit=2` qo'y → 3-so'rov bloklanishini tekshir
- Limitni 10 ga ko'tar → endi 3-so'rov o'tishini tekshir
- Limitni bo'sh qoldir (null) → umumiy default qo'llanishini tekshir
- `set_user_limit` ni noto'g'ri parol bilan chaqir → 401, o'zgarmasinmi
- Manfiy limit (`-5`) kiritilsa → rad etilsinmi
- Global default va per-user aralash: biriga override, biriga yo'q → har biri to'g'ri limitga bo'ysunsinmi
- Limit hisoblash sana bo'yicha — ertasi kuni nollanishini tekshir (mavjud xulq buzilmasin)
