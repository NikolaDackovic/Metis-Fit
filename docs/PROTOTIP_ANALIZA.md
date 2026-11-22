# Prototip vlasnika (`grit-gym.html`) - poređenje sa planom

Prototip je jedna HTML stranica sa izmišljenim podacima (42 člana, 8 trenera, 35 usluga). Služi kao **smernica šta klub želi**. Nijedan podatak iz njega se ne prenosi u sistem; cene, imena i procenti ostaju provizorni dok ih vlasnik ne potvrdi.

Datum analize: 2026-11-17 (posle faze 7).

## 1. Već postoji (ili je u planu)

| Iz prototipa                                                   | Kod nas                                                  |
| -------------------------------------------------------------- | -------------------------------------------------------- |
| Pregled: u teretani, aktivni, prihod, novi                     | Admin „Pregled“ (F2), proširuje se izveštajima           |
| Članovi: statusi, filteri, dug, ističe uskoro                  | F2 (status se računa u bazi)                             |
| Profil člana: članarine, uplate, dolasci                       | F2/F4                                                    |
| QR ulaz + ručni ulaz                                           | F4 (jednokratni QR od 60 s, bez ličnih podataka)         |
| Uplate: storno, refundacija, popust                            | F2 (`void`/`refund`, `discount_amount`)                  |
| Raspored, rezervacije, kapacitet, lista čekanja                | F6                                                       |
| Treneri, klijenti trenera                                      | F6 + F7                                                  |
| Personalni treninzi                                            | F6 (zahtevi, termini se troše)                           |
| Napredak: težina, % masti, obimi, grafikoni                    | F7 (privatno; trener samo uz pristanak)                  |
| Uloge: vlasnik, menadžer, trener, recepcija, higijeničar, član | uloge + dozvole od F1 (higijeničar = uloga „održavanje“) |
| Loyalty nivoi i nagrade                                        | F8                                                       |
| Notifikacije                                                   | F8                                                       |
| Srpski / engleski                                              | sr, en, **ru** (+ ar u F8)                               |

## 2. Nedostaje - predlog gde da uđe

| #   | Funkcija iz prototipa                                                                                              | Predlog                                                   | Šta treba od vlasnika                                                                                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | **Garderobe i ormarići**: muška/ženska svlačionica, ormarić se dodeljuje pri ulasku i oslobađa pri izlasku, servis | **F8a „Recepcija+“** (sledeće)                            | Broj ormarića po svlačionici; da li član bira ormarić ili ga dodeljuje recepcija; ključ ili narukvica                                                           |
| P2  | **Odjava (izlaz)** i broj „trenutno u teretani“                                                                    | F8a, zajedno sa P1                                        | Da li se izlaz skenira ili se automatski zatvara posle X sati                                                                                                   |
| P3  | **Katalog usluga** (masaža, sauna, InBody, dnevna karta, peškir…) i prodaja pojedinačne usluge                     | **F9b „Usluge i zarade trenera“**                         | Spisak usluga i cena                                                                                                                                            |
| P4  | **Udeo trenera** po usluzi (% ili fiksno RSD) i **obračun zarade** po mesecu                                       | F9b                                                       | Procenti/iznosi po treneru i usluzi                                                                                                                             |
| P5  | **Inventar / bar / prodavnica** (suplementi, pića, peškiri, oprema; stanje, minimalna zaliha)                      | F9, uz kafić                                              | ⚠️ Prodaja robe u Srbiji ide kroz **fiskalni račun (ESIR)**. Predlog: sistem vodi stanje i meni, a naplata ide kroz fiskalnu kasu dok se ne izabere integracija |
| P6  | **Plan treninga od trenera** (po danima)                                                                           | **F7b** (mala dopuna)                                     | -                                                                                                                                                               |
| P7  | **Plan ishrane**                                                                                                   | Samo kao tekst/beleška trenera, bez kalkulatora           | ⚠️ U PRD-u je isključeno (odgovornost); vlasnik da potvrdi                                                                                                      |
| P8  | **InBody mere** (mišićna masa, voda, visceralna mast, visina/BMI, list)                                            | F7b                                                       | -                                                                                                                                                               |
| P9  | **Upozorenja u adminu**: obnova, dug, neaktivan 30+ dana, rođendan, nova registracija                              | F8 (admin centar obaveštenja)                             | -                                                                                                                                                               |
| P10 | Status **„pasivan“** (ima članarinu, ne dolazi)                                                                    | F8, izveštaj zadržavanja                                  | Koliko dana bez dolaska = pasivan (predlog 14)                                                                                                                  |
| P11 | **Izveštaji**: prihod po kategoriji, top usluge, trend po periodu, izvoz                                           | F10                                                       | -                                                                                                                                                               |
| P12 | **Parking kartice** (tablica, period)                                                                              | Opciono, posle F10                                        | Da li klub ima parking za članove                                                                                                                               |
| P13 | **Štampa kartice i potvrde o uplati**                                                                              | Potvrda o uplati sa napomenom „nije fiskalni račun“ u F9b | -                                                                                                                                                               |
| P14 | Globalna pretraga u adminu (član, uplata, usluga)                                                                  | F10                                                       | -                                                                                                                                                               |
| P15 | Ocena trenera, više filijala                                                                                       | Ne sada                                                   | -                                                                                                                                                               |

## 3. Namerne razlike od prototipa

- **QR kod** u prototipu je stalan (`GRIT:GG10001`). Takav kod može da se fotografiše i pozajmi, pa kod nas QR važi 60 sekundi i jednokratan je (SECURITY §5).
- **Pol člana** nije obavezan podatak. Za garderobe (P1) recepcija bira svlačionicu; ne izvodimo pol iz imena.
- **Podaci u prototipu su izmišljeni** (imena, cene, procenti). Kod nas ostaju `[DEMO]`/`[PROVIZORNO]` dok ih vlasnik ne unese.
