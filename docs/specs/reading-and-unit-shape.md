# O'qish vazifasi va unit tarkibi

## Muammo

Ikkita alohida kamchilik, lekin ildizi bitta \u2014 unit tarkibi.

**1. O'qish ko'nikmasi umuman yo'q edi.** `TASK_TYPES`: `translate`, `build`, `write`,
`listen`, `speak`. CEFR ning to'rt ko'nikmasidan **reading tushib qolgan**. Bu shunchaki
bo'shliq emas: o'qish \u2014 lug'atni kontekstda mustahkamlashning eng arzon yo'li
(audio yo'q, bitta AI chaqiruv, offline TTS talab qilmaydi).

**2. Unit tarkibi tarjimaga qulagan edi.** Tipik unit:
`[translate, build, listen, translate, build, listen]` \u2014 6 vazifadan 4 tasi
**diskret, o'zbekchadan inglizchaga o'girish**. Bu:

- "avval o'zbekcha o'ylab, keyin tarjima qilish" odatini mustahkamlaydi \u2014 ravonlikning
  asosiy dushmani;
- ma'noga yo'naltirilgan kirish (comprehensible input) bermaydi;
- ba'zi unitlarda erkin chiqish (write/speak) umuman bo'lmasdi.

## Yechim

### 1. `read` vazifa turi

`TASK_GUIDE.read` \u2014 5 banddan baholanadi, `listen` bilan bir xil tuzilishda, lekin
**matn yashirilmaydi**: `listen` matnni `[AUDIO]` teglari orasiga oladi, `read` esa
uni ko'rinadigan qoldiradi. Savollar ataylab har xil turdagi:

| Savol | Nimani sinaydi |
|---|---|
| 1 | umumiy mazmun (gist) |
| 2-3 | aniq faktlar (scanning) |
| 4 | so'zning **kontekstdagi** ma'nosi |
| 5 | mantiqiy xulosa (inference) |

4-savol muhim: u lug'aviy ta'rifni emas, **matndagi** ma'noni so'raydi. Tekshirish
promptida ham shu ta'kidlangan \u2014 aks holda AI lug'at ta'rifini to'g'ri deb qabul
qiladi va savol oddiy so'z-ma'no savoliga aylanadi.

Matn uzunligi darajaga bog'liq: A1-A2 \u2014 60-90 so'z, B1-B2 \u2014 100-140,
C1-C2 \u2014 150-200. Daraja allaqachon system promptda (`programContext`), shuning uchun
alohida parametr kerak emas.

### 2. Unit shabloni

```
1. read      \u2014 mavzuni kontekstda ko'rish
2. translate \u2014 forma ustida ishlash
3. build     \u2014 faol ishlatish
4. listen    \u2014 quloqqa singdirish
5. speak     \u2014 og'zaki chiqarish
6. write     \u2014 erkin produktiv
```

Ketma-ketlik pedagogik: **kirish \u2192 forma \u2192 ishlatish \u2192 kirish \u2192 chiqish \u2192 chiqish**.
Barcha 72 unit shu shablonga o'tkazildi.

Istisnolar (avvaldan bor cheklovlar saqlanadi):

| Unit | Shablon | Sabab |
|---|---|---|
| A1-01 | `read, translate, build, listen, translate, build` | `speak` ham, `write` ham hali erta |
| A1-02, A1-03 | `read, translate, build, listen, speak, translate` | `write` hali erta (`NO_WRITE_YET`) |
| qolgan 69 | `read, translate, build, listen, speak, write` | \u2014 |

### 3. Validator qoidasi

`build-curriculum.mjs` ga ikki yangi majburiy shart:

- **kamida bitta retseptiv** (`read` yoki `listen`);
- **kamida bitta erkin produktiv** (`write` yoki `speak`).

Ikkinchisi A1-01 uchun qo'llanmaydi \u2014 unda ikkalasi ham taqiqlangan.

Bu qoidalar shablonni emas, **natijani** himoya qiladi: kelajakda unit tarkibi qo'lda
o'zgartirilsa ham, u yana sof tarjima mashqiga aylanib ketolmaydi.

## Nima o'zgarmadi

- `TASKS_PER_UNIT` \u2014 hamon 6;
- `translate` va `build` hamma unitda majburiy;
- unit imtihoni (7-qadam) va uning 8 savoli;
- prompt shifti: eng uzun system prompt 2557 belgi, 20 000 chegarasidan uzoq.
