# GRIT DIGITAL CLUB - Priprema za App Store i Google Play

Nacrt odgovora za obrasce o privatnosti u prodavnicama. **Pre slanja ih proverava vlasnik ili pravnik**, jer se odnose na stvarno poslovanje kluba. Vrednosti su izvedene iz onoga što aplikacija zaista radi (kod, migracije, docs/SECURITY.md).

## 1. Šta aplikacija prikuplja

| Podatak                                          | Zašto                                     | Obavezno        | Povezano sa osobom |
| ------------------------------------------------ | ----------------------------------------- | --------------- | ------------------ |
| Ime i prezime                                    | nalog i članstvo                          | da              | da                 |
| Email                                            | prijava, potvrda naloga                   | da              | da                 |
| Telefon                                          | kontakt kluba                             | ne              | da                 |
| Datum rođenja                                    | rođendanske poruke, starost na merenjima  | ne              | da                 |
| Profilna fotografija                             | prikaz na kartici i u profilu             | ne              | da                 |
| Dolasci (ulaz QR kodom)                          | članarina, broj dolazaka                  | da (za članove) | da                 |
| Uplate i članarine                               | evidencija kluba                          | da (za članove) | da                 |
| Treninzi, mere, ciljevi, dnevnik ishrane, navike | funkcije aplikacije koje član sam koristi | ne              | da                 |
| Porudžbine u kafiću                              | priprema i naplata                        | ne              | da                 |
| Push token uređaja                               | obaveštenja                               | ne              | da                 |

Ne prikuplja se: lokacija, kontakti, sadržaj sa uređaja, podaci o pretraživanju, oglasni identifikatori. **Nema praćenja (tracking) ni prodaje podataka**, nema oglasa i nema analitike trećih strana.

Telesne mere i fotografije napretka traže poseban pristanak (docs/SECURITY.md §8). Trener ih vidi samo uz pristanak člana.

## 2. Apple: App Privacy (privacy labels)

- **Data Used to Track You:** nema.
- **Data Linked to You:** Contact Info (Name, Email, Phone), Health & Fitness (Fitness, mere), User Content (Photos), Identifiers (User ID), Purchases (Purchase History: članarine i kafić), Usage Data (Product Interaction: dolasci).
- **Data Not Linked to You:** nema.
- Svrha za sve: **App Functionality**. Ništa se ne koristi za oglase ili marketing trećih strana.
- **Account deletion:** u aplikaciji, Podešavanja → Privatnost → Obriši nalog (zahtev App Store pravila 5.1.1(v)).
- Sign in with Apple: nije potreban, jer aplikacija nema prijavu preko drugih servisa (samo email i lozinka).

## 3. Google Play: Data safety

- Prikupljanje: Personal info (Name, Email, Phone, Date of birth), Health and fitness, Photos, Financial info (Purchase history), App activity (dolasci), Device or other IDs (push token).
- Deljenje sa trećim stranama: **ne** (Supabase i hosting su obrađivači podataka u ime kluba, ne treće strane u smislu obrasca).
- Šifrovanje u prenosu: **da** (HTTPS).
- Brisanje: korisnik može da zatraži i izvrši brisanje u aplikaciji; navesti i web adresu kluba za zahtev bez aplikacije.

## 4. Šta je ugrađeno

| Zahtev                       | Gde                                                                                                                                                                 |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Brisanje naloga u aplikaciji | Podešavanja → Privatnost → Obriši nalog: lični podaci se brišu odmah, nalog za prijavu se briše, uplate / članarine / dolasci ostaju anonimizovani („Obrisan član“) |
| Izvoz podataka               | Podešavanja → Privatnost → Preuzmi moje podatke (JSON)                                                                                                              |
| Pristanci                    | marketing i deljenje napretka sa trenerom, mogu se povući                                                                                                           |
| Zaposleni                    | ne brišu nalog iz aplikacije; vlasnik ih deaktivira u adminu                                                                                                        |

## 5. Pre slanja (za vlasnika)

- [ ] **Politika privatnosti** i **uslovi korišćenja** na web adresi kluba (piše pravnik; docs/OPEN_QUESTIONS.md A16). Link ide u obe prodavnice i u aplikaciju.
- [ ] Rokovi čuvanja knjigovodstvenih zapisa potvrđeni sa knjigovođom (docs/BUSINESS_RULES.md 1.5).
- [ ] Apple Developer (99 USD godišnje) i Google Play (25 USD jednom) nalozi na ime kluba.
- [ ] Naziv paketa `rs.gritgym.app` potvrđen (posle prve objave ne može da se menja).
- [ ] Snimci ekrana: iPhone 6,9" i 6,5", Android telefon; sr i en. Bez demo podataka sa stvarnim imenima.
- [ ] Test nalog za review timove (Apple i Google traže prijavu): član sa važećom članarinom.
- [ ] Opis aplikacije, ključne reči, kategorija (Health & Fitness), starosna oznaka (4+ / Everyone).
