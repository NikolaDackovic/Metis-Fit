# Predlog arhitekture "Metis Fit": procena i plan (2026-11-22)

Procena dokumenta "Metis Fit – predlog kompletne arhitekture" u odnosu na ono što već postoji u repou.

## Već imamo (poklapa se sa predlogom)

| Predlog                                       | Kod nas                                                                                                            |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Jedna aplikacija za sve uloge                 | Metis Fit: član, trener (kartica "Posao"), isti nalog u više teretana                                              |
| Modularni monolit, React + TS, Node, Postgres | Express API po modulima, Expo aplikacija, React + Vite admin, zajednički paketi (validacija, tipovi, prevodi)      |
| REST + OpenAPI                                | Svaka ruta ima šemu; OpenAPI se generiše                                                                           |
| Multi-tenant                                  | `club_id` na svim tabelama, izolacija u bazi (RLS), `X-Club`, više teretana po nalogu, platforma odobrava teretane |
| Dozvole po ulogama, trener nije admin         | Uloge i dozvole (vlasnik, menadžer, recepcija, trener), trener vidi samo svoje klijente                            |
| Lični podaci pripadaju korisniku              | Trening, ishrana, navike, merenja su na nalogu; trener vidi napredak samo uz dozvolu člana                         |
| Recepcija                                     | Ulaz (QR skener, kamera), kiosk na vratima, uplate, garderobe, zahtevi                                             |
| Offline QR                                    | Potpisani vremenski ograničeni kodovi, rezervni kod bez interneta                                                  |
| Bezbednost                                    | MFA za vlasnika i menadžera, audit trag, rate limit, tajne samo na serveru, zaštita od ponovnog QR-a               |
| Brojač kalorija, bar-kod, voda, ciljevi       | F15-2                                                                                                              |
| Treneri, termini, poruke, rasporedi           | F14                                                                                                                |
| Kafić, loyalty                                | Meni, porudžbine sa stola, bodovi (do Servio integracije)                                                          |

## Vredi dodati (redosled koji predlažem)

1. **Recepcijski režim** u adminu: jedan ekran sa velikim dugmadima (pronađi ili skeniraj, status, dolazak, produži, naplati, prodaj, rezerviši); vlasnik određuje šta recepcija sme.
2. **Trener:** kontrolna tabla (klijenti, treninzi danas, aktivni programi, ko čeka plan), šabloni programa treninga koje dodeljuje više klijenata, komentari na trening.
3. **Napredak:** fotografije napretka (privatne, deljive sa trenerom), lični rekordi, nedeljni izveštaj ishrane.
4. **Integration Hub za Servio:** verzionisan API + webhook događaji, "outbox" (događaj se upisuje u istoj transakciji, šalje se dok ne uspe); prepoznavanje člana, popusti, loyalty, kupovina sa nutritivnim vrednostima u dnevnik uz potvrdu člana.
5. **Jasno stanje "čeka potvrdu"** kada aplikacija nema vezu (rezervacija se nikad ne prikazuje kao potvrđena dok server ne potvrdi).
6. **Monitoring grešaka** (npr. Sentry) i redovan backup sa proverom vraćanja.

## Lokalni "Gym Node" (server u teretani) i desktop instalacija

Predlog ima smisla za teretane sa lošim internetom, ali je to najveći i najrizičniji deo: dve baze koje se sinhronizuju, rešavanje sukoba (npr. uplata zabeležena offline i online), instalacija i ažuriranje na računarima teretana, backup na licu mesta.

Preporuka:

- **Sada:** ostati na cloud arhitekturi (jedna baza po regionu, svaka teretana izolovana), koja već radi i jednostavna je za održavanje.
- **Pre puštanja:** "offline recepcija" kao lakša verzija: admin čuva listu važećih članarina i potpisane propusnice, proverava ulaz bez interneta i šalje dolaske kad se veza vrati (outbox).
- **Kasnije, ako teretane traže:** pravi Gym Node (Windows servis + lokalni Postgres + sync), kao zasebna faza, kada Integration Hub i outbox već postoje (isti mehanizam se koristi za sinhronizaciju).
- **Desktop (Tauri):** može da zapakuje postojeći admin bez prepravljanja, kada bude potreban.

## Napomene

- Baza namirnica: sada sopstveni katalog + Open Food Facts (besplatno); za bolju pokrivenost domaćih proizvoda kasnije razmotriti licenciranu bazu.
- Servio i Metis Fit ostaju zasebni proizvodi sa zajedničkim integracionim slojem, bez zajedničke baze.
