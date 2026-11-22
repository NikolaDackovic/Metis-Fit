# Pregled projekta (2026-11-22)

Prolaz kroz aplikaciju (svi glavni ekrani na veličini telefona), API i dokumentaciju, uz poređenje sa GoFitness i MyFitnessPal. Šta je urađeno odmah, šta je višak i šta ostaje.

## Urađeno u ovom krugu (F15)

| #   | Nalaz                                                                                         | Rešenje                                                                                                                                          |
| --- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Profil je ponavljao Početnu ("Sledeći trening", "Danas za tebe")                              | Profil je sada samo nalog i podešavanja; "danas" ostaje na Početnoj                                                                              |
| 2   | Podešavanja razbacana: Profil + poseban ekran (zupčanik) + obaveštenja u inboxu               | Sve na jednom mestu u Profilu: Nalog, Obaveštenja (prekidači), Kalendar telefona, Jezik, Vodič, Kontakt kluba, Pravno, Privatnost, Odjava        |
| 3   | Nema uvoda za nove članove                                                                    | Vodič u 5 koraka posle prve prijave (preskače se, ponovo iz Profila); bez obaveznog skeniranja                                                   |
| 4   | Nema uslova korišćenja i politike privatnosti u aplikaciji (App Store i Google Play to traže) | Ekrani "Uslovi korišćenja" i "Politika privatnosti" jasnim jezikom (sr, en, ru, ar); pravnik pregleda pre objave                                 |
| 5   | Dnevnik ishrane je bio samo ručni unos broja kalorija                                         | Brojač kalorija u stilu MyFitnessPal: katalog, pretraga bez kvačica, bar-kod, porcije i grami, moje namirnice, brzi unos, kopiranje obroka, voda |
| 6   | Kalorije nisu bile vidljive na Početnoj                                                       | Kartica "Kalorije danas" sa "+" za brzo dodavanje; uklonjen dupli podsetnik "Vodi dnevnik ishrane"                                               |
| 7   | QR ekran: negativna veličina koda na uskim ekranima (greška u konzoli)                        | Najmanja veličina koda 160                                                                                                                       |

## Uzeto od GoFitness (i prilagođeno nama)

- Uvodni vodič sa trakom napretka i "Preskoči" → urađeno (bez obaveznog skeniranja koda kluba, jer član ulazi i bez toga).
- Sva podešavanja u Profilu, grupisana sa ikonicama → urađeno.
- "Dodaj rezervacije u kalendar" → kod nas pretplata kalendara (F14-8), sada i u Profilu.
- Uslovi, privatnost, vodič, jezik u Profilu → urađeno.
- Izbor teme Svetla / Tamna / Sistem → **nije urađeno** (vidi dole).
- Email obaveštenja (potvrde, podsetnici o paketu, novosti) → kasnije, kada se podesi slanje mejlova (Resend, adresa na domenu).
- Bočni meni (hamburger) → **ne treba**: donja traka + Profil pokrivaju sve, meni bi dupliran navigaciju.

## Šta je višak / šta ne preporučujem

- Bočni meni kao u GoFitness: dupla navigacija.
- Obavezno skeniranje koda teretane posle registracije: usporava ulazak; mi povezujemo nalog emailom ili kodom kad član želi.
- Poseban ekran "Podešavanja": spojen sa Profilom (stara adresa sada vodi na Profil).

## Preporuke za sledeće korake

1. **Svetla tema (Svetla / Tamna / Sistem).** Boje su sada fiksne u stilovima; treba ih prevesti na temu koja se menja u radu. Srednje velik posao (svi ekrani), bez rizika po podatke.
2. **Ishrana kao jedno mesto.** "Brojač kalorija" i "Plan ishrane" su dva ulaza u Zdravlju; spojiti u jedan ekran sa karticama Dnevnik | Plan | Ciljevi.
3. **Nedeljni pregled kalorija** (grafikon 7 dana, prosek, makro raspodela), kao u MyFitnessPal.
4. **Omiljeni obroci** (sačuvaj ceo doručak i dodaj ga jednim dodirom).
5. **Admin:** detaljan UX prolaz kroz back office (ovaj pregled se fokusirao na aplikaciju za članove).
6. **Tehnički:** prvi git commit, automatski E2E testovi, rate limit za više servera, push ključevi (Apple/Google), produkcioni Supabase.

## Napomene

- Vrednosti u katalogu namirnica su prosečne (na 100 g) i lako se menjaju; Open Food Facts ima dobru pokrivenost za uvozne proizvode, slabiju za domaće, pa član jednom unese namirnicu sa etikete i ona se dalje nalazi po bar-kodu.
- Prema Open Food Facts ide samo bar-kod, bez podataka o članu (navedeno i u politici privatnosti).
