# GRIT DIGITAL CLUB - Dizajn sistem

Status: **PREDLOG v0.1.** Tokeni žive u `packages/design-tokens/tokens.json`, odakle se generišu CSS promenljive (admin, sajt), Tailwind preset i TS objekat za React Native. **Nijedna boja i nijedan razmak se ne pišu ručno u komponenti.**

## 0. Karakter

Logo GRIT je težak, iskošen, širok i "isečen" (rez kroz G i R). Odatle tri principa:

1. **Snaga kroz kontrast, ne kroz ukrase.** Crna površina, beli tekst, a narandžasta samo tamo gde je akcija ili stanje.
2. **Iskošenost kao potpis.** Dijagonalni rez (≈12°) koristi se štedljivo: na ivici membership kartice, aktivnom indikatoru taba i hero naslovima na sajtu. Nikad na svakoj komponenti.
3. **Industrijska preciznost.** Oštri uglovi (malo zaobljenje), tanke ivice umesto senki, monospace brojevi u statistici.

---

## 1. Boje

### ✔ Odluka: narandžasta = #E54E26

Izmereno iz zvaničnog fajla `gritgym.rs/…/grit-logo-orange.png` (sada u `assets/brand/`). Sajt koristi gotovo istu nijansu (#E04B28). #FF6A00 iz master prompta se ne koristi. Promo materijali (portret trenera, majice) koriste istu boju.

### Paleta (dark - podrazumevano)

| Token            | Vrednost               | Upotreba                                                                  |
| ---------------- | ---------------------- | ------------------------------------------------------------------------- |
| `bg.base`        | `#080808`              | Pozadina aplikacije                                                       |
| `bg.surface`     | `#111111`              | Kartice, liste                                                            |
| `bg.surface2`    | `#181818`              | Ugnježdene površine, input                                                |
| `bg.elevated`    | `#222222`              | Bottom sheet, modal, hover                                                |
| `border.subtle`  | `#2B2B2B`              | Ivice kartica, separatori                                                 |
| `border.strong`  | `#3A3A3A`              | Input fokus (neutralni), tabela header                                    |
| `text.primary`   | `#FFFFFF`              | Naslovi, primarni tekst                                                   |
| `text.secondary` | `#A0A0A0`              | Pomoćni tekst (7,2:1 na surface ✔)                                        |
| `text.muted`     | `#6E6E6E`              | Samo dekorativno ili disabled (ne za bitan tekst)                         |
| `accent.500`     | `#E54E26`              | Primarno dugme, aktivna navigacija, ključni indikator                     |
| `accent.400`     | `#EE6A45`              | Narandžasti **tekst** i linkovi na tamnoj podlozi (6,1:1 ✔), fokus prsten |
| `accent.600`     | `#C5401C`              | Pressed stanje                                                            |
| `accent.tint`    | `rgba(229,78,38,0.12)` | Pozadina selektovanog reda ili čipa                                       |
| `on.accent`      | `#080808`              | Tekst na narandžastom dugmetu (5,2:1 ✔ AA)                                |

**Tekst na narandžastom dugmetu:** beli tekst na #E54E26 daje 3,9:1, što **ne prolazi WCAG AA** za normalan tekst (4,5:1). Zato primarno dugme koristi **tamni tekst (#080808)**. Beli tekst je dozvoljen samo za ≥ 19 px bold (AA za veliki tekst), npr. CTA na sajtu.

### Semantičke boje statusa

Status se **nikad** ne prikazuje brend narandžastom, da se "upozorenje" ne bi pomešalo sa "akcijom".

| Status                            | Token            | Boja                | Uz boju uvek ide i |
| --------------------------------- | ---------------- | ------------------- | ------------------ |
| Active / Available / Granted      | `status.success` | `#2BD576`           | ikona ✓ + tekst    |
| Expiring Soon / Maintenance       | `status.warning` | `#F5B83D`           | ikona sata + tekst |
| Expired / Out of service / Denied | `status.danger`  | `#FF5A4E`           | ikona ✕ + tekst    |
| Paused                            | `status.neutral` | `#A0A0A0`           | ikona pauze        |
| Pending                           | `status.info`    | `#D9D9D9` (outline) | ikona tačkica      |

Boja nikad nije jedini nosilac informacije (zbog daltonizma).

### Light mode

Nije u MVP-u. Tokeni su semantički (`bg.surface`, a ne `gray900`), pa se light tema kasnije dodaje kao drugi set vrednosti bez izmene komponenti.

---

## 2. Tipografija

| Uloga                                  | Font                                             | Napomena                                                                                                                                    |
| -------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| UI i tekst (latinica, ćirilica)        | **Montserrat** (variable, Google Fonts, OFL)     | Brend font sa gritgym.rs. Ima ćirilicu i tabularne cifre (`tnum`)                                                                           |
| Display (naslovi, hero, imena trenera) | **Syncopate** 700, UPPERCASE                     | Brend font sa gritgym.rs, isti stil kao "YOUR GOALS" / "PERSONAL TRAINING". Ima samo latinicu (400/700), pa za ruski pada na Montserrat 800 |
| Arapski                                | **IBM Plex Sans Arabic**                         | Montserrat i Syncopate nemaju arapske glifove; uključuje se automatski kada je `ar` aktivan                                                 |
| Display podnaslov                      | Montserrat 300 _italic_, UPPERCASE, tracking +4% | Kao "PERSONAL & CROSSFIT COACH" ispod imena                                                                                                 |

Syncopate je vrlo širok, pa se koristi **samo za kratke naslove** (do oko 3 reči, max 2 reda na telefonu), nikad za tekst, dugmad ili tabele.

**Skala (mobile / web):**

| Token     | Veličina / visina reda | Težina                       | Upotreba                         |
| --------- | ---------------------- | ---------------------------- | -------------------------------- |
| `display` | 40/44 (web 64/68)      | 800, tracking −2%            | Hero, naslov kartice članstva    |
| `h1`      | 28/34                  | 700                          | Naslov ekrana                    |
| `h2`      | 22/28                  | 700                          | Sekcija                          |
| `h3`      | 18/24                  | 600                          | Naslov kartice                   |
| `body`    | 16/24                  | 400                          | Osnovni tekst (min. na mobilnom) |
| `body-sm` | 14/20                  | 400                          | Pomoćni tekst                    |
| `label`   | 13/16                  | 600, UPPERCASE, tracking +6% | Overline, labele statusa         |
| `stat`    | 32/36                  | 700, `tnum`                  | Brojevi u statistici             |

Naslovi su kratki i sportski ("TVOJ GRIT", "DANAS", "SLEDEĆI TRENING"). Uppercase se koristi samo za overline/label, a ne za cele rečenice. Za ruski i arapski se uppercase ne primenjuje (u arapskom ne postoji).

---

## 3. Razmaci, mreža, oblici

- **Spacing (4 pt):** `0, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64`. Mobilna ivica ekrana je 16, a razmak između kartica 12.
- **Radius:** `xs 2` (badge), `sm 4` (input, dugme), `md 8` (kartice), `lg 12` (bottom sheet gore), `full` (avatar). Kartice nisu "pilule".
- **Ivice umesto senki:** na tamnoj podlozi senka je nevidljiva, pa se elevacija gradi svetlijom površinom i `border.subtle`.
- **Touch target:** najmanje 44×44 (iOS) / 48×48 dp (Android). Primarno dugme na mobilnom ima visinu 52.
- **Admin mreža:** sidebar 240 px (sklopiv na 72), sadržaj max 1440, tabele full-width. Gustina "comfortable" (red 52 px) i "compact" (40 px).
- **Breakpointi (web):** `sm 640 · md 768 · lg 1024 · xl 1280`. Admin je optimizovan za ≥1024, a na tabletu (768) sidebar postaje drawer.

## 4. Ikonografija

**Lucide** (`lucide-react`, `lucide-react-native`), 1,75 px stroke, veličine 20 (UI) i 24 (navigacija). Bez emoji-ja. Smerne ikone (strelice, chevron, "nazad") se **ogledaju u RTL-u**, a logo, QR, play i grafikoni ne.

## 5. Pokret

| Token  | Trajanje | Krivulja                   | Upotreba                 |
| ------ | -------- | -------------------------- | ------------------------ |
| `fast` | 120 ms   | ease-out                   | hover, pressed, toggle   |
| `base` | 200 ms   | `cubic-bezier(.2,.8,.2,1)` | otvaranje sheet-a, toast |
| `slow` | 280 ms   | isto                       | prelaz ekrana            |

Animira se samo ono što objašnjava promenu stanja. `prefers-reduced-motion` / "Reduce Motion" isključuje sve osim fade-a. Skeleton shimmer je jedina "ambijentalna" animacija.

---

## 6. Komponente (zajednički ugovor za web i RN)

| Komponenta                                                | Varijante / stanja                                                                                                 | Pravila                                                                                                             |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| **Button**                                                | `primary` (accent, tamni tekst), `secondary` (surface2 + border), `ghost`, `danger`; `sm/md/lg`; loading, disabled | Jedno primarno dugme po ekranu. Loading zadržava širinu. Disabled nije samo bleđi, nego ima i razlog (helper text). |
| **IconButton**                                            | `ghost`, `surface`                                                                                                 | Obavezan `accessibilityLabel`                                                                                       |
| **Input / Select / Search**                               | default, focus (accent.400 prsten 2 px), error (danger + poruka), disabled                                         | Labela iznad (ne placeholder kao labela). Greška ispod polja, prevedena.                                            |
| **Modal** (web) / **BottomSheet** (mobile)                | -                                                                                                                  | Na mobilnom se forme i izbori otvaraju u sheet-u, ne u centralnom modalu                                            |
| **ConfirmDialog**                                         | `default`, `destructive`                                                                                           | Destruktivna akcija navodi posledicu ("Uplata će biti stornirana. Ovo se beleži.")                                  |
| **Toast**                                                 | success, error, info                                                                                               | 4 s, ne pokriva bottom nav. Greške koje traže akciju ne idu u toast.                                                |
| **Badge / StatusIndicator**                               | po statusima iz §1                                                                                                 | Ikona + tekst + boja                                                                                                |
| **MembershipCard**                                        | active, expiring, expired, paused, pending, none                                                                   | Vidi §7                                                                                                             |
| **QRCard**                                                | loading, ready (odbrojavanje), refreshing, offline, not-eligible                                                   | Vidi §7                                                                                                             |
| **StatCard**                                              | value, delta (opciono), empty                                                                                      | Prazno stanje "-" + objašnjenje, **nikad 0 ako podatak ne postoji**                                                 |
| **ClassCard / TrainerCard / EquipmentCard / ProductCard** | default, compact, unavailable                                                                                      | Foto 16:9 ili 4:3; status uvek vidljiv                                                                              |
| **EmptyState**                                            | -                                                                                                                  | Ikona + 1 rečenica + (opciono) jedna akcija                                                                         |
| **Skeleton**                                              | text, card, list-row                                                                                               | Oblik odgovara stvarnom sadržaju                                                                                    |
| **ErrorState**                                            | network, server, forbidden                                                                                         | Šta se desilo + "Pokušaj ponovo"                                                                                    |
| **DataTable** (admin)                                     | sort, filter, paginacija, prazno, učitavanje, izbor reda                                                           | Sticky header, tabularne cifre, akcije reda u "⋯" meniju                                                            |

## 7. Ključni ekrani - skice

### Mobilna - Početna

```
┌──────────────────────────────┐
│ Dobro jutro, Marko      (◯)  │  ← avatar → profil
│                              │
│ ┌──────────────────────────┐ │
│ │ ▌GRIT  ·  AKTIVNO ✓      │ │  MembershipCard: surface + dijagonalni
│ │ [Naziv paketa]           │ │  akcentni rez u gornjem levom uglu
│ │ Važi do 14. 12.  · 28 d  │ │
│ │ ┌──────────────────────┐ │ │
│ │ │   ▣  POKAŽI QR KOD   │ │ │  ← primarno dugme (accent)
│ │ └──────────────────────┘ │ │
│ └──────────────────────────┘ │
│ SLEDEĆI TRENING              │  ← label
│ ┌──────────────────────────┐ │
│ │ (prazno stanje dok ne    │ │  ništa se ne izmišlja
│ │  postoje rezervacije)    │ │
│ └──────────────────────────┘ │
│ OBAVEŠTENJE · PROMOCIJA      │
├──────────────────────────────┤
│  ⌂     ◎      ▲      ▣    ◯  │  bottom nav, aktivni = accent + crtica
└──────────────────────────────┘
```

### Mobilna - QR (fullscreen modal)

- Tamna pozadina. QR je na **belom polju** (#FFF, quiet zone ≥ 4 modula), jer crno na belom skenira najpouzdanije.
- Iznad: ime, paket i status badge. Ispod: tanka linija odbrojavanja (accent) i "Kod se osvežava automatski".
- Osvetljenost ekrana ide na maksimum dok je otvoren (`expo-brightness`) i vraća se pri zatvaranju.
- Stanja: **nije podoban** (nema važeće članarine) → nema QR-a, nego objašnjenje i akcija "Kontaktiraj recepciju". **Offline** → "Potrebna je internet veza".

### Admin - Check-in (recepcija)

Pun ekran, minimum distrakcija. Levo je polje za skener (stalni fokus) i pretraga člana. Desno je **veliki rezultat**: zelena ili crvena traka preko cele širine, fotografija člana (za vizuelnu proveru identiteta), ime, paket, rok ili preostali dolasci, i razlog odbijanja jasnim jezikom. Zvučni signal je opcion i različit za odobreno i odbijeno.

## 8. RTL i lokalizacija

- Koriste se logička svojstva: `paddingStart/End`, `marginInline*`, `text-align: start`. **Nikad `left/right`** u komponentama. ESLint pravilo zabranjuje `marginLeft` i slične u RN stilovima.
- Tekst sme da bude do 40% duži od srpskog (ruski i nemački stil). Dugmad i tabovi se ne lome, a predugi tekst ide sa ellipsis + tooltip/accessibility.
- Brojevi, datumi i valute idu kroz `Intl` (`sr-Latn-RS`, `en-GB`, `ru-RU`, `ar` sa latiničnim ciframa ⚠️).
- "GRIT GYM" i "GRIT" se nikad ne prevode niti transliteruju.

## 9. Pristupačnost (minimum)

WCAG 2.1 AA kontrast; vidljiv fokus (accent.400, 2 px) u admin i sajtu; podrška za Dynamic Type do 130% bez lomljenja layouta na mobilnom; sve ikone-dugmad imaju labelu; forme imaju povezane labele i greške (`aria-describedby`).

## 10. Javni sajt - pravac

Struktura: **Hero** (prava fotografija prostora preko cele širine, kratak iskošen naslov, CTA "Postani član" + "Pogledaj ponudu") → **Prostori** (teretana, CrossFit, boks, kafić/bašta, svaki sa fotografijom) → **Paketi** (iz API-ja; dok ih vlasnik ne potvrdi, sekcija se ne prikazuje) → **Treneri** → **Radno vreme i lokacija** (mapa + "Otvori u Google Maps") → **FAQ** → **Preuzmi aplikaciju** → footer.
Bez stock fotografija ljudi. **Fotografije stvarnog prostora su najveći pojedinačni faktor kvaliteta** (vidi OPEN_QUESTIONS).

## 11. Fotografija (iz postojećih GRIT materijala)

GRIT već ima prepoznatljiv foto-jezik, koji sistem treba da preuzme:

- **Crno-bela, visok kontrast, tamni "low-key" ton**, sa zrnom i vinjetom. Boja je samo u tipografiji ili logou (narandžasta).
- Portreti trenera su frontalni, od pojasa naviše, sa tamnom teretanom u pozadini i imenom ispod: ime belim, prezime narandžastim, uloga kao tanki italic.
- **TrainerCard i hero na sajtu prate ovaj šablon.** Fotografije u aplikaciji dobijaju blagi tamni gradijent odozdo (samo ispod teksta, radi čitljivosti). To je jedini dozvoljeni gradijent.
- Fotografije opreme i prostora mogu biti u boji (član treba da prepozna spravu), ali uz isti tamni ton i bez preosvetljenja.
- Tekst preko fotografije ide samo na tamnu zonu, uz kontrast ≥ 4,5:1.
