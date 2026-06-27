# Spec: Profil sozlamalarini tahrirlash

## Maqsad
Foydalanuvchi onboarding'dan keyin ham ism, daraja va maqsadini (IELTS bo'lsa target band) o'zgartira olsin.

## Nega kerak
Hozir bu maydonlar faqat onboarding'da bir marta tanlanadi. Maqsad o'zgarsa (masalan IELTS'ga o'tsa) yoki daraja oshsa, foydalanuvchi localStorage'ni tozalamasdan o'zgartira olmaydi — bu jiddiy kamchilik.

## Qamrov ICHIDA
- Dashboard yuqori panelida ⚙️ tugma (🔑 yonida)
- Modal oyna: Ism (input), Daraja (A1-C2 select), Maqsad (select)
- Maqsad = IELTS bo'lsa — Target band selektori dinamik ko'rinadi
- Saqlangach: `user` yangilanadi, `saveUser()`, dashboard qayta render bo'ladi
- Maqsad IELTS'ga o'zgarsa va `user.ielts` bo'lmasa — default yaratiladi

## Qamrov TASHQARISIDA
- Profilni o'chirish / reset — keyingi versiya
- XP/lug'at/yutuqlarni tahrirlash — tegmaymiz
- Avatar/rasm — yo'q

## Texnik
- Component: `index.html`
- Yangi funksiya: `showSettingsModal()`
- O'zgaradi: `renderDashboard` (⚙️ tugma + handler)
- DB: yo'q (localStorage `user`)
- Locale: o'zbekcha

## Qoidalar (EARS)
- QACHON foydalanuvchi ⚙️ bosib maydonlarni o'zgartirib saqlasa
  TIZIM user obyektini yangilashi SHART
  VA dashboardni qayta render qilishi SHART.

- QACHON maqsad IELTS'ga o'zgartirilsa
  VA user.ielts mavjud bo'lmasa
  TIZIM { targetBand, scores:[] } yaratishi SHART.

- AGAR ism bo'sh qoldirilsa
  TIZIM saqlamasligi SHART
  VA xato toast ko'rsatishi SHART.

## Acceptance criteria
- [ ] Dashboard'da ⚙️ tugma bor, bosilsa modal ochiladi
- [ ] Ism/daraja/maqsad o'zgartirilib saqlanadi va darhol aks etadi
- [ ] Maqsad IELTS bo'lsa target band ko'rinadi va saqlanadi
- [ ] Bo'sh ism saqlanmaydi
- [ ] Mavjud XP/lug'at/streak buzilmaydi
