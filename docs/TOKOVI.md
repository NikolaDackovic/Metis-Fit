# Kako ko koristi Metis Fit

Jedna aplikacija (Metis Fit) za članove i trenere, i admin (back office) za teretanu. Aplikacija i admin rade sa istim serverom (API); svaka teretana vidi samo svoje podatke.

## Član

1. **Nalog.** Član sam napravi nalog u aplikaciji (ime, email, lozinka). Nalog je njegov, ne pripada nijednoj teretani.
2. **Odmah koristi lično:** trening (dnevnik, plan, napredak), brojač kalorija i bar-kod, vodu, san i navike, merenja. To radi i bez teretane.
3. **Teretana se dodaje kasnije:**
   - na recepciji (recepcija ga upiše ili mu da kod, on ga unese u aplikaciji), ili
   - u aplikaciji: Više → Teretane → izabere teretanu i pošalje zahtev za članstvo.
4. **Kad je član teretane:** QR ulaz (dugme u sredini), članarina i plaćanja, rezervacije grupnih treninga, personalni termini sa trenerom, poruke treneru, kafić, mapa i sprave, garderoba, izazovi, kalendar telefona.
5. **Više teretana:** isti nalog u više teretana; teretanu menja u Profil → Teretana (ili Više → Teretane).

## Trener

- Koristi istu aplikaciju kao svaki član (svoj trening, ishrana).
- Dobija karticu **Posao** (umesto "Klub", koji je tada u "Više"): raspored dana (grupni i personalni), prisustvo jednim dodirom, klijenti i njihov napredak, plan ishrane za klijenta, poruke sa klijentima, svoji termini za personalne.
- Svako jutro dobija pregled dana; kada član zakaže ili otkaže termin, dobija obaveštenje.

## Vlasnik i osoblje (admin)

- **Admin je back office:** tu se otvara nalog teretane, podešavaju paketi i cene, raspored, treneri i njihovi termini, mapa i sprave, kafić, osoblje i dozvole.
- **Vlasnik prati:** Pregled (aktivni članovi, dolasci, uplate, grafikoni), Upozorenja (zahtevi, isticanje, dugovanja, pasivni članovi, rođendani, novi članovi; svaka stavka može da se skloni), izveštaji, ocene treninga i trenera.
- **Recepcija:** ulaz (skeniranje QR), članovi, uplate, garderobe, zahtevi iz aplikacije.
- Nova teretana se prijavljuje u adminu ("Otvori novu teretanu"); vlasnik platforme je odobrava, posle čega je vidljiva u aplikaciji.

## Server

- Admin i aplikacija rade sa istim API-jem; aplikacija bira teretanu zaglavljem `X-Club`.
- Tajne (ključevi, lozinke baze) su samo u `.env` na serveru.
