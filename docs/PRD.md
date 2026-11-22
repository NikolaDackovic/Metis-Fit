# GRIT DIGITAL CLUB - Product Requirements Document

Status: **PREDLOG v0.1** · Vlasnik proizvoda: GRIT GYM · Datum: 2026-11-16

## 1. Problem i cilj

GRIT GYM objedinjuje teretanu, CrossFit, boks/kik-boks, grupne treninge, kafić i baštu. Danas (pretpostavka ⚠️) evidencija članarina i dolazaka nije centralizovana u digitalnom sistemu, a članovi nemaju digitalni kanal ka klubu.

**Cilj:** jedan sistem u kome je

- **član** sve vreme informisan o svom članstvu i ulazi skeniranjem telefona;
- **recepcija** obrađuje dolazak za nekoliko sekundi i nema papirnih evidencija;
- **vlasnik** ima pouzdan pregled članstva, prihoda i posećenosti iz stvarnih podataka.

## 2. Korisnici (persone)

| Persona                  | Glavni posao                       | Uspeh za njih                                                                       |
| ------------------------ | ---------------------------------- | ----------------------------------------------------------------------------------- |
| **Član**                 | Uđe, trenira, zna stanje članarine | "Otvorim app, pokažem QR i uđem. Znam kada ističe."                                 |
| **Recepcija**            | Dolasci, nove članarine, uplate    | "Skeniram, vidim zeleno ili crveno i razlog. Novog člana unesem za manje od 2 min." |
| **Vlasnik/menadžer**     | Poslovne odluke                    | "Vidim koliko je aktivnih, ko ističe, koliko je naplaćeno, bez Excel-a."            |
| **Trener** (kasnije)     | Termini, klijenti                  | "Vidim svoj raspored i ko je prijavljen."                                           |
| **Održavanje** (kasnije) | Kvarovi                            | "Vidim prijavljene kvarove i zatvaram ih."                                          |
| **Gost**                 | Informisanje                       | "Vidim ponudu, radno vreme i kako da postanem član."                                |

## 3. Obim MVP-a (izdanje 1.0)

| #   | Funkcija                                            | Korisnik                | Kriterijumi prihvatanja (sažeto)                                                                       |
| --- | --------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------ |
| M1  | Registracija, prijava, reset lozinke, odjava        | član, staff             | Email verifikacija; sesija preživljava restart app; MFA za owner/manager                               |
| M2  | Povezivanje naloga sa članskim profilom             | član, recepcija         | Pozivnica e-mailom **ili** kod sa recepcije; kod jednokratan, 15 min                                   |
| M3  | Kreiranje i izmena člana                            | recepcija               | Obavezno: ime, prezime, (email ili telefon); duplikat email-a se odbija; audit                         |
| M4  | Paketi (CRUD)                                       | owner/manager           | Svi tipovi iz BUSINESS_RULES; promena cene ne menja prodate članarine                                  |
| M5  | Dodela članarine + evidencija uplate                | recepcija               | Jedna transakcija; preklapanje istog plana se odbija; napomena "nije fiskalni račun"                   |
| M6  | Storno i refund uplate                              | manager                 | Original ostaje; obavezan razlog; audit                                                                |
| M7  | Status članarine u app                              | član                    | Prikazni status tačan za svih 6 stanja (unit testovi graničnih datuma)                                 |
| M8  | Digitalna kartica + QR                              | član                    | Token 60 s, auto-osvežavanje; nema QR-a bez važeće članarine; nema QR-a offline                        |
| M9  | Skeniranje i check-in                               | recepcija               | Rezultat < 500 ms p95; svaki pokušaj zabeležen; paralelni sken → tačno jedan prolaz                    |
| M10 | Ručni check-in i override                           | recepcija (sa dozvolom) | Override traži razlog; audit                                                                           |
| M11 | Pregled članova (tabela, pretraga, filteri, profil) | staff                   | Pretraga po imenu/telefonu/broju < 300 ms za 10k članova                                               |
| M12 | Dashboard (osnovni)                                 | owner/manager           | Aktivni, ističu u 7 dana, današnji dolasci, uplate u periodu; **prazno stanje kada nema podataka**     |
| M13 | Osnovna digitalna mapa                              | član, gost              | Prikaz objavljene mape; tap na prostoriju → opis, fotografije, oprema                                  |
| M14 | Map editor (osnovni)                                | manager                 | Spratovi, prostorije (pravougaonik/poligon), postavljanje opreme, objava verzije                       |
| M15 | Oprema (registar + profil)                          | manager / član          | Naziv, kategorija, foto, uputstvo, status; član može prijaviti kvar                                    |
| M16 | Radno vreme, kontakt, osnovni podaci kluba          | manager / svi           | Izmenjivo iz admina; prikaz u app i na sajtu                                                           |
| M17 | Jezici sr + en                                      | svi                     | 0 hardkodiranih stringova (lint pravilo); promena jezika u podešavanjima                               |
| M18 | Profil, podešavanja, brisanje naloga                | član                    | Brisanje dostupno u app (zahtev Apple-a)                                                               |
| M19 | Javni sajt (osnovni)                                | gost                    | Početna, prostori, radno vreme, lokacija, kontakt, preuzmi app; paketi kada budu potvrđeni             |
| M20 | Uloge i dozvole                                     | owner                   | owner, manager, reception, member (ostale uloge postoje u šemi, a UI se dodaje u fazi koja ih koristi) |

### Van MVP-a (redosled iz ROADMAP-a)

Treneri i grupni treninzi sa rezervacijama · trening dnevnik i napredak · push/in-app notifikacije i automatizacije · promocije i lojalnost · ruski i arapski (RTL) · kafić meni · napredna analitika.

### Eksplicitno van obima (master prompt §18)

Fizička vrata, ormarići, Bluetooth brave, indoor pozicioniranje, senzori popunjenosti, POS kafića, online naplata bez izabranog provajdera, Health integracije, AI trener, nutricionistički planovi, društvene funkcije.

## 4. Ključni tokovi

**T1 - Novi član na recepciji (cilj < 2 min)**
Admin → "Novi član" → ime, prezime, telefon, email → [Sačuvaj] → "Dodeli članarinu" → izbor paketa → početak (podrazumevano danas) → uplata (iznos se popunjava iz cene, metod) → [Potvrdi] → opcija "Pošalji pozivnicu za aplikaciju".

**T2 - Ulazak člana**
App → "Pokaži QR" → (token) → recepcija skenira → zeleno: ime, foto, paket, "važi do" → član ulazi. Crveno: razlog ("Članarina je istekla 10. 11.") → recepcija nudi obnovu (T1, korak dodele).

**T3 - Član bez interneta na ulazu**
App prikazuje "Potrebna je internet veza" → recepcija pretragom pronalazi člana → ručni check-in (ista pravila validacije, `source = manual`).

**T4 - Prijava kvara**
App → Istraži → prostorija → sprava → "Prijavi problem" → opis (+ foto) → potvrda "Prijava je poslata osoblju" → admin: lista zahteva → trijaža → status sprave.

## 5. Metrike uspeha (meri se iz sistema, posle 3 meseca rada ⚠️ ciljevi za potvrdu)

- ≥ 60% dolazaka preko QR-a (umesto ručno).
- Medijana vremena check-in-a ≤ 5 s (od skena do rezultata na ekranu).
- ≥ 50% aktivnih članova sa povezanim nalogom u aplikaciji.
- 0 incidenata pristupa tuđim podacima.

## 6. Pretpostavke i zavisnosti

- Recepcija ima računar ili tablet sa stabilnim internetom i (preporučeno) USB 2D skener ⚠️.
- Vlasnik dostavlja podatke iz OPEN_QUESTIONS.md. Bez njih se MVP isporučuje sa praznim stanjima, ali se ne može pustiti članovima.
- Nalozi za Apple Developer (99 USD godišnje) i Google Play (25 USD jednokratno) otvaraju se **na ime GRIT-a**.
