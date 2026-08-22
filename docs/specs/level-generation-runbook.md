# Daraja generatsiyasi — runbook

Bitta daraja uchun offline vazifa kontentini tayyorlash tartibi. A1 pilotida
amalda bajarilgan va o'lchangan; sxema va sabablar
[offline-tasks.md](offline-tasks.md) da.

Bu hujjat **bajaruvchi uchun**: har qadam, har qaror qoidasi shu yerda.

## 0. Boshlashdan oldin

- Supabase loyihasi `ACTIVE_HEALTHY` bo'lsin (pauzada bo'lsa chaqiruvlar yiqiladi).
- O'zingga berilgan **uid** ni ishlat. `chat/index.ts` da `LIMIT_OPEN = 40` —
  odatiy uid bir darajani ham ko'tarmaydi. Berilgan uid'larda `daily_limit = 800`.
- Hech qachon `index.html`, `data/curriculum-*.json` yoki boshqa darajaning
  `data/tasks-*.json` fayliga tegma.

## 1. Generatsiya

```
node scripts/build-tasks.mjs <LEVEL> --uid=<sening-uid>
```

85 chaqiruv, ~10 daqiqa. Yiqilgan vazifalar **saqlanmaydi** — bu ataylab: yarim
data yo'qidan battar.

Yiqilganlar bo'lsa, **shu buyruqni qaytadan ishga tushir** — mavjudlari
o'tkazib yuboriladi, faqat bo'sh slotlar to'ldiriladi. 2-3 marta takrorla.

Bir vazifa **3 martadan ko'p ketma-ket yiqilsa** — bu tasodif emas, tizimli
muammo. To'xta va xato matnini o'qi: odatda unit lug'ati yoki grammatikasi
o'sha turga qiyin kelayotgan bo'ladi. Hisobotingda ayt, o'zboshimchalik bilan
promptni o'zgartirma — prompt uchala daraja uchun umumiy va boshqa agentlar
ham shu faylni ishlatyapti.

## 2. Shakl validatsiyasi (tekin, API'siz)

```
node scripts/validate-tasks.mjs <LEVEL>
```

`exit 0` va `OK — <LEVEL>: 12 unit` chiqmaguncha 1-qadamga qayt.

**Ogohlantirishlar** exit kodga ta'sir qilmaydi, lekin ikkitasi jiddiy:

- `matn N so'z, kutilgan X-Y` — matn qisqa bo'lsa undan 5 ta mustaqil savol
  chiqmaydi. Chegaradan **10 so'zdan ko'p** past bo'lsa o'sha vazifani bo'shatib
  qayta generatsiya qil (pastda "vazifani bo'shatish" ga qara). Chegaraga yaqin
  (5-8 so'z farq) bo'lsa qoldiraver.
- `N ta savolda answer = K` — chiqmasligi kerak, chunki 3-qadam uni tuzatadi.
  Chiqsa, 3-qadamni bajarganingni tekshir.

## 3. Javob indekslarini taqsimlash (tekin, API'siz)

```
node scripts/build-tasks.mjs <LEVEL> --normalize
```

To'g'ri javobni har bandda boshqa indeksga suradi. Qo'lda tuzatishdan **keyin
ham** qayta ishga tushir.

## 4. Mazmun tekshiruvi

```
node scripts/check-tasks.mjs <LEVEL> --uid=<sening-uid>
```

85 chaqiruv, ~10 daqiqa. Natija: `.task-check/report-<LEVEL>.md`.

Hisobot boshidagi `Tekshirildi: N / 85` ni o'qi. N < 85 bo'lsa chaqiruvlar
yiqilgan — tekshiruvni qaytadan ishga tushir, aks holda tekshirilmagan vazifa
"toza" deb o'ylanadi.

## 5. Triaj — ENG MUHIM QADAM

**Hisobotdagi bandni ko'r-ko'rona qabul qilma.** A1 da o'lchangan: tekshiruvchining
~15-25% belgilashi **yolg'on**. Misollar:

- `data` da `"a new chair"` turgan joyda `"an new umbrella"` xatosini "topgan";
- grammatik jihatdan buzilgan chalg'ituvchilarni ("She like…") "takroriy variant"
  deb belgilagan;
- taklif qilgan tuzatishning o'zi xato bo'lgan (`"This is an new umbrella"`).

Shuning uchun **har bir belgilangan bandni manba data bilan solishtir**:

```
PYTHONIOENCODING=utf-8 python -c "
import io,json
d=json.load(io.open('data/tasks-<lv>.json',encoding='utf-8'))
u=[x for x in d['units'] if x['id']=='<UNIT-ID>'][0]
t=[x for x in u['tasks'] if isinstance(x,dict) and x.get('type')=='<TUR>'][0]
print(json.dumps(t,ensure_ascii=False,indent=2))"
```

Ko'rganingdan keyin uchta qarordan biri:

| Qaror | Qachon |
|---|---|
| **Tuzat** | Da'vo data'da tasdiqlandi va bu haqiqiy xato |
| **Tashla** | Da'vo data'ga mos kelmayapti (tekshiruvchi o'ylab topgan) |
| **Qayta generatsiya** | Vazifa butunlay buzuq — bir-ikki band emas, umumiy tuzilishi |

## 6. Qo'lda tuzatish qoidalari

A1 da haqiqiy chiqqan xato sinflari — birinchi navbatda shularni qidir:

1. **uz ↔ en mos emas**: shaxs (`"She is drinking tea"` → `"U … ichyapman"`),
   son (`"Bu shahar katta"` → `"These cities are big"`), zamon.
2. **So'zma-so'z tarjima ma'noni buzgan**: `"Oshxonada stol bor"` →
   `"There is a kitchen table"` (bu "oshxona stoli" degani).
3. **Ma'no jihatdan bema'ni gap**: `"The cat is under the floor"`.
4. **Chalg'ituvchi to'g'ri javobning imlo xatosi bo'lib qolgan**:
   variantlar `['honzir', 'hozir', …]` — o'quvchi tasodifan noto'g'ri bosadi.
5. **`read` javob kaliti matnga zid**: matnda `"the apple is small"`, javob
   `"The apple is old"`. Yoki ikkita variant matnga mos keladi.
6. **Til/mamlakat nomi kichik harf bilan**: `"english"`.

Tuzatishda **plitkalar `en` bilan mos qolishi shart** — `tiles` `en` ning
so'zlari, tinish belgisisiz, takrorlanuvchi so'z ikki marta. `en` ni
o'zgartirsang `tiles` ni ham o'zgartir. `distractors` `tiles` bilan kesishmasin.
Tuzatgandan keyin 3- va 2-qadamni qayta bajar.

### `order` turi — alohida e'tibor

`order` **hikoya qilinadigan** unitga mos keladi. Grammatikasi *qarama-qarshilik*
bo'lgan unitda (masalan Present Simple vs Continuous) generator ketma-ketlik
bog'lovchilarini majburlab qo'yadi va bema'ni matn chiqadi — A1-12 da aynan
shunday bo'ldi:

> "First, I always eat breakfast at home every morning. Then, I am eating a
> delicious breakfast right now. After that, I usually drink coffee during the
> weekend."

Bunday holatda vazifani **qo'lda qayta yoz**. Tartibni ketma-ketlik bog'lovchisi
emas, **havola zanjiri** qulflasin:

- olmosh oldingi jumlada kiritilgan otga tayansin ("my sister" → keyingi jumlada "she");
- `"After breakfast…"` faqat nonushta tilga olingandan keyin kelsin;
- aniq vaqt belgilari o'sish tartibida (`seven o clock` → `at one` → `at ten`).

Yozgach o'zingni sina: **ikkita jumlani o'rin almashtirsang matn buziladimi?**
Buzilmasa — yagona yechim yo'q, qayta yoz.

Apostrof ehtiyotkorligi: inglizcha maydonda `o'clock` yozma — validator uni
o'zbekcha `o'` deb belgilamaydi, lekin xavfsizrog'i `o clock` yoki `10:00`.

## Vazifani bo'shatish (qayta generatsiya uchun)

```
PYTHONIOENCODING=utf-8 python -c "
import io,json
p='data/tasks-<lv>.json'; d=json.load(io.open(p,encoding='utf-8'))
u=[x for x in d['units'] if x['id']=='<UNIT-ID>'][0]
for i,t in enumerate(u['tasks']):
    if isinstance(t,dict) and t.get('type')=='<TUR>': u['tasks'][i]=None
io.open(p,'w',encoding='utf-8').write(json.dumps(d,ensure_ascii=False,indent=2))"
```

Daraja imtihoni uchun: `d['levelExam']=[]`.
Keyin 1-qadamni qayta ishga tushir.

## 7. Yakuniy tekshiruv

```
node scripts/build-tasks.mjs <LEVEL> --normalize
node scripts/validate-tasks.mjs <LEVEL>     # exit 0 bo'lishi SHART
node scripts/test-program.mjs               # HAMMASI OK bo'lishi SHART
node scripts/test-offline.mjs               # HAMMASI OK bo'lishi SHART
```

### Oltin javob darvozasi

`test-offline.mjs` ning 14b bo'limi har bir **to'liq** darajani boshidan oxirigacha
yurib chiqadi (12 unit × 7 qadam + daraja imtihoni = 85 qadam) va har vazifaga
data'dan olingan **to'g'ri javobni** beradi. Har qadam o'tishi SHART.

Bu `validate-tasks.mjs` topa olmaydigan narsalarni tutadi:

- `tiles` `en` ni yig'a olmasligi (shakl jihatdan to'g'ri, amalda ishlamaydi);
- `answer` indeksi tuzatishdan keyin siljib qolgani;
- tur moslashtirishning buzilishi;
- `order` pozitsiya hisobidagi xato.

Daraja to'liq bo'lmasa (bo'sh slot bor) — jimgina o'tkaziladi va sababi yoziladi.
Ya'ni **generatsiya tugamaguncha bu darvoza darajani tekshirmaydi**. Yakunda
`—  <LEVEL>: … o'tkazildi` qatori qolmasligi kerak; qolsa, daraja to'liq emas.

## Hisobotda nima bo'lishi kerak

1. Nechta chaqiruv ketdi, nechta vazifa birinchi urinishda o'tdi.
2. `check-tasks` nechta band belgiladi.
3. **Nechtasini o'zing tekshirding, nechtasi haqiqiy chiqdi, nechtasi shovqin.**
4. Nimani tuzatding — ro'yxat bilan, har biri uchun nima xato edi.
5. Qaysi vazifalarni butunlay qayta yozding va nega.
6. Tizimli muammo ko'rsang — qaysi tur/unitda va nima.

Raqamlarni **o'lchab** ayt, taxmin qilma. "Sifat yaxshi" degan gap hisobot emas.
