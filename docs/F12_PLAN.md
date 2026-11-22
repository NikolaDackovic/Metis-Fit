# F12 - Platforma za više teretana

Dogovor sa korisnikom (2026-11-20):

- **Teretane se same registruju.** Nova teretana je "na čekanju" dok je vlasnik platforme ne odobri; tek tada se vidi u imeniku i može da prodaje članarine preko aplikacije.
- **Član može biti u više teretana istovremeno.** U aplikaciji bira "trenutnu teretanu"; lični deo (napredak, treninzi, ishrana, merenja, navike) je jedan, zajednički.
- **Izgled:** neutralan brend platforme dok teretana nije izabrana, zatim logo i boje izabrane teretane (kao sada GRIT).

## Model podataka

| Vrsta               | Primeri                                                                                                                                                    | Kome pripada                                   |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Nalog (globalno)    | profiles, push_tokens, notification_preferences, permissions                                                                                               | korisniku                                      |
| Lični podaci        | workout_sessions/sets, body_measurements, member_goals, food_log_entries, activities, daily_checkins                                                       | korisniku (od F12-2), bez obzira na teretanu   |
| Zajednički katalozi | exercises, muscle_groups, equipment_categories                                                                                                             | platformi (teretana kasnije može dodati svoje) |
| Podaci teretane     | members, memberships, payments, plans, classes, bookings, trainers, equipment, map, lockers, cafe, services, staff, roles, shifts, business, settings, ... | teretani (`club_id`)                           |

Član je **članstvo osobe u jednoj teretani** (`members` red po teretani, sa brojem člana te teretane). Jedna osoba = jedan nalog = više `members` redova.

## Izolacija (bezbednost)

- Svaka tabela teretane ima `club_id not null default public.current_club_id()`.
- API za svaki zahtev zna teretanu: osoblje iz svoje uloge u toj teretani, član iz izabrane teretane (zaglavlje `X-Club`, proverava se da je tu član), javni sadržaj iz adrese teretane (slug).
- Transakcija postavlja `app.club_id` i radi kao uloga koja **ne zaobilazi RLS**; na svim tabelama teretane je **restriktivna** politika `club_id = current_club_id()`. Tako i postojeći upiti bez `where club_id` ostaju unutar jedne teretane.
- Pogledi rade kao `security_invoker`, a SQL funkcije čitaju podešavanja samo trenutne teretane.
- Testovi: dve teretane, ništa ne sme da procuri ni u jednom modulu.

## Koraci

| Korak                            | Sadržaj                                                                                                                                                                                                                                      |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **F12-1 Temelj**                 | Tabela `clubs` (GRIT je prva), `club_id` na svim tabelama teretane sa prenosom postojećih podataka, jedinstvenosti po teretani (broj člana, ključevi, podešavanja), kontekst teretane u API-ju, izolacija preko RLS, testovi sa dve teretane |
| **F12-2 Lični podaci po nalogu** | Treninzi, merenja, ciljevi, ishrana, aktivnosti, dnevni unosi vezani za nalog; trener ih vidi samo uz deljenje i dok je član u njegovoj teretani; planovi trenera ostaju članu kao istorija                                                  |
| **F12-3 Registracija teretane**  | Javni obrazac "Otvori teretanu" → teretana na čekanju + vlasnički nalog; podrazumevana podešavanja i uloge; platforma-admin (ti): odobri, suspenduj, pregled                                                                                 |
| **F12-4 Aplikacija**             | Neutralan brend; "Moje teretane" i "Pronađi teretanu" (imenik, grad); izbor trenutne teretane; rad bez teretane (lični deo uvek radi); učlanjenje i povezivanje po teretani                                                                  |
| **F12-5 Admin**                  | Izbor teretane za osobu koja radi u više njih; sve stranice u okviru izabrane teretane                                                                                                                                                       |
| **F12-6 Pozadina**               | Javne rute po teretani, obaveštenja i automatski poslovi po teretani, fajlovi (slike) po teretani, izvoz i brisanje naloga preko svih teretana                                                                                               |
