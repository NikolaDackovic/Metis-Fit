# GRIT DIGITAL CLUB - Poslovna pravila

Status: **PREDLOG.** Sve stavke ⚠️ su provizorno razrešene u [DECISIONS.md §5](DECISIONS.md), koji ima prednost. Novi tip paketa `personal_training`: termini se troše potvrdom održanog termina, a ne ulaskom. Pravila označena sa ⚠️ **POTVRDITI** su tehnički predlozi koji čekaju odluku vlasnika. Sistem ih čuva kao **podesive vrednosti** (`settings` / `membership_plans`), a ne hardkodira ih.

---

## 1. Članovi i nalozi

1.1. **Član (member)** i **korisnički nalog (auth user)** su odvojeni entiteti. Recepcija može da kreira člana bez naloga u aplikaciji (npr. starija osoba bez smartfona).

1.2. Povezivanje člana sa nalogom ide na jedan od dva načina:

- **Pozivnica:** recepcija kreira člana sa email-om, sistem šalje link (Resend), član postavlja lozinku i nalog se automatski povezuje.
- **Kod za povezivanje:** član se sam registruje, a recepcija mu na licu mesta izdaje 6-cifreni kod (važi 15 min, jednokratan) koji unosi u aplikaciju.

⚠️ **POTVRDITI:** da li član koji se sam registruje, a nema članarinu, vidi samo javni sadržaj i opremu? (Predlog: da.)

1.3. Automatsko povezivanje samo po podudaranju email-a **nije dozvoljeno**, jer bi omogućilo preuzimanje tuđeg članskog profila.

1.4. Deaktivacija člana je soft delete (`deactivated_at`). Istorija uplata i dolazaka ostaje zbog evidencije.

1.5. Zahtev za brisanje naloga: lični podaci se anonimizuju u roku od 30 dana ⚠️, a finansijski zapisi se čuvaju anonimizovani onoliko koliko propisi zahtevaju ⚠️ **POTVRDITI sa knjigovođom**.

## 2. Članarine

### 2.1. Životni ciklus (čuva se u bazi kao `state`)

`pending` → `active` → (`paused` ↔ `active`) → `cancelled`

- `pending`: dodeljena, ali nije plaćena ili nije počela (početak je u budućnosti).
- `active`: plaćena, u toku.
- `paused`: odobrena pauza je u toku.
- `cancelled`: ručno otkazana (uz razlog i audit).

### 2.2. Prikazni status (računa se, **ne čuva se**)

Računa ga funkcija `membership_display_status()` u bazi, koju koristi samo API:

| Uslov (redom, prvi koji važi)                                                             | Status            |
| ----------------------------------------------------------------------------------------- | ----------------- |
| `state = cancelled`                                                                       | **Cancelled**     |
| `state = pending`                                                                         | **Pending**       |
| `state = paused` i danas je unutar pauze                                                  | **Paused**        |
| danas > `end_date` **ili** `visits_remaining = 0`                                         | **Expired**       |
| `end_date − danas ≤ expiring_soon_days` **ili** `visits_remaining ≤ expiring_soon_visits` | **Expiring Soon** |
| inače                                                                                     | **Active**        |

- "Danas" se računa u zoni `Europe/Belgrade`. Članarina važi **zaključno sa** `end_date`.
- ⚠️ **POTVRDITI:** `expiring_soon_days` (predlog 7) i `expiring_soon_visits` (predlog 2).

### 2.3. Preklapanje

- Član može imati više članarina (npr. teretana + boks paket), ali **ne dve aktivne članarine istog plana sa preklapajućim periodom**. Ovo obezbeđuje exclusion constraint.
- Obnova pre isteka: nova članarina počinje dan posle `end_date` prethodne ⚠️ **POTVRDITI** (alternativa: počinje odmah).

### 2.4. Pauza

- Pauzu odobrava zaposleni sa dozvolom `memberships.pause`. Član samo šalje zahtev.
- Pauza produžava `end_date` za broj dana pauze. Za pakete na broj dolazaka produžava se samo datumski rok, ako postoji.
- Broj pauza (`max_pauses`) i ukupno dana pauze po članarini (`max_pause_days`) postavlja se na paketu u adminu; 0 znači da paket ne nudi pauzu. Član bira samo današnji ili kasniji dan; pauze se ne preklapaju; prevremeni završetak vraća neiskorišćene dane (F13-2).

### 2.5. Član ne može sam menjati status, datume ni broj dolazaka. Te kolone nemaju UPDATE politiku za člana, a API ih ne izlaže.

## 3. Uplate

3.1. Evidencija uplate **nije fiskalni račun**. UI na svakom ekranu za uplate prikazuje napomenu: "Interna evidencija - fiskalni račun se izdaje na kasi."

3.2. Iznos se čuva u parama (`integer`), valuta je RSD ⚠️ (EUR za strance?).

3.3. Uplata se ne briše niti menja posle unosa. Ispravka ide kroz **storno** (`status = voided`, uz razlog) ili kroz **refund** (nov zapis sa negativnim smerom). Sve se audituje.

3.4. Dugovanje: članarina može biti dodeljena sa `paid_amount < price`. Saldo se računa, ne čuva se. ⚠️ **POTVRDITI:** da li član sa dugovanjem može da uđe?

3.5. Popust se evidentira na uplati (iznos i/ili referenca na promo kod). Cena plana u trenutku prodaje kopira se u `memberships.price_amount` (snapshot), da kasnija promena cenovnika ne menja istoriju.

## 4. Dolasci (check-in)

4.1. Svaki pokušaj (uspešan i neuspešan) upisuje se u `attendance_attempts`.

4.2. Ulaz se **odobrava** ako važi sve od navedenog:

- token je validan, nije istekao i nije iskorišćen (QR), ili je zaposleni izabrao člana ručno;
- član ima bar jednu članarinu sa prikaznim statusom Active ili Expiring Soon;
- paket dozvoljava ulaz u ovom trenutku (vremenska ograničenja, ako postoje);
- za pakete na broj dolazaka važi `visits_remaining > 0`.

4.3. **Potrošnja dolaska:** jedan dolazak se troši najviše **jednom po poslovnom danu** po članarini. Ponovni ulaz istog dana (izašao do kafića pa se vratio) evidentira se, ali ne troši novi dolazak ⚠️ **POTVRDITI**.

4.4. Ako član ima više važećih članarina, troši se ona koja **najranije ističe** ⚠️ **POTVRDITI**.

4.5. **Ručno odobrenje** (override) je dozvoljeno samo uz dozvolu `attendance.override`, obavezan razlog (min. 5 karaktera) i audit zapis. Ne troši dolazak ⚠️.

4.6. **Rezervni postupak** ako je sistem nedostupan: recepcija vodi papirnu listu, a kasnije unosi dolaske ručno sa oznakom `source = backfill`.

4.7. Zone: u prvoj fazi check-in je na jednom ulazu (recepcija). Ograničenja zona (npr. paket samo za teretanu) prikazuju se recepciji kao informacija. Fizička kontrola zona nije u MVP-u.

## 5. QR token

- Važi **60 sekundi**. Aplikacija ga automatski osvežava na svakih 45 s dok je ekran otvoren.
- Jednokratan je: posle prve uspešne **ili odbijene zbog statusa** validacije označava se kao iskorišćen.
- Član može imati više važećih tokena istovremeno (npr. dva uređaja), ali je izdavanje ograničeno na 10 po minutu.
- Detalji: SECURITY.md §5.

## 6. Grupne aktivnosti i rezervacije (Faza 6)

- Kapacitet se proverava u transakciji sa zaključavanjem reda termina (`SELECT … FOR UPDATE`).
- Jedan član može imati jednu aktivnu rezervaciju po terminu (unique constraint).
- Lista čekanja je FIFO. Kada se mesto oslobodi, prvi sa liste se **automatski unapređuje** i dobija notifikaciju ⚠️ (alternativa: dobija ponudu koju potvrđuje u roku od X min).
- ⚠️ **POTVRDITI:** rok za otkazivanje bez posledica, posledice kasnog otkazivanja ili nedolaska, koliko unapred se otvara rezervacija, i da li grupni trening troši dolazak iz članarine.

## 7. Oprema i održavanje

- Status sprave: `available | maintenance | out_of_service`. Prijava kvara od strane člana **ne menja** status automatski, nego kreira zahtev koji zaposleni trijažira.
- Uklanjanje prostorije sa mape ne briše opremu. Sprava ostaje u registru bez pozicije na mapi.

## 8. Promocije (Faza 8)

- Promo kod ima: period važenja, ukupan limit, limit po članu, ciljnu grupu i dozvoljene planove.
- Iskorišćenje se upisuje atomično (unique (`promo_code_id`, `member_id`) kada je limit po članu 1).

## 9. Notifikacije

- Promotivne poruke se šalju samo uz `marketing_opt_in = true`. Transakcione poruke (isticanje, rezervacija) idu uvek, osim ako ih član isključi po tipu.
- Najviše **1 promotivna push poruka dnevno** po članu ⚠️.
- Svaka automatska poruka ima ključ za deduplikaciju (npr. `expiring:<membership_id>:7d`), pa se ista poruka ne šalje dvaput.
- Tihi sati: 22:00-08:00 (`Europe/Belgrade`) za nehitne poruke ⚠️.

## 10. Privatnost napretka

- Telesna težina, mere i fotografije napretka su **privatne podrazumevano**.
- Trener ih vidi samo ako je član njegov klijent (`trainer_clients.status = active`) **i** član je dao pristanak za konkretnu kategoriju (`member_consents`). Pristanak se može povući u svakom trenutku.
