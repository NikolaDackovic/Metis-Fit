# Checklista za vlasnika GRIT GYM-a

> **2026-11-16:** većina pitanja je provizorno razrešena u [DECISIONS.md](DECISIONS.md). Ova lista ostaje kao podsetnik šta vlasnik može naknadno da potvrdi ili promeni.

Ovo su podaci i odluke koje razvojni tim **ne sme da izmišlja**. Dok ne stignu, sistem prikazuje prazna stanja ili jasno označene `[DEMO]` podatke.
Prioritet: 🔴 blokira MVP · 🟠 potrebno pre pune objave · 🟢 kasnije faze.

## A. Poslovne odluke (pitanja)

| #   | Pitanje                                                                                                  | Prioritet |
| --- | -------------------------------------------------------------------------------------------------------- | --------- |
| A1  | Spisak svih paketa: naziv, cena, trajanje, broj dolazaka, vremenska ograničenja, zone                    | 🔴        |
| A2  | Valuta: samo RSD ili i EUR?                                                                              | 🔴        |
| A3  | Da li je **ponovni ulaz istog dana** nov dolazak (za pakete na broj dolazaka)?                           | 🔴        |
| A4  | Ako član ima dve članarine koje važe, koja se troši?                                                     | 🔴        |
| A5  | Da li član **sa dugovanjem** može da uđe?                                                                | 🔴        |
| A6  | Koliko dana pre isteka se članarina prikazuje kao "uskoro ističe"? (predlog: 7)                          | 🔴        |
| A7  | Obnova pre isteka: nova članarina počinje odmah ili posle isteka stare?                                  | 🔴        |
| A8  | Pravila pauze: ko može, koliko puta, najduže koliko dana, po kom paketu?                                 | 🟠        |
| A9  | Da li se ručno odobren ulaz (override) računa kao potrošen dolazak?                                      | 🔴        |
| A10 | Ko od zaposlenih sme da stornira uplatu ili da override?                                                 | 🔴        |
| A11 | Približan broj aktivnih članova i dnevnih dolazaka danas                                                 | 🟠        |
| A12 | Kako se članarine i dolasci vode **danas** (Excel, sveska, drugi softver)? Da li postoje podaci za uvoz? | 🔴        |
| A13 | Srpski u aplikaciji: **latinica ili ćirilica**?                                                          | 🔴        |
| A14 | Šta je tačno prostor "bazen" (20 × 5 m)? Kako se koristi i ko mu pristupa?                               | 🟠        |
| A15 | Rezervacije grupnih treninga: rok otkazivanja, posledice nedolaska, da li troše dolazak, koliko unapred  | 🟢        |
| A16 | Rokovi čuvanja podataka i tekst politike privatnosti (pravnik/knjigovođa)                                | 🟠        |
| A17 | Fiskalna kasa: koji sistem se koristi (za kasniju integraciju)?                                          | 🟢        |

## B. Sadržaj i materijali

| #   | Materijal                                                                                                                                                                                                                                                                                                                                                  | Prioritet    |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| B1  | **Logo u vektoru** (SVG/AI/PDF), varijante (samo znak, horizontalni), zvanične boje i font ako postoje                                                                                                                                                                                                                                                     | 🔴           |
| B2  | Fotografije svih prostora: ulaz, kafić, bašta, recepcija, garderobe, svlačionice, teretana, boks, CrossFit, "bazen" (horizontalne, dobro osvetljene, bez ljudi ili uz njihovu saglasnost)                                                                                                                                                                  | 🟠           |
| B3  | **Skica svakog nivoa** (može i ručno nacrtana sa približnim dimenzijama), stepenice, prolazi, toaleti                                                                                                                                                                                                                                                      | 🔴 (za mapu) |
| B4  | Spisak sprava: naziv, proizvođač, model, prostorija, fotografija; uputstva ili video ako postoje                                                                                                                                                                                                                                                           | 🟠           |
| B5  | Radno vreme (redovno + praznici), adresa, telefon, email, društvene mreže                                                                                                                                                                                                                                                                                  | 🔴           |
| B6  | Treneri: ime, fotografija, biografija, specijalizacija, sertifikati, saglasnost za javni prikaz. _Primljeno:_ promo portret jednog trenera (Personal & CrossFit Coach) i timska fotografija (4 trenera). Treba: originalne fotografije u punoj rezoluciji (bez ugrađenog teksta), imena svih trenera i pisana saglasnost za prikaz u aplikaciji i na sajtu | 🟢           |
| B10 | Naziv fonta koji se koristi na Instagram objavama (široki naslovni font) i izvorni fajlovi dizajna                                                                                                                                                                                                                                                         | 🟠           |
| B7  | Raspored grupnih aktivnosti i kapaciteti                                                                                                                                                                                                                                                                                                                   | 🟢           |
| B8  | Meni kafića: proizvodi, cene, fotografije, sastojci, alergeni                                                                                                                                                                                                                                                                                              | 🟢           |
| B9  | FAQ: najčešća pitanja koja recepcija dobija                                                                                                                                                                                                                                                                                                                | 🟠           |

## C. Nalozi i infrastruktura (na ime GRIT-a)

| #   | Stavka                                                               | Prioritet |
| --- | -------------------------------------------------------------------- | --------- |
| C1  | Domen (npr. gritgym.rs?) i pristup DNS-u                             | 🔴        |
| C2  | Apple Developer Program nalog (organizacija → potreban D-U-N-S broj) | 🔴        |
| C3  | Google Play Console nalog                                            | 🔴        |
| C4  | Email za slanje (npr. `no-reply@<domen>`) za Resend                  | 🔴        |
| C5  | Oprema recepcije: računar/tablet, internet, USB 2D QR skener         | 🔴        |
| C6  | Odgovorna osoba za odobravanja (dizajn, sadržaj, testiranje pilota)  | 🔴        |
