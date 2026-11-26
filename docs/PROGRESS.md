# GRIT DIGITAL CLUB - Dnevnik napretka

## F17-1 - Recepcijski režim (2026-11-26) · status: **završeno**

| Oblast            | Stanje                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Admin → Recepcija | Jedan ekran za pult: veliko polje (QR čitač ili kamera, ili ime, telefon, broj člana), kartica člana (paket, status, ističe, preostali dolasci, dug), velika dugmad: Zabeleži dolazak, Naplati dug ili Evidentiraj uplatu, Produži članarinu, Prodaj uslugu, Kafić, Garderoba, Rezerviši trening, Profil; Novi član (pa odmah članarina); Ceo ekran; desno ko je u klubu i današnji ulazi |
| Dozvole           | Svako dugme prati dozvole zaposlenog (vlasnik ih podešava u "Osoblje i prava", po ulozi); recepcija posle prijave odmah dolazi na ovaj ekran                                                                                                                                                                                                                                                            |

## F16 - Ispravke posle pregleda: registracija, "Više", tema, mape, upozorenja (2026-11-22) · status: **završeno**

Ko kako koristi sistem: [TOKOVI.md](TOKOVI.md).

| Oblast       | Stanje                                                                                                                                                                                                                            |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Registracija | Pravi samo Metis Fit nalog (ime, email, lozinka); više ne upisuje osobu automatski za člana prve teretane. Teretana se dodaje na recepciji ili u aplikaciji (Više → Teretane)                                                     |
| Vodič        | Prvi korak je izbor jezika; ostali koraci su na izabranom jeziku                                                                                                                                                                  |
| "⋯ Više"     | Nova kartica na kraju donje trake: profil, obaveštenja, poruke, brojač kalorija, kalendar telefona, teretane, izgled, jezik, podešavanja, vodič, uslovi i privatnost, odjava. Trener ima "Posao" u traci, a "Klub" mu je u "Više" |
| Izgled       | Svetla, Tamna ili Sistem (kao telefon), u Profilu i u "Više"; izbor se pamti na telefonu, aplikacija se kratko ponovo učita                                                                                                       |
| Mape         | Admin: "Sačuvaj i objavi" u jednom koraku (ranije su izmene ostajale nacrt koji članovi ne vide). Aplikacija: veći natpisi i prikaz preko celog ekrana sa pomeranjem                                                              |
| Upozorenja   | Svaka stavka (ističe, dugovanje, pasivan, rođendan, nov član) može da se skloni: 7 dana za ono što treba rešiti, 30 za vesti; bedž broji samo nesklonjeno. Migracija 051                                                          |
| Keš          | Web verzije aplikacije i admina ne keširaju HTML, pa se nova verzija vidi odmah                                                                                                                                                   |
| Repo         | Prvi git commit; bez potpisa alata u kodu, dokumentima i istoriji; naziv AI modela samo u `.env` na serveru                                                                                                                       |

### Testovi

api alert-dismiss +1; test prevoda dobio duži vremenski limit (bio je spor samo kada je računar opterećen)

## F15 - Pregled projekta, Profil i vodič (GoFitness), brojač kalorija (MyFitnessPal) (2026-11-22) · status: **završeno**

Ceo pregled i preporuke: [REVIEW.md](REVIEW.md).

| Oblast                  | Stanje                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Profil (F15-1)          | Jedno mesto za nalog i podešavanja: teretana, članstvo, prekidači obaveštenja, kalendar telefona, jezik, vodič, kontakt kluba, uslovi i privatnost, izvoz i brisanje naloga, odjava. Bez ponavljanja Početne; stari ekran "Podešavanja" vodi na Profil                                                                                                                                        |
| Vodič (F15-1)           | 5 koraka posle prve prijave (dobrodošlica, ulaz QR, trening, zdravlje i ishrana, gde je šta), "Preskoči", ponovo iz Profila; pamti se po nalogu na uređaju                                                                                                                                                                                                                                    |
| Pravno (F15-1)          | Uslovi korišćenja i politika privatnosti jasnim jezikom (sr, en, ru, ar; ostali jezici engleski); pravnik pregleda pre objave                                                                                                                                                                                                                                                                 |
| Brojač kalorija (F15-2) | Dnevnik: cilj − hrana = preostalo (krug), makro trake, obroci sa svojim "Dodaj", "Kopiraj od juče", voda. Dodavanje: pretraga (bez kvačica, bilo koja reč, srpski i engleski nazivi), Nedavno, Moje namirnice, porcije ili grami sa živim proračunom, brzi unos kalorija, nova namirnica sa etikete. Bar-kod kamerom ili upisom broja: moja namirnica, katalog, pa Open Food Facts (keširano) |
| Početna                 | Kartica "Kalorije danas" sa "+"; uklonjen dupli podsetnik za ishranu                                                                                                                                                                                                                                                                                                                          |
| API                     | GET /me/foods (pretraga ili nedavno + moje), GET /me/foods/:id, GET /me/foods/barcode/:code, POST/DELETE /me/foods, POST /me/food-log/copy; unos sa foodId + grami (server računa kalorije i makro)                                                                                                                                                                                           |
| Baza                    | Migracija 050: foods (katalog 142 namirnice, prosečne vrednosti na 100 g, lako se menjaju), food_log_entries.food_id i grams                                                                                                                                                                                                                                                                  |
| Ispravke                | QR ekran: veličina koda na uskim ekranima                                                                                                                                                                                                                                                                                                                                                     |

### Testovi

api foods +5 (pretraga bez kvačica i na engleskom; gram i porcija daju tačne vrednosti; moje namirnice privatne, makro ograničenje; Open Food Facts jednom pa iz keša, nepoznat bar-kod; kopiranje obroka)

## F14-8 - Treninzi i termini u kalendaru telefona (2026-11-22) · status: **završeno**

| Oblast     | Stanje                                                                                                                                                                                                                             |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Član       | Trening → Grupni → "Kalendar telefona": jednom napravi link i doda ga u kalendar (iPhone, Android, Google). Grupni treninzi (i lista čekanja kao "nepotvrđeno") i termini sa trenerom se tu pojavljuju i sami osvežavaju (oko 1 h) |
| Bezbednost | Link je tajni ključ: prikazuje se samo jednom, u bazi je samo njegov hash; novi link gasi stari, "Isključi" ga odmah gasi. Kalendar vidi 30 dana unazad i 60 unapred                                                               |
| API        | GET/POST/DELETE /me/calendar-feed, GET /public/calendar/:token/feed.ics (iCalendar). Rute sada mogu da vrate i odgovor koji nije JSON                                                                                              |
| Baza       | Migracija 049: calendar_feeds (izolacija po teretani)                                                                                                                                                                              |

Bez novih paketa u aplikaciji (koristi standardni kalendarski format umesto pristupa kalendaru telefona).

### Testovi

api calendar +2 (link se vidi samo jednom, kalendar sadrži samo moje termine; novi link gasi stari, isključivanje, lažni i neispravni linkovi odbijeni)

## F14-7 - Jutarnji pregled dana za trenera (2026-11-22) · status: **završeno**

| Oblast  | Stanje                                                                                                                                             |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trener  | Između 6 i 10 h obaveštenje i push "Tvoj dan: grupni N, personalni N" i kada je prvi termin; dodir otvara karticu Posao                            |
| Pravila | Jednom dnevno, samo kada trener tog dana ima nešto (grupni trening koji vodi ili zakazan termin sa članom); prati podešavanje "Treninzi i termini" |

### Testovi

api availability +1 (pregled samo ujutru, samo jednom, tačan broj termina)

## F14-6 - Podsetnik za personalni trening (2026-11-22) · status: **završeno**

| Oblast  | Stanje                                                                                                                                                                                                                                        |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Član    | Obaveštenje i push "Personalni trening {vreme}" dan ranije (samo ako je termin zakazan ranije od toga) i sat ranije. Važi za sve termine sa trenerom (personalni, konsultacije), i one koje zakaže član i one koje upiše trener ili recepcija |
| Pravila | Svaki podsetnik stiže samo jednom; otkazani termini se ne podsećaju; član može da isključi kategoriju "Treninzi i termini" u podešavanjima obaveštenja                                                                                        |

### Testovi

api availability +1 (podsetnik dan ranije samo za ranije zakazan termin, sat ranije, ime trenera u poruci)

## F14-5 - Admin podešava termine trenera, jednostavniji trening ekran (2026-11-22) · status: **završeno**

| Oblast | Stanje                                                                                                                                                                          |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Admin  | Treneri → trener (nudi personalne) → "Termini za personalne": dan, od-do, trajanje termina. Isto što trener podešava u aplikaciji (vlasnik i menadžer, dozvola trainers.manage) |
| Član   | Trening → grupni: "Moji termini" i "Moje rezervacije" su spojeni u jednu listu "Zakazano", po vremenu (grupni treninzi i personalni, sa "Otkaži" za personalne)                 |
| Član   | Umesto dva linka (Treneri, Zahtev za personalni) jedan: "Zakaži personalni trening" → trener → slobodan termin; zahtev ostaje kada trener nema slobodnih termina                |
| API    | GET/PUT /admin/trainers/:id/availability                                                                                                                                        |

### Testovi

api availability +1 (menadžer podešava termine treneru, trener ih vidi; član ne može da menja)

## F14-4 - Slobodni termini trenera i zakazivanje jednim dodirom (2026-11-22) · status: **završeno**

| Oblast      | Stanje                                                                                                                                                                                                                                               |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trener      | Posao → "Moji termini za personalne": po danima u nedelji upisuje periode (do 3 dnevno, npr. 16:00-20:00) i trajanje termina (30, 45, 60 ili 90 min)                                                                                                 |
| Član        | Treneri → "Zakaži termin": izbor dana (naredne 2 nedelje) i vremena, potvrda jednim dodirom. Ako trener nema slobodnih termina, nudi se postojeći zahtev za personalni                                                                               |
| Pravila     | Slobodni termini ne uključuju trenerove grupne treninge ni već zakazane termine, i počinju najranije 2 sata od sada. Najviše 4 zakazana termina po članu; otkazivanje iz aplikacije najkasnije 6 sati ranije (vrednosti su početne, lako se menjaju) |
| Obaveštenja | Trener dobija obaveštenje i push kada član zakaže ili otkaže termin; termin se odmah vidi u njegovom rasporedu                                                                                                                                       |
| Baza        | Migracija 048: tabela trainer_availability (izolacija po teretani), trainers.slot_minutes; dvostruko zakazivanje sprečava postojeće ograničenje preklapanja                                                                                          |

### Testovi

api availability +5 (bez perioda nema termina; svaki termin samo jednom; zakazan termin nestaje za sve i trener dobija obaveštenje; otkazivanje vraća termin; grupni trening blokira termin; kasno otkazivanje odbijeno; samo pravi slobodni termini; limit od 4)

## F14-3 - Poruke član i trener (2026-11-22) · status: **završeno**

| Oblast      | Stanje                                                                                                                                                                           |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Član        | Klub → "Poruke treneru" (vidi se kada član ima trenera, sa brojem nepročitanih): spisak trenera, razgovor u obliku mehurića, "viđeno" kod pročitanih poruka                      |
| Trener      | Posao → "Poruke": razgovori sa klijentima, nepročitane označene, odgovor iz aplikacije                                                                                           |
| Pravila     | Pisati mogu samo trener i njegov aktivni klijent; posle kraja saradnje prepiska ostaje za čitanje. Otvaranje razgovora označava poruke kao pročitane. Najviše 30 poruka u minuti |
| Obaveštenja | Nova poruka stiže kao obaveštenje i push (najviše jedno po razgovoru na 10 minuta, da ne zatrpava telefon); dodir otvara razgovor                                                |
| Osvežavanje | Otvoren razgovor proverava nove poruke na 5 s, spisak na 30 s                                                                                                                    |
| Baza        | Migracija 047: tabela messages (izolacija po teretani)                                                                                                                           |

### Testovi

api messages +3 (član piše, trener vidi nepročitano, čita i odgovara, obaveštenje; samo par trener-klijent; prazna poruka odbijena)

## F14-2 - Plan ishrane dan po dan, trener pravi plan u aplikaciji (2026-11-22) · status: **završeno**

| Oblast | Stanje                                                                                                                                                                                                             |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Član   | Plan ishrane: kartica "Danas po planu" (pojedeno obroka i kcal od cilja); uz svaku opciju "Pojeo/la sam" koje upisuje obrok u dnevnik ishrane (ponovni dodir briše); pojedeni obrok je obeležen                    |
| Trener | Posao → Klijenti → klijent → "Plan ishrane za klijenta": opis, obroci (naziv, vreme, do 3 opcije sa namirnicama, kcal, proteini), saveti; čuvanje i uklanjanje plana. Dostupno i kad klijent nije podelio napredak |
| Server | Postojeće rute (plan člana, dnevnik ishrane); pravo uređivanja ima samo trener tog klijenta ili menadžer                                                                                                           |

## F14-1 - Trener u aplikaciji (2026-11-22) · status: **završeno**

| Oblast         | Stanje                                                                                                                                                              |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ko vidi        | Tab "Posao" samo za nalog povezan sa profilom trenera (vlasnik bez profila trenera ga ne vidi). Trener inače koristi aplikaciju kao svaki član                      |
| Raspored       | Dani (danas + 6), grupni treninzi sa brojem prijavljenih, personalni termini sa "Održan" / "Nije došao" jednim dodirom                                              |
| Grupni trening | Spisak prijavljenih, prisustvo jednim dodirom (Došao / Nije došao, ponovni dodir poništava), lista čekanja                                                          |
| Klijenti       | Spisak klijenata; napredak klijenta (broj treninga, nedelje zaredom, poslednje merenje, ciljevi, rekordi, poslednji treninzi) samo ako je klijent uključio deljenje |
| Server         | Koriste se postojeće rute trenera (/admin/my-schedule, /admin/my-clients, /admin/members/:id/progress, prisustvo); treneru ne treba MFA                             |

## F13-8 - Ishrana po onome što član ne jede (2026-11-22) · status: **završeno**

| Oblast             | Stanje                                                                                                                                                                                                                                                                        |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ograničenja        | Nova: "Ne jedem ribu" i "Bez jaja" (uz vegetarijanac, vegan, bez mesa a jedem ribu, bez svinjetine, halal, bez laktoze, bez glutena, alergija na orašaste plodove)                                                                                                            |
| Primer plana kluba | Ograničenja sada važe i za primere plana (ranije samo za opcioni AI plan): opcije obroka sa namirnicama koje član ne jede se izbacuju, po rečima u nazivu i sastojcima (sr/en/ru); obrok kome ne ostane nijedna opcija ostaje uz savet da se namirnica zameni ili pita trener |

### Testovi

api diet-filter +3

## F13-7 - Ocene treninga i trenera (2026-11-22) · status: **završeno**

| Oblast     | Stanje                                                                                                                                                                                                                 |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Aplikacija | Početna: kartica "Kako je bilo?" za grupni ili personalni trening koji je završen (do 14 dana): 5 zvezdica jednim dodirom, komentar nije obavezan, "Kasnije". Treneri: prosečna ocena i broj ocena (od 3 ocene naviše) |
| Podsetnik  | 20 minuta do 3 sata posle grupnog treninga stiže obaveštenje "Kako je bio trening?" (jednom, samo ako još nije ocenjen, poštuje podešavanja obaveštenja)                                                               |
| Pravila    | Samo trening na kome je član bio upisan (potvrđen ili prisutan, termin nije otkazan) ili njegov personalni; posle završetka; jedna ocena po terminu                                                                    |
| Admin      | Treninzi → "Ocene": prosek po treneru i po vrsti treninga, poslednje ocene sa komentarima (ime i inicijal člana); dozvola reports.read                                                                                 |
| Privatnost | Brisanje naloga ili podataka člana briše i njegove ocene                                                                                                                                                               |
| Baza       | Migracija 046: tabela ratings (izolacija po teretani)                                                                                                                                                                  |

### Testovi

api ratings +4 (ocena jednom i nestaje sa liste; ne pre kraja i ne tuđi; proseci, komentari, recepcija ne vidi, prosek trenera javno; podsetnik jednom)

## F13-6 - Nalog je osoba svuda, ulaz skeniranjem, mapa, pretraga (2026-11-22) · status: **završeno**

| Oblast           | Stanje                                                                                                                                                                                                                                                                                                               |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ime iz naloga    | Nalog u aplikaciji je izvor imena: postojeći povezani članovi su preuzeli ime iz naloga (migracija 043); izmena imena u aplikaciji se prenosi u sve teretane; povezivanje naloga (kod, učlanjenje) preuzima ime naloga                                                                                               |
| Slika            | Recepcija vidi sliku: na profilu člana i u rezultatu ulaza (QR, ručno, odobrenje); slika teretane, a ako je nema slika iz naloga. QR ekran u aplikaciji prikazuje ime i sliku iz naloga                                                                                                                              |
| Pretraga         | Po imenu i prezimenu sa ili bez kvačica ("dackovic" nalazi "Dačković"), kao i po broju člana, email-u i telefonu                                                                                                                                                                                                     |
| Mapa             | Uzrok razlike: admin uređuje nacrt, članovi vide objavljenu verziju. Editor sada pokazuje traku "Članovi još vide staru verziju mape" sa "Objavi sada" (i za nesačuvane izmene); migracija 044 pamti objavljenu reviziju                                                                                             |
| Ulaz skeniranjem | Admin: Ulaz → "Ekran za ulaz (tablet)" (/kiosk, ceo ekran): kod se menja na 15 s i važi 30 s, potpisan, vezan za teretanu i vrata; posle skeniranja "Dobrodošao, Ime!" ili razlog odbijanja. Aplikacija: QR ekran → "Skeniraj kod na ulazu" (kamera), ista pravila kao na recepciji, zapis "Aplikacija (skeniranje)" |
| Bezbednost       | Kod druge teretane, istekao ili izmenjen se odbija; samo osoblje dobija kod; ograničen broj pokušaja po članu                                                                                                                                                                                                        |

### Testovi

api self-scan +4 (ulaz sa važećom članarinom i prikaz na ekranu; odbijanje bez članarine; istekao, lažan i kod druge teretane, član ne dobija kod; ime iz aplikacije u teretani i pretraga bez kvačica)

## F13-5 - Metis Fit natpis i jednostavnija navigacija (2026-11-21) · status: **završeno**

| Oblast     | Stanje                                                                                                                                                                                                                                                                                                                                   |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ime        | Metis Fit (naziv aplikacije, PLATFORM_NAME)                                                                                                                                                                                                                                                                                              |
| Natpis     | "\|\|\|Metis Fit\|\|\|": ime između tegova sa obe strane, kosi rez kroz M i F, Montserrat Black Italic pretvoren u putanje (packages/design-tokens/src/platform-wordmark.ts). Stoji na prijavi. Girja umesto tačke je probana i odbačena (na maloj veličini liči na katanac)                                                             |
| Znak       | Svuda gde je ikonica (aplikacija, splash, favicon, teretana bez loga) samo                                                                                                                                                                                                                                                               |     | M   |
| Navigacija | Traka: Početna · Trening · [QR za ulaz, istaknuto u sredini] · Zdravlje · Klub. Profil preko slike gore desno                                                                                                                                                                                                                            |
| Početna    | Članarina, sledeći trening i "Danas za tebe", gužva, izazovi                                                                                                                                                                                                                                                                             |
| Zdravlje   | Moja nedelja + Danas, Dnevnik ishrane, Plan ishrane, Aktivnosti, Napredak i merenja                                                                                                                                                                                                                                                      |
| Klub       | Članstvo i uplate (sa stanjem članarine), Kafić, Mapa i sprave, Treneri i personalni, Moj ormarić, Promeni teretanu; o klubu (radno vreme, adresa, telefon, galerija), poslednji dolasci                                                                                                                                                 |
| Funkcije   | Nijedna nije uklonjena; Istraži, Članstvo i Profil su sada ekrani sa strelicom nazad (iste adrese /explore, /membership, /profile, pa linkovi iz obaveštenja i dalje rade)                                                                                                                                                               |
| Alati      | tools/brand/make-icons.cjs (ikonice), tools/brand/wordmark.cjs (natpis)                                                                                                                                                                                                                                                                  |
| Trening    | Prvi deo je "Moj trening" (pa Grupni, Napredak). Na vrhu jedno glavno dugme "Započni trening" i Biblioteka vežbi; predlog za danas sa izborom fokusa/nivoa/vremena sklopljenim iza "Prilagodi", njegovo dugme sekundarno; istorija prikazuje 5 poslednjih uz "Prikaži sve"; Napredak bez duplikata (moja nedelja, ishrana su u Zdravlju) |

## F13-4 - Izazovi, novi METIS znak, preporuke uključene (2026-11-21) · status: **završeno**

| Oblast            | Stanje                                                                                                                                                                                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Izazovi (app)     | Početni ekran → "Izazovi": naziv ("12 dolazaka ovog meseca"), traka napretka, "+150 poena" ili "Ispunjeno", do kada traje period                                                                                                                       |
| Izazovi (pravila) | Broji se: dani sa ulazom, prisustvo na grupnim treninzima ili treninzi upisani u aplikaciji; period ova nedelja / ovaj mesec (Beograd). Cilj dostignut: poeni jednom po periodu + obaveštenje (i kad član ne otvara aplikaciju: posao u pozadini)      |
| Izazovi (admin)   | Lojalnost → "Izazovi": dodavanje, izmena, gašenje, brisanje; svoj naziv nije obavezan. Svaka teretana (i nova) počinje sa tri: 3 dolaska nedeljno (30), 12 dolazaka mesečno (150), 4 grupna treninga mesečno (100)                                     |
| Preporuke         | "Dovedi prijatelja" je sada podrazumevano uključeno: 200 poena za onoga ko preporuči, 100 za novog člana (vlasnik menja ili gasi)                                                                                                                      |
| METIS znak        | Novi znak po uzoru vlasnika: iskošeno "M" sa tegovima levo (veliki, srednji, mali) i kosim rezom kroz slovo; natpis Montserrat ExtraBold pod istim nagibom; boja #FF5A1F. Ikonica aplikacije sa narandžastim sjajem; ikonice se prave iz SVG-a (resvg) |
| Baza              | 041 podrazumevane vrednosti preporuka, 042 tabela challenges (izolacija po teretani), razlog poena "challenge", početni izazovi za svaku teretanu                                                                                                      |

### Testovi

api challenges +4 (tri početna izazova, menadžer menja, recepcija ne; cilj daje poene jednom i obaveštenje; posao u pozadini; ugašen izazov se ne prikazuje); referrals ažuriran (podrazumevano uključeno)

## F13-3 - Dovedi prijatelja (preporuke) (2026-11-21) · status: **završeno** (od F13-4 podrazumevano uključeno)

| Oblast      | Stanje                                                                                                                                                                                                                                        |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Aplikacija  | Članstvo → "Dovedi prijatelja": lični kod od 6 znakova (bez slova i brojeva koji se mešaju), "Podeli kod" (telefon: deljenje; web: deljenje ili kopiranje poruke), spisak dovedenih prijatelja i zarađeni poeni, polje "Imaš kod prijatelja?" |
| Pravilo     | Kod se upisuje pre prve uplate članarine; jedan prijatelj po članu; ne svoj kod. Sa prvom evidentiranom uplatom članarine oba dobijaju poene lojalnosti, jednom (okidač u bazi, važi za svaki način plaćanja)                                 |
| Obaveštenje | Onaj ko je preporučio dobija obaveštenje i push "Dobio si poene za preporuku"                                                                                                                                                                 |
| Admin       | Lojalnost → "Dovedi prijatelja": uključi, poeni za onoga ko preporuči i za novog člana, spisak preporuka (ko je koga doveo, stanje). Podrazumevano isključeno: iznos poena je odluka vlasnika                                                 |
| Privatnost  | Član vidi samo ime i inicijal prezimena prijatelja                                                                                                                                                                                            |
| Baza        | Migracija 040: members.referral_code, tabela referrals (izolacija po teretani), razlog poena "referral", okidač na uplatama                                                                                                                   |

### Testovi

api referrals +3 (isključeno dok vlasnik ne uključi, recepcija ne menja; kod, prva uplata daje poene oboma jednom, obaveštenje, pregled u adminu; svoj, nepostojeći, drugi kod i već plaćeno)

## F13-2 - Zamrzavanje (pauza) članarine (2026-11-21) · status: **završeno**

| Oblast      | Stanje                                                                                                                                                                                                                                         |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Aplikacija  | Članstvo → "Zamrzavanje članarine": preostali dani i broj pauza, spisak zahteva sa statusom, povlačenje zahteva koji čeka. Ekran zahteva: izbor prvog dana (narednih 21 dan), broj dana (+/-), prikaz novog kraja članarine, razlog            |
| Recepcija   | Upozorenja → "Zahtevi za pauzu" (Odobri / Odbij). Profil člana → članarina → "Pauze": istorija, odluka, "Završi danas" / "Otkaži pauzu", unos pauze koja je odmah odobrena                                                                     |
| Pravila     | Paket određuje broj pauza (max_pauses) i ukupno dana pauze po članarini (max_pause_days); 0 = paket ne nudi pauzu. Samo aktivna članarina sa datumom isteka, pauza počinje pre isteka, član ne bira prošle dane, pauze se ne preklapaju (baza) |
| Produženje  | Odobrenje pomera kraj članarine za broj dana pauze, zajedno sa unapred plaćenim članarinama koje se nastavljaju na nju; prevremeni završetak ili otkazivanje vraća neiskorišćene dane. Pauza samo za članarinu koja je počela                  |
| Ulaz        | Dok pauza traje status je "Pauzirana" (računa se, bez posla u pozadini) i ulaz se odbija sa razlogom "Članarina je pauzirana"                                                                                                                  |
| Obaveštenja | Član dobija obaveštenje i push kada je pauza odobrena ili odbijena (datumi u jeziku člana)                                                                                                                                                     |
| Dozvole     | memberships.pause: vlasnik, menadžer i sada recepcija (vlasnik može da je skine po ulozi)                                                                                                                                                      |
| Baza        | Migracija 039: decided_at, decision_note, zabrana preklapanja, membership_overview računa "paused"                                                                                                                                             |

### Testovi

api pauses +7 (unapred plaćena članarina se ne pauzira, a pomera se uz tekuću; zahtev i odobrenje sa produženjem i obaveštenjem; preklapanje, prošli dan, previše dana, previše pauza; paket bez pauze i tuđa članarina; pauza zatvara ulaz i vraćanje dana; povlačenje i odbijanje; dozvole)

## F13-1 - Gužva u teretani (2026-11-21) · status: **završeno**

| Oblast     | Stanje                                                                                                                                                                                                  |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Aplikacija | Početni ekran, kartica "Gužva u teretani": broj ljudi unutra sada, oznaka Slobodno / Umereno / Gužva, grafikon uobičajene gužve po satima za današnji dan (trenutni sat istaknut); osvežava se na minut |
| Pravilo    | Unutra = otvorene posete (ulaz otvara posetu; odjava ili automatsko zatvaranje posle visits.auto_close_hours je zatvara). Uobičajeno = isti dan u nedelji, poslednjih 8 nedelja, broj ljudi u :30       |
| Nivo       | Sa kapacitetom: do 40% slobodno, do 75% umereno, preko gužva. Bez kapaciteta: poređenje sa najprometnijim satom tog dana (tek kad postoji bar malo istorije)                                            |
| Admin      | Klub i izgled → "Gužva u teretani": prikaži članovima (da/ne) i kapacitet; zapis u dnevniku izmena                                                                                                      |
| Privatnost | Samo brojevi, nikad imena; javni odgovor je po teretani (X-Club) i kešira se 60 s                                                                                                                       |
| API        | GET /public/occupancy, GET/PUT /admin/busy-settings (settings.manage)                                                                                                                                   |

### Testovi

api occupancy +3 (broj sada i uobičajeno po satima bez imena, zaboravljena odjava se ne broji, samo radno vreme; kapacitet i skrivanje, recepcija ne može; nivoi)

## F12-7 - Novi naziv platforme METIS i novi znak (2026-11-21) · status: **završeno**

| Oblast          | Stanje                                                                                                                                                                                                |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Naziv           | METIS (domen već postoji); jedno mesto: packages/design-tokens/src/platform.ts                                                                                                                        |
| Znak            | Nacrtan, ne kucan fontom: sva slova na istoj mreži (ista debljina poteza, iste tri trake, isti razmak, isti nagib, zaobljen ugao gore-levo i dole-desno kao kod GRIT). Samo "M" je ikonica aplikacije |
| Aplikacija      | Naziv METIS, ikonice (iOS, Android adaptivna i jednobojna), splash i favicon novi; push kanal i rezervni naziv kluba više nisu GRIT. Unutar teretane GRIT i dalje stoji GRIT logo                     |
| Admin           | Ostaje GRIT-ov: GRIT logo na prijavi, naslov "GRIT Admin"                                                                                                                                             |
| API             | Bez sačuvanog profila teretane koristi se njen registrovani naziv, ne GRIT                                                                                                                            |
| Otvoreno        | Identifikator paketa u prodavnicama (rs.gritgym.app) menja se kad bude poznat domen METIS                                                                                                             |
| Izvorni fajlovi | assets/brand/metis-logo-orange.png, metis-app-icon.png                                                                                                                                                |

## F12-6 - Pozadinski poslovi, izvoz i brisanje po teretanama (2026-11-20) · status: **završeno**

| Oblast              | Stanje                                                                                                                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Obaveštenja         | Svako obaveštenje pamti teretanu (migracija 038, notifications.club_id). Automatska obaveštenja nastaju u teretani člana; push tekst koristi kratki naziv te teretane, ne GRIT za sve             |
| Podešavanja         | Podsetnik pre treninga čita broj sati iz podešavanja teretane kojoj trening pripada (setting_int_for)                                                                                             |
| Kasa u kafiću       | Ispravljena greška: slanje na kasu je čitalo podešavanja bez teretane. Sada svaka porudžbina ide samo na kasu svoje teretane, sa njenom adresom                                                   |
| Izvoz podataka      | Izvoz sadrži podatke člana iz trenutne teretane i, pod "otherGyms", iz svih drugih teretana u kojima je osoba član                                                                                |
| Brisanje u teretani | Vlasnik/menadžer briše člana na zahtev: anonimizuje se samo red u toj teretani. Nalog u aplikaciji se briše samo ako osoba nije član ni osoblje nigde drugde; inače nalog i druge teretane ostaju |
| Brisanje naloga     | Član koji briše nalog iz aplikacije: anonimizuje se red u svakoj teretani, svaka dobija svoj zapis u dnevniku. Osoblje bilo koje teretane ne može da obriše nalog iz aplikacije                   |
| Otvoreno            | Fotografije (media) i dalje u zajedničkim folderima; putanje su nasumične pa nema mešanja, razdvajanje po teretani kasnije uz skladište u oblaku                                                  |

### Testovi

api club-background +6 (obaveštenje u teretani člana i naziv te teretane u push-u; kasa samo svoje teretane; izvoz iz svih teretana; brisanje na recepciji ne briše nalog koji ima drugu teretanu; osoblje druge teretane ne briše nalog; brisanje naloga anonimizuje sve teretane)

## F12-4 - Brend platforme METIS i izbor teretane u aplikaciji (2026-11-20) · status: **završeno**

| Oblast                | Stanje                                                                                                                                                                                                                                                     |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Brend platforme       | Naziv METIS (na jednom mestu: packages/design-tokens/src/platform.ts; pre puštanja proveriti zaštitu imena). Znak: iskošeno "F" sa odvojenim blokom, narandžasta #E54E26, natpis u Syncopate kao GRIT; isti u adminu (SVG) i aplikaciji (react-native-svg) |
| Prijava               | Admin i aplikacija: uvek METIS logo i ista fotografija teretane u pozadini, bez obzira na teretanu; slogan "Treniraj pametnije". Ispravljeno: logo na prijavi u adminu je bio zatamnjen (sloj pozadine preko sadržaja)                                     |
| Logo teretane         | Otpremljen logo teretane; za GRIT ugrađeni GRIT logo; za novu teretanu bez loga METIS logo (admin meni, kartica članstva, porudžbina u kafiću). Polje "fotografija na prijavi" uklonjeno iz Klub i izgled                                                  |
| Teretane u aplikaciji | Ekran "Teretane": moje teretane (član/osoblje) sa označenom trenutnom, imenik aktivnih teretana sa pretragom po nazivu i gradu; izbor se pamti na telefonu i šalje kao X-Club; pri promeni se briše keš prethodne teretane                                 |
| Prečice               | Profil: "Teretana: X · Promeni"; početna (bez članstva): "Pronađi teretanu"                                                                                                                                                                                |
| Otvoreno              | Ikonica aplikacije i naziv u prodavnicama (app.json) i favicon admina su još GRIT; menja se uz pripremu za prodavnice                                                                                                                                      |

### Testovi

api clubs +1 (javni profil kaže koja je teretana osnovna, za izbor loga)

## F12-3 - Registracija teretane i odobravanje platforme (2026-11-20) · status: **završeno**

| Oblast            | Stanje                                                                                                                                                                                                                                                                                                                                                           |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Otvori teretanu   | Svaki prijavljeni korisnik (obrazac u adminu; i sa ekrana "nemaš pristup"): naziv, grad, adresa, telefon, email, adresa-link (pravi se iz naziva, ćirilica/š/ž/đ u latinicu). Teretana nastaje "na čekanju", osnivač postaje vlasnik, uloge i prava kopiraju se kao u GRIT-u, osnovni profil kluba popunjen; najviše 3 na čekanju po osobi, ograničenje pokušaja |
| Na čekanju        | Vlasnik odmah podešava sve u adminu (traka "čeka odobrenje"); javne rute, aplikacija i imenik je ne vide (404)                                                                                                                                                                                                                                                   |
| Platforma         | Nova uloga vlasnika platforme (tabela platform_admins; u dev bazi vlasnik@grit.local). Stranica "Platforma": na čekanju / aktivne / suspendovane, vlasnik i kontakt, broj članova; odobri, suspenduj (obavezan razlog; podrazumevana teretana se ne može suspendovati), ponovo aktiviraj; sve u reviziji                                                         |
| Imenik            | Javni spisak aktivnih teretana sa pretragom po nazivu i gradu (za aplikaciju u F12-4)                                                                                                                                                                                                                                                                            |
| Admin             | Izbor teretane u bočnoj traci kad osoba radi u više njih; ko nema ulogu u trenutnoj automatski prelazi u teretanu gde ima; izabrana teretana se šalje kao X-Club                                                                                                                                                                                                 |
| Radno vreme       | Nova teretana vidi svih 7 dana (zatvoreno) dok ne upiše svoje                                                                                                                                                                                                                                                                                                    |
| Migracija         | 037 (platform_admins, kontakt teretane, bootstrap_club, my_clubs, broj članova po teretani)                                                                                                                                                                                                                                                                      |
| Otvoreno za F12-4 | Nova teretana podrazumevano prikazuje GRIT logo; neutralan izgled platforme dolazi sa izborom teretane u aplikaciji                                                                                                                                                                                                                                              |

### Testovi

api club-registration +4 (osnivač postaje vlasnik i radi u adminu, a javnost ne vidi teretanu; samo platforma odobrava, posle toga je javna; suspenzija sa razlogom i ponovna aktivacija, podrazumevana se ne suspenduje; jedinstvena adresa i ograničenje na čekanju). Pravilo pristupa po adresi rute proširen za /platform.

## F12-2 - Lični podaci pripadaju nalogu (2026-11-20) · status: **završeno**

| Oblast           | Stanje                                                                                                                                                                                                                       |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lične tabele     | Treninzi (i setovi), merenja, ciljevi, dnevnik ishrane, aktivnosti, dnevni unosi: vlasnik je nalog (user_id), veza ka članstvu uklonjena; postojeći podaci preneti sa članstva na nalog (migracija 036)                      |
| Bez teretane     | Ceo lični deo radi i bez ikakvog članstva (trening kod kuće); u aplikaciji su dnevnik treninga, napredak i brze prečice otključani za svaki nalog                                                                            |
| Više teretana    | Isti podaci u svakoj teretani u kojoj je osoba član; "Moja nedelja": lično po nalogu, a časovi, dolasci i plan ishrane od trenera po članstvu u izabranoj teretani                                                           |
| Trener           | Vidi napredak samo preko klijenta u svojoj teretani i uz saglasnost; iz druge teretane nema pristup                                                                                                                          |
| Brisanje i izvoz | Lični podaci idu sa nalogom (brisanje naloga ih briše); izvoz uključuje lične podatke i bez članstva. Brisanje člana na recepciji i dalje briše i nalog (preispituje se u F12-6, jer nalog može da koristi i drugu teretanu) |
| Obaveštenja      | Nedeljni izveštaj i podsticaji broje treninge, aktivnosti i merenja po nalogu                                                                                                                                                |

### Testovi

api personal-data +4 (radi bez teretane; isti podaci u dve teretane; tuđi ne mogu da čitaju ni prepišu; trener samo preko klijenta u svojoj teretani i uz saglasnost). Postojeći testovi prilagođeni.

## F12-1 - Temelj platforme za više teretana (2026-11-20) · status: **završeno**

Plan i odluke: docs/F12_PLAN.md (teretane se same registruju uz odobrenje platforme, član može biti u više teretana, neutralan brend pa brend izabrane teretane).

| Oblast          | Stanje                                                                                                                                                                                                                                                                                                                |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Teretane        | Tabela clubs (slug, naziv, grad, status na čekanju/aktivna/suspendovana); GRIT je prva i podrazumevana                                                                                                                                                                                                                |
| Podaci teretane | club_id na 80 tabela (članovi, članarine, uplate, paketi, časovi, treneri, oprema, mapa, garderobe, kafić, usluge, osoblje, uloge, smene, poslovanje, podešavanja...); postojeći podaci prebačeni u GRIT bez menjanja istorije revizije                                                                               |
| Jedinstvenosti  | Po teretani: broj člana, nalog člana (jedna osoba može biti član u više teretana), ključevi uloga/zona/časova/usluga/garderoba, promo kodovi, podešavanja, radno vreme, PIB komitenta, neradni dani, šabloni ishrane                                                                                                  |
| Kontekst        | Svaki zahtev radi u jednoj teretani (zaglavlje X-Club: id ili slug; bez njega GRIT). Nepoznata ili suspendovana teretana: 404. Uloge i prava osoblja važe samo u toj teretani                                                                                                                                         |
| Izolacija       | API radi kao uloga grit_api koja ne zaobilazi RLS; restriktivna politika club_id = current_club_id() na svim tabelama teretane (i za anon/authenticated). Funkcije (podešavanja, prava, "moje članstvo", lojalnost, udeo trenera) gledaju samo trenutnu teretanu; e-mail naloga preko uske funkcije umesto auth.users |
| Migracije       | 034 (clubs, club_id, jedinstvenosti), 035 (uloga grit_api, politike, funkcije)                                                                                                                                                                                                                                        |

### Testovi

api clubs +5 (osoblje jedne teretane nema prava u drugoj; članovi, paketi i profil kluba ostaju u svojoj teretani, ni po ID-ju; ista osoba član dve teretane i "me" prati izabranu; nepoznata/suspendovana 404; sama baza odbija tuđe redove i upis u tuđu teretanu). Svih 635 API testova radi pod strogom ulogom.

## F11-4b - Vođenje (push), grafikon merenja, UX pregled (2026-11-20) · status: **završeno**

| Oblast                      | Stanje                                                                                                                                                                                                                     |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nova kategorija obaveštenja | "Vođenje i podsetnici" (coaching), član je isključuje u Obaveštenja; migracija 033                                                                                                                                         |
| Nedeljni izveštaj           | Ponedeljkom 08-11h: treninzi (svoji + časovi), dani dolazaka, minuti aktivnosti prošle nedelje; samo ako je bilo nečega, jednom nedeljno                                                                                   |
| Podsticaj za trening        | 17-19h, najviše jednom nedeljno: aktivna članarina, 5 dana bez treninga, dolaska, aktivnosti i bez zakazanog časa                                                                                                          |
| Podsetnik za merenje        | Subotom 09-12h, jednom mesečno, članovima koji se mere a poslednje merenje je starije od 30 dana                                                                                                                           |
| Grafikon merenja            | Linija kroz vreme za težinu, masno tkivo, struk, mišićnu masu, kukove, ruku (samo mere sa 2+ unosa), promena od prvog merenja; brojevi sa zarezom po jeziku                                                                |
| UX pregled                  | Svi ekrani na 390 px na srpskom i nemačkom bez izlaska van ekrana i bez neprevedenih ključeva. Ispravljeno: prekidači na vebu (zelenoplavi palac → boje brenda, zajednička komponenta Toggle), decimalni zarez u merenjima |

### Testovi

api notifications +3 (nedeljni izveštaj samo ponedeljkom ujutru i jednom; podsticaj posle 5 tihih dana, jednom nedeljno, poštuje isključivanje; mesečni podsetnik za merenje), render svih vrsta na 6 jezika. Postojeći testovi poslova dobijaju fiksno neutralno vreme.

## F11-4 - Aplikacija za člana: profil, podsetnici, omiljeni termini, QR bez interneta (2026-11-20) · status: **završeno (prvi deo)**

| Oblast           | Stanje                                                                                                                                                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Profil           | "Moje članstvo": trenutno u klubu X, paket, važi do datuma, još N dana, preostali dolasci, dugme Produži kad ističe/istekla. "Sledeći trening": najbliži rezervisan čas ili termin sa trenerom (i mesto na listi čekanja) |
| Danas za tebe    | Podsetnici sa prečicom: članarina ističe/istekla, blokirano zakazivanje, ove nedelje bez treninga, san i voda, dnevnik ishrane, novo merenje posle 30 dana                                                                |
| Omiljeni termini | Zvezdica na času (pamti vrstu časa na telefonu, po nalogu), tačka na danima sa omiljenim časovima, filter "Samo omiljeni"                                                                                                 |
| QR bez interneta | Rezervni jednokratni kod (12 h), čuva se bezbedno na telefonu, prikazuje se samo bez mreže; SECURITY.md §5a; migracija 032                                                                                                |
| UX               | Prazan prostor ispod trake sa datumima na ekranu Trening (horizontalni ScrollView se rastezao na vebu)                                                                                                                    |
| Već postojalo    | Napredak (statistika, nizovi nedelja, nedeljni grafikon, rekordi, ciljevi, merenja), Moja nedelja, lista čekanja i otkazivanje                                                                                            |

### Testovi

api access +1 (rezervni kod važi satima, jednom, novi poništava stari, bez članarine nema koda)

## F11-2 - Smene, izostanci, praznici, evidencija rada (2026-11-20) · status: **završeno**

| Oblast          | Stanje                                                                                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Smene           | Klub sam definiše smene (naziv, od-do, boja). Dugme "Dodaj tipične smene" (prva 07-15, druga 15-23, međusmena 11-19), vreme se menja posle             |
| Ko kad radi     | Jedan unos po zaposlenom: više redova (smena + dani), npr. Pon-Sre prva + Čet-Sub druga; od datuma, opciono do datuma. Isti dan ne može u dve smene    |
| Nedeljna tabela | Dani u kolonama, smene u redovima, imena obojena bojom smene, red "Odsutni", praznik u zaglavlju dana; navigacija po nedeljama i štampa                |
| Izostanci       | Godišnji, bolovanje, slobodan dan, praznik/slava, ostalo; ti dani se sami skidaju iz rasporeda                                                         |
| Neradni dani    | Praznici i dani kad klub ne radi (niko nije u rasporedu) ili samo napomena                                                                             |
| Moje smene      | Svaki zaposleni vidi svoju nedelju, dugme "Počni rad / Završi rad" i svoje sate u mesecu; recepcija može da uključi ceo raspored                       |
| Evidencija rada | Po mesecu: dani, sati, satnica, za isplatu i ukupno; ručni unos i brisanje prijava (beleži se). Zaboravljena odjava se zatvara posle 16 h              |
| Prava           | shifts.manage (vlasnik, menadžer), shifts.view (+ recepcija), shifts.own (svi zaposleni), payroll.read (vlasnik, menadžer); menja se u Osoblje i prava |
| Baza            | Migracija 031: shift_types, staff_shift_rules, staff_absences, club_closures, staff_time_entries, staff_pay_rates (samo API, bez pristupa klijenta)    |
| Garderobe (bug) | "Dodaj ormariće" je uvek otvaralo prvu (mušku) svlačionicu; sada kreće od otvorene i preračunava brojeve pri promeni                                   |

### Testovi

api shifts +6 (smene i prava, pravilo Pon-Sre/Čet-Sub gradi tabelu, izostanak i neradni dan skidaju ljude, trener vidi samo svoje, prijava/odjava, sati x satnica)

## F11-3 - Mapa sa pozadinskom slikom, opcija skrivanja (2026-11-19) · status: **završeno**

| Oblast            | Stanje                                                                                                                                                      |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pozadina sprata   | Admin ubacuje plan, skicu ili fotografiju odozgo (JPEG/PNG/WebP, smanjuje se u pregledaču na 2000 px). Sprat automatski dobija proporcije slike             |
| Prikaz prostorija | Po spratu: popunjene, samo ivice ili samo nazivi (slika već pokazuje zidove). Vidljivost pozadine 10-100%. Nazivi imaju tamnu senku da su čitljivi na slici |
| Skrivanje mape    | Dugme "Vidljiva članovima / Sakrivena od članova" (pravo map.publish). Sakrivena mapa: /public/map vraća null, aplikacija prikazuje samo katalog opreme     |
| Objava            | Pozadina i stil se kopiraju u objavljenu verziju (clone_map_version); istorija verzija ostaje                                                               |
| Baza              | Migracija 030: floors.background_path, background_opacity, room_style; podešavanje club.map_visible                                                         |
| Bezbednost        | Putanja pozadine samo map/ ili defaults/ (bez ../), proverava se stvarni potpis slike, recepcija ne može da menja mapu ni vidljivost                        |

### Testovi

api facility +2 (pozadina i stil stižu do objavljene mape, odbijena loša putanja i lažna slika, recepcija 403; skrivanje mape)

## F11-1 - Admin na laptopu, 9 jezika sa zastavama (2026-11-19) · status: **završeno**

| Oblast              | Stanje                                                                                                                                                                                                              |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Admin na laptopu    | Pun meni sa nazivima od 1024 px (w-56), sadržaj do 1600 px; u uplatama Povraćaj i Storno su ikone sa opisom. Provereno: 30 strana x 6 jezika (de, ru, fr, zh, es, it) na 1155x461 bez izlaska iz okvira             |
| Jezici              | Srpski, engleski, ruski, arapski + španski, nemački, francuski, italijanski, kineski. Podešavanja u adminu i aplikaciji: zastava i ime jezika na tom jeziku. Zastave su SVG (emoji zastave se ne vide na Windows-u) |
| Prevod novih jezika | Aplikacija za člana: svih 799 tekstova na es/de/fr/it/zh. Admin: svi admin tekstovi na es/de/fr/it/zh (0 ključeva fali). Arapski admin i dalje pada na engleski (aplikacija na arapskom je potpuna)                 |
| Sadržaj kluba       | Paketi, vežbe i opisi koje klub unosi ostaju na sr/en/ru/ar; novi jezici prikazuju englesku verziju                                                                                                                 |
| Baza                | Migracija 029: profil prima 9 jezika                                                                                                                                                                                |

### Testovi

translations +2 (novi jezici koriste samo postojeće ključeve i čuvaju sve {{promenljive}}; nemački admin je na nemačkom)

### Plan F11 (dogovor 2026-11-19)

- F11-1: admin na laptopu, 9 jezika sa zastavama (završeno)
- F11-2: nedeljni raspored smena osoblja, izostanci, praznici, prijava na posao i obračun po satnici (završeno; interne poruke osoblja ostaju za kasnije)
- F11-3: mapa sa pozadinskom slikom (kao Servio), opcija da se mapa ne prikazuje članovima (završeno)
- F11-4: aplikacija za člana: profil (članarina, sledeći trening, podsetnici), vođenje kroz zdrav život, napredak (grafikoni, rekordi, nedeljni izveštaj, nizovi), bolje zakazivanje (lista čekanja, otkazivanje jednim dodirom, omiljeni termini), QR i bez interneta

### Ideja F12 (korisnik, 2026-11-20): aplikacija za više teretana

Nalog člana pripada članu, ne teretani. Član bira teretanu (ili nijednu). Lični deo (ishrana, napredak, treninzi, merenja, navike) ostaje uvek njegov, i kad promeni teretanu ili trenira kod kuće. Članstvo, ulaz (QR), raspored, kafić i mapa vezani su za izabranu teretanu. Tehnički: jedan nalog + veza član-klub (više klubova kroz vreme), podaci kluba odvojeni po klubu (tenant), lični podaci bez kluba. Radi se posle F11, pre puštanja drugim klubovima.

## F10-2 - Javni sajt (2026-11-19) · status: **završeno**

| Oblast  | Stanje                                                                                                                                                                                                                                                |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sajt    | `apps/web` (Astro, statičke strane na sr `/`, en `/en/`, ru `/ru/`; port 4321). Isti brend kao aplikacija: crno-narandžasto, Syncopate naslovi (ruski Montserrat jer Syncopate nema ćirilicu)                                                         |
| Sekcije | Naslovna sa statusom „Otvoreno sada / zatvoreno, otvara se...“ (vreme kluba), zašto mi, prostor (fotografije iz admina), paketi i cene, raspored grupnih treninga za 7 dana, treneri, aplikacija, česta pitanja, kontakt i radno vreme, završni poziv |
| Podaci  | Ništa izmišljeno: naziv, slogan, kontakt, radno vreme, fotografije, paketi, treneri i raspored dolaze iz javnog API-ja i menjaju se u adminu (bez ponovne objave sajta). Tekstovi iz admina se ubacuju kao tekst, linkovi samo http(s)                |
| SEO     | Naslov i opis po jeziku, hreflang, canonical, Open Graph, podaci o klubu za pretraživače (schema.org HealthClub sa adresom, telefonom i radnim vremenom)                                                                                              |
| Prikaz  | Provereno na 390, 768 i 1440 px na sva tri jezika, bez izlaska iz okvira                                                                                                                                                                              |

### Testovi

web +6 (otvoreno / zatvoreno po vremenu kluba i sledeće otvaranje, nedelja od ponedeljka, raspored po danima bez otkazanih, telefonski link, odbijanje nebezbednih linkova)

## F10-1 - Brisanje naloga i izvoz podataka, priprema za prodavnice (2026-11-19) · status: **završeno**

| Oblast                | Stanje                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Brisanje naloga       | Aplikacija → Podešavanja → Privatnost → Obriši nalog: objašnjenje šta se briše a šta ostaje, potvrda upisom reči (OBRIŠI / DELETE / УДАЛИТЬ / حذف). Odmah se brišu treninzi, planovi, mere, ciljevi, dnevnik ishrane, navike, pristanci, fotografije, obaveštenja i nalog za prijavu; budući termini se otkazuju. Uplate, članarine, dolasci, kafić i usluge ostaju vezani za anonimnog „Obrisan član“ (knjigovodstvo) |
| Zaposleni             | Nalog zaposlenog se ne briše iz aplikacije (vlasnik ga deaktivira u adminu)                                                                                                                                                                                                                                                                                                                                            |
| Izvoz podataka        | Podešavanja → Privatnost → Preuzmi moje podatke: JSON sa nalogom, članstvom, uplatama, dolascima, treninzima, merama, ishranom, porudžbinama i obaveštenjima (web: fajl, telefon: deljenje)                                                                                                                                                                                                                            |
| Audit                 | Dnevnik izmena ostaje nepromenljiv; jedina dozvoljena izmena je uklanjanje veze ka obrisanom nalogu                                                                                                                                                                                                                                                                                                                    |
| Produkcija            | Brisanje naloga za prijavu ide preko Supabase Admin API-ja (service-role ključ samo na serveru)                                                                                                                                                                                                                                                                                                                        |
| Brisanje na recepciji | Admin → član → „Obriši lične podatke“ (vlasnik i menadžer, novo pravo `members.erase`), uz razlog; isto brisanje kao iz aplikacije, uključujući nalog u aplikaciji                                                                                                                                                                                                                                                     |
| Ko je poručio         | Porudžbina u kafiću prikazuje ime: član (porudžbina iz aplikacije ili skeniranjem QR koda dok je prijavljen) ili gost koji upiše ime (opciono). Na šanku je ime podebljano na vrhu svake porudžbine                                                                                                                                                                                                                    |
| Prodavnice            | docs/STORE.md: nacrt odgovora za Apple privacy labels i Google Data safety, spisak šta vlasnik treba da pripremi                                                                                                                                                                                                                                                                                                       |

### Testovi

api +4 (ime gosta i člana na porudžbini; brisanje na recepciji samo za vlasnika i menadžera, ne dva puta; izvoz sadrži sopstvene podatke; brisanje uklanja nalog, profil i lični dnevnik, član ostaje anonimizovan sa uplatom, audit bez veze ka osobi; zaposleni ne može da obriše nalog; audit i dalje odbija izmene)

## F9e - Poslovanje: komitenti, fakture sa PDV-om, kartica komitenta, popis; čišćenje oznaka (2026-11-19) · status: **završeno**

| Oblast                                 | Stanje                                                                                                                                                                                                                                                                                                                                                                         |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Poslovanje (jedna strana sa karticama) | Admin → Poslovanje: kartice kao u pregledaču (Dokumenti, Komitenti, Kartica komitenta, Popis, Finansije), a svaki otvoreni ili novi dokument dobija svoju karticu koja se zatvara sa ×                                                                                                                                                                                         |
| Komitenti                              | Naziv, PIB (9 cifara, jedinstven), matični broj (8 cifara), mesto, adresa, kontakt, telefon, email, oznake **Kupac** i/ili **Dobavljač**, aktivan. Tabela sa filterom u svakoj koloni                                                                                                                                                                                          |
| Dokumenti                              | Ulazna i izlazna faktura: komitent (pretraga po PIB-u ili nazivu, + za novog), broj dok., datum prometa, datum valute, napomena, interna napomena. Tabela stavki: naziv, JM (kom, kg, g, L, ml, m, pak, sat), količina, jed. cena bez PDV, rabat %, PDV % (20/10/0), iznos sa PDV. Zbir: iznos bez PDV, rabat, osnovica, PDV, iznos sa PDV. Plaćanje / naplata, storno, štampa |
| Ulaz i izlaz robe                      | Stavka sa nazivom artikla iz kafića: ulazna faktura povećava stanje, izlazna smanjuje (ne ispod nule); storno vraća. Ostale stavke su troškovi po kategoriji                                                                                                                                                                                                                   |
| Uvoz iz Excel-a                        | .xlsx ili .csv; obavezne kolone **Naziv, Količina, JM**, opciono Cena bez PDV, PDV %, Rabat %. Šablon se preuzima iz dokumenta. Greške se prijavljuju po redu                                                                                                                                                                                                                  |
| Kartica komitenta                      | Za period: svi dokumenti, ulaz (nabavka), izlaz (prodaja), dugujemo, potražujemo, saldo; klik otvara dokument                                                                                                                                                                                                                                                                  |
| Popis                                  | Stanje u sistemu, popisano, razlika; zaključen popis knjiži korekcije, istorija popisa                                                                                                                                                                                                                                                                                         |
| Finansije                              | Dodato: fakture kupcima u prihodima, ulazni i izlazni PDV, PDV za uplatu ili povraćaj, nenaplaćeno od kupaca. Troškovi su bez PDV-a                                                                                                                                                                                                                                            |
| Oznaka [PROVIZORNO]                    | Uklonjena iz svih podataka i tekstova koje vide članovi i osoblje (meni kafića, usluge, nagrade, opisi paketa, treneri, grupni treninzi). Sve ostaje izmenljivo u adminu; provizorne vrednosti se vode samo u dokumentaciji                                                                                                                                                    |
| Izgled admina                          | Pun meni sa nazivima od 1280 px (ispod toga uzan meni sa ikonama), sadržaj poravnat uz meni; provereno bez izlaska iz okvira na 390-1440 px                                                                                                                                                                                                                                    |

### Testovi

api +3 (komitent: uloga, PIB, duplikat; ulazna faktura sa rabatom i PDV-om, izlazna sa kontrolom stanja, storno, kartica i finansije; popis knjiži razliku), admin +4 (uvoz stavki iz CSV/Excel: kolone, brojevi, jedinice, greške po redu)

## F9d - Registracija, učlanjenje i produženje iz aplikacije, nabavka i finansije, podešavanja (2026-11-19) · status: **završeno**

| Oblast                    | Stanje                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Registracija              | „Registruj se“ radi i u razvoju (lokalni nalog, odmah prijava). Unose se ime, prezime, email, lozinka, a za nove članove i telefon i datum rođenja (opciono). Prekidač „Već sam član (imam kod sa recepcije)“ vodi na povezivanje kodom. Podaci postaju članski profil posle prve prijave (sa potvrdom emaila nalog ne postoji ranije)                                                          |
| Postani član              | Aplikacija: „Postani član“ (početna, članarina, profil) pravi članski profil bez recepcije. Ako je osoba već upisana na recepciji (isti email), aplikacija traži kod                                                                                                                                                                                                                            |
| Produženje članarine      | Aplikacija → „Produži članarinu“: izbor paketa, zahtev čeka na recepciji (stanje „na čekanju“, ne računa se kao dug), član može da povuče zahtev. Produženje počinje dan posle trenutne članarine. Plaćanje na recepciji, online plaćanja nema                                                                                                                                                  |
| Aktivacija                | Admin: Upozorenja → „Zahtevi iz aplikacije“ i kartica člana → „Aktiviraj“, uz uplatu (iznos, način) ili bez nje (ostaje dug). Ako je datum početka prošao, počinje danas                                                                                                                                                                                                                        |
| Nabavka i fakture         | Admin → Poslovanje → Nabavka i fakture: dobavljači (PIB, kontakt), ulazne fakture sa stavkama „Roba za kafić“ (povećava stanje, ulaz robe) i „Trošak“ po kategoriji (zakup, režije, oprema, održavanje, potrošni, usluge, marketing, plate, ostalo). Plaćanje, valuta i kašnjenje, storno (roba se skida sa stanja; nije moguć ako je roba već prodata). Izlaz robe su prodaje u kafiću i otpis |
| Finansije                 | Admin → Poslovanje → Finansije: po mesecu prihodi (članarine, usluge, kafić) i troškovi (fakture po kategoriji, udeo trenera), rezultat, neplaćene i zakasnele fakture. Pregled za vlasnika, ne zamenjuje knjigovodstvo                                                                                                                                                                         |
| Podešavanja               | Aplikacija: zupčanik na profilu (jezik, obaveštenja, odjava). Admin: tanak donji red menija (ime → Podešavanja, odjava), stranica Podešavanja sa jezikom i nalogom, pa se ceo meni vidi                                                                                                                                                                                                         |
| Greška posle nove verzije | „Failed to fetch dynamically imported module“ (stara kartica posle nove verzije admina) sada sama osveži stranicu jednom, a inače pokazuje dugme „Osveži stranicu“                                                                                                                                                                                                                              |
| Prava                     | Nova prava `purchases.manage` i `finance.read` (vlasnik i menadžer)                                                                                                                                                                                                                                                                                                                             |

### Testovi

api +4 (novi nalog postaje član, šalje zahtev, recepcija ga vidi i aktivira uz uplatu, zahtev nije dug; osoba upisana na recepciji mora da koristi kod; povlačenje zahteva; faktura sa robom podiže stanje, duplikat broja, finansije po kategoriji, plaćanje i storno vraća stanje)

## F9c - Izgled iz admina, osoblje i prava, raspored trenera, tekst u svim jezicima (2026-11-19) · status: **završeno**

| Oblast                | Stanje                                                                                                                                                                                                                                                                                                                           |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Boje                  | Klub i izgled → Boje: glavna boja i boja pozadine (pozadina mora biti tamna, provera kontrasta). Iz jedne boje se računa cela paleta. Admin menja boje odmah; aplikacija pri sledećem pokretanju (web se odmah osveži). Uz logo, fotografiju na prijavi i galeriju, sve vizuelno se menja iz admina                              |
| Osoblje               | Klub → Osoblje i prava: dodavanje zaposlenog (pozivnica emailom preko Supabase, ključ samo na serveru; u razvoju lokalni nalog), uloge, povezivanje sa profilom trenera, deaktivacija (pristup prestaje odmah). Zaštite: ne menjate svoje uloge, vlasnika dodeljuje samo vlasnik, uvek ostaje bar jedan vlasnik                  |
| Uloge i prava         | Matrica prava po ulozi (47 prava, grupisana, prevedena), nove uloge (npr. „Šef kafića“) sa kopiranjem prava druge uloge, brisanje neiskorišćene. Uloga vlasnika je zaključana. Prava menja samo vlasnik                                                                                                                          |
| Raspored trenera      | Moj raspored (trener): nedelja sa grupnim treninzima koje vodi i terminima (personalni, konsultacija, procena, sastanak), novi termin, održano / otkazano. Raspored trenera (recepcija, menadžer): svi treneri ili jedan. Trener nikad nema dva termina u isto vreme. Član dobija obaveštenje i vidi „Moji termini“ u aplikaciji |
| Tekst u svim jezicima | Automatska provera na ruskom (najduže reči) svih 28 strana admina na 1366 i 390 px i 15 ekrana aplikacije na telefonu: nijedan tekst ne izlazi iz okvira. Ispravke: elementi mreže smeju da se skupe (min-width 0), dugmad i oznake skraćuju predugačak tekst sa „…“, zaglavlja kartica prelaze u novi red, duge reči se lome    |
| Ispravka              | Lista osoblja je kod jednog korisnika vraćala prvog zaposlenog (prioritet „or“ u SQL-u). Ispravljeno, test to proverava                                                                                                                                                                                                          |

### Testovi

api +4 (dodavanje osoblja i trenutno dejstvo uloge i deaktivacije, zaštite vlasnika i sopstvenog naloga, matrica prava i prilagođene uloge, raspored trenera sa preklapanjem i obaveštenjem članu), design-tokens +3 (paleta iz jedne boje, tamna pozadina, mobilna primena)

### Napomena za ovaj računar

Sa 3,4 GB RAM-a admin se za pregled služi kao gotov build (apps/admin/dist-preview, port 5180), ne preko Vite dev servera koji učitava stotine fajlova i ruši pregledač.

## F9b - Usluge, udeo i zarada trenera, potvrde o uplati (2026-11-19) · status: **završeno**

| Oblast           | Stanje                                                                                                                                                                                                                                                                                            |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cenovnik usluga  | Admin (Recepcija → Usluge → Cenovnik): naziv na 4 jezika, cena, trajanje, da li je izvodi trener/terapeut, podrazumevani udeo trenera (% ili fiksno RSD). [PROVIZORNO] početne usluge: dnevna karta, InBody, sportska masaža, peškir                                                              |
| Prodaja          | Recepcija prodaje uslugu članu ili gostu (bez člana), bira ko je izvodi i način plaćanja. Lista prodaje za danas sa prometom; poništavanje samo za menadžera (ostaje zapisano, ne računa se)                                                                                                      |
| Udeo trenera     | Tabela trener × usluga: svoj udeo ili podrazumevani. Udeo se **zapamti u trenutku prodaje**, pa promena stope ne menja prošle obračune. Personalni treninzi: posebna stavka „Personalni trening (sesija)“, udeo od vrednosti jedne sesije (cena paketa / broj sesija), računa se pri upisu sesije |
| Zarade           | Admin (Treninzi → Zarade trenera): po mesecu i treneru, personalne sesije i usluge sa udelom, ukupno, štampa. Trener sa nalogom vidi samo svoju zaradu (Moja zarada)                                                                                                                              |
| Potvrda o uplati | Štampa potvrde za uplate članarina i prodaje usluga, sa napomenom „Ovo nije fiskalni račun“                                                                                                                                                                                                       |
| Aplikacija       | Tab Članarina: „Usluge i cene“ (plaća se na recepciji)                                                                                                                                                                                                                                            |

### Testovi

api +3 (javni cenovnik bez interne stavke, udeo zapamćen pri prodaji i nepromenjen posle promene stope, gost bez udela, poništavanje samo menadžer i izostaje iz zarade; personalna sesija sa udelom od vrednosti sesije, trener vidi samo svoju zaradu)

## F9 - Kafić: meni, stanje, poručivanje QR kodom sa stola, veza sa kasom (2026-11-18) · status: **završeno**

| Oblast               | Stanje                                                                                                                                                                                                                                                                                                                                                                |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Meni i stanje        | Admin (Kafić → Meni i stanje): kategorije i artikli na sr/en/ru/ar, cena, fotografija, dostupnost, šifra u kasi, praćenje stanja sa upozorenjem na malo stanja. Promene stanja: prijem robe, otpis, popis; sve u dnevniku kretanja. Recepcija i osoblje kafića mogu da menjaju stanje, cene samo vlasnik i menadžer (audit)                                           |
| Stolovi i QR         | Svaki sto ima svoj nasumični QR kod (štampa iz admina, kod može da se zameni ako se stari zloupotrebi). Gost skenira, otvara se meni na webu (bez naloga), poruči i plaća na šanku. Ograničenje poručivanja po IP adresi                                                                                                                                              |
| Aplikacija           | Član poručuje iz aplikacije (brza akcija Kafić): preuzimanje na šanku ili za sto, i prati status (primljeno → priprema → spremno)                                                                                                                                                                                                                                     |
| Šank                 | Tabla porudžbina (nove / u pripremi / spremne), osvežava se sama: dalje u pripremu, spremno, posluženo, naplata (gotovina, kartica, prenos), otkazivanje neplaćene uz razlog (stanje se vraća). Porudžbina na šanku sa naplatom odmah. Pregled dana sa prometom po načinu plaćanja                                                                                    |
| Stanje               | Porudžbina uzima stanje pod zaključavanjem: nikad se ne proda više nego što ima                                                                                                                                                                                                                                                                                       |
| Kasa i fiskalizacija | Sistem ne izdaje fiskalne račune. Režim „bez veze“ (račun se izdaje ručno na kasi) ili „webhook“: plaćena porudžbina se šalje kasi kao JSON potpisan HMAC-SHA256 (X-GRIT-Signature, ključ CAFE_POS_SECRET samo u .env), id porudžbine je ključ protiv duplikata. Neuspešna slanja se ponavljaju na 5 minuta (do 10 puta), status po porudžbini i ručno ponovno slanje |
| Početni meni         | [PROVIZORNO] 5 artikala i 3 stola, da ekrani ne budu prazni                                                                                                                                                                                                                                                                                                           |

### Testovi

api +5 (javni meni i sto iz QR koda, porudžbina gosta sa praćenjem preko tokena, naplata i zabrana otkazivanja plaćene, nikad više od stanja i vraćanje stanja, prava pristupa, slanje kasi sa potpisom i ponovnim pokušajem)

## F8-4 - Više za člana: aktivnosti van teretane, dnevne navike, moja nedelja (2026-11-18) · status: **završeno**

| Oblast        | Stanje                                                                                                                                                                                                                           |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Aktivnosti    | Trčanje, šetnja, bicikl, plivanje, planinarenje, joga, timski sport, borilačke veštine, drugo: trajanje, razdaljina, intenzitet. Kalorije su procena (MET × težina × vreme, težina iz poslednjeg merenja). Privatno (RLS)        |
| Danas         | Voda (+250 ml), san, koraci, raspoloženje i energija (1-5), prethodni dani, grafikon za 14 dana. Ciljevi su podešavanja habits.* (2,5 L, 8 h, 8000 koraka)                                                                       |
| Moja nedelja  | Na vrhu Napretka: aktivni dani (Pon-Ned), treninzi i grupni, aktivnosti, dolasci, prosek sna i koraka, dani sa dovoljno vode, prosek kalorija prema cilju, promena težine                                                        |
| Početni ekran | Brze akcije: Danas, Aktivnost, Ishrana, Trening                                                                                                                                                                                  |
| Ispravke      | Biblioteka vežbi se zaglavljivala (beskonačno osvežavanje kada nema treninga u toku). Test član nije dobijao članarinu (posle zamene crta u nazivu paketa), pa nije bilo ni QR dugmeta. Oba ispravljena i proverena u pregledaču |

### Testovi

api +3 (aktivnosti sa procenom kalorija i privatnošću, dnevne navike bez budućih dana, nedeljni pregled iz svih izvora)

## F8-3 - Arapski jezik (RTL) i „Klub i izgled“ (2026-11-18) · status: **završeno**

### Šta radi

| Oblast        | Stanje                                                                                                                                                                                                                                                                                                                               |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Jezici        | sr, en, ru i **ar** u izboru jezika na oba mesta: admin (5180, prijava i meni) i aplikacija (8081, prijava i profil)                                                                                                                                                                                                                 |
| Arapski       | Sve što član vidi (aplikacija, poruke o greškama, provere unosa) prevedeno je na arapski, sa svih šest arapskih oblika množine. Admin na arapskom radi zdesna nalevo, a tekstovi osoblja su za sada na engleskom. Brojevi su zapadne cifre (DECISIONS §5)                                                                            |
| Zdesna nalevo | Ceo raspored se okreće (meni, redovi, strelice), slova se ne razmiču (bez letter-spacing), font IBM Plex Sans Arabic u adminu. Na telefonu promena smera traži ponovno pokretanje aplikacije (poruka korisniku); na webu se stranica sama osveži                                                                                     |
| Sadržaj kluba | Paketi, vežbe i termini nemaju arapski prevod, pa se za arapski prikazuju na engleskom (ne na srpskom)                                                                                                                                                                                                                               |
| Klub i izgled | Novi ekran u adminu (Klub → Klub i izgled, vlasnik i menadžer): pun i kratak naziv, slogan na 4 jezika, telefon, email, adresa, sajt, Instagram, Facebook, radno vreme po danima, **logo**, **fotografija na prijavi** (ostaje sala kao do sada, može se promeniti) i **galerija** (dodavanje, opis na 4 jezika, redosled, brisanje) |
| Bez ugrađenog | Aplikacija i admin uzimaju naziv, logo, fotografije i kontakt iz ovih podešavanja. Svaki tekst koji pominje klub („Tvoj GRIT“, „GRIT poeni“) koristi kratak naziv kluba. Dok se ništa ne promeni, sve izgleda kao do sada (ugrađeni GRIT logo i fotografije)                                                                         |
| Ispravka      | Web verzija aplikacije je posle prijave ostajala prazna (push funkcija koja ne postoji na webu). Ispravljeno                                                                                                                                                                                                                         |

### Testovi

translations +1 (arapski pokriva sve ključeve za članove, svih 6 oblika množine, admin pada na engleski), api +3 (klub: podrazumevane fotografije, izmena podataka i radnog vremena samo za menadžera, logo i fotografija na prijavi, galerija)

## F8-2 - Promo kodovi i program lojalnosti (2026-11-18) · status: **završeno**

### Šta radi

| Oblast               | Stanje                                                                                                                                                                                                                                                                                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Promo kodovi         | Admin (Sadržaj aplikacije → Promo kodovi): procenat ili fiksni iznos, važenje od/do, ukupno korišćenja, po članu, samo za izabrane pakete, uključen/isključen. Tabela pokazuje korišćenja i ukupan dati popust                                                                                                                                         |
| Primena na recepciji | U prodaji članarine polje „Promo kod“ + „Proveri“ (pregled popusta i iznosa za naplatu, ništa se ne menja). Cena članarine se čuva već umanjena, a zapis o iskorišćenom kodu čuva originalnu cenu i popust. Ograničenja se proveravaju pod zaključavanjem koda, pa poslednje korišćenje ne mogu dobiti dvojica. Popust nikad ne spušta cenu ispod nule |
| Akcije u aplikaciji  | Javni kodovi (sa naslovom na sr/en/ru) se vide u aplikaciji, tab Članarina → „Akcije“, sa kodom koji član kaže na recepciji                                                                                                                                                                                                                            |
| Poeni                | Automatski u bazi (trigeri): **10 poena za dolazak** (jednom dnevno) i **1 poen na 100 RSD uplate**. Povraćaj i poništena uplata vraćaju poene. Svaki unos ima jedinstven ključ, pa se ništa ne računa dvaput. Vrednosti su `[PROVIZORNO]` podešavanja `loyalty.*`                                                                                     |
| Nivoi                | Bronza, Srebro (500), Zlato (1500) po poenima zarađenim za 12 meseci. Trošenje poena ne spušta nivo                                                                                                                                                                                                                                                    |
| Nagrade              | Katalog nagrada (Sadržaj aplikacije → Lojalnost), na sr/en/ru. Tri `[PROVIZORNO]` primera: šejk 150, gost na dan 300, personalni trening 800. Recepcija uručuje na profilu člana (tab Lojalnost), samo ako član ima dovoljno poena; menadžer može ručno dodati ili oduzeti poene uz razlog. Sve u audit logu                                           |
| Aplikacija           | Tab Članarina: GRIT poeni (stanje, nivo, napredak do sledećeg, nagrade, istorija)                                                                                                                                                                                                                                                                      |
| Marketing            | „Akcije i popusti“ u podešavanjima obaveštenja je **saglasnost** (zapisuje se u istoriju saglasnosti, može se povući). Obaveštenje „samo članovima koji žele akcije“ stiže samo njima                                                                                                                                                                  |

### Testovi

api +6 (popust i ograničenje po članu, paket, datum, ukupno korišćenja, popust ne ide ispod nule, javne akcije; poeni za dolazak jednom dnevno, uplata, povraćaj i poništenje; uručivanje samo uz dovoljno poena i ručna izmena samo za menadžera; marketinška poruka samo uz saglasnost)

## F8-1 - Obaveštenja, push i centar upozorenja (2026-11-18) · status: **završeno**

F8 je podeljen na tri dela: **F8-1** obaveštenja i upozorenja (ovo), **F8-2** promo kodovi i lojalnost, **F8-3** arapski i RTL.

### Šta radi

| Oblast                   | Stanje                                                                                                                                                                                                                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Obaveštenja u aplikaciji | Zvonce sa brojem nepročitanih na početnom ekranu, lista obaveštenja (otvaranje označava sve kao pročitano, dodir vodi na ekran o kome je reč). Tekst se prikazuje na jeziku člana (sr/en/ru), jer se čuva kao vrsta + parametri, ne kao gotov tekst                                  |
| Automatska obaveštenja   | Članarina ističe (7, 3 i 1 dan pre, osim ako je već kupljena sledeća), članarina istekla, podsetnik 2 h pre grupnog treninga (`notifications.class_reminder_hours`), mesto sa liste čekanja, otkazan termin, rođendanska čestitka. Posao radi na 5 minuta                            |
| Bez duplih poruka        | Svako automatsko obaveštenje ima ključ (npr. `expiring:<članarina>:7`) i jedinstveni indeks, pa ponovno pokretanje posla, ili više servera, nikad ne šalje isto dvaput. Uz to, Postgres advisory lock pušta samo jedan server da radi                                                |
| Podešavanja člana        | Članarina, grupni treninzi, vesti iz kluba i (na telefonu) push. Promotivne poruke stižu tek u F8-2, uz izričitu marketinšku saglasnost                                                                                                                                              |
| Push                     | Aplikacija registruje telefon (expo-notifications) i odjavljuje ga pri odjavi naloga. Server šalje preko Expo push servisa kada je `PUSH_PROVIDER=expo`, na jeziku člana, i briše uređaje koji više ne postoje. Podrazumevano `none`: sve stiže samo u aplikaciju                    |
| Obaveštenja članovima    | Vlasnik i menadžer šalju poruku svim članovima sa aplikacijom ili samo onima sa aktivnom članarinom (Sadržaj aplikacije → Obaveštenja). Istorija sa brojem primalaca, upis u audit log                                                                                               |
| Centar upozorenja        | Recepcija, Upozorenja: članarine koje ističu (7 dana), dugovanja, **pasivni članovi** (aktivna članarina, 30+ dana bez dolaska, `alerts.inactive_days`), rođendani (7 dana), novi članovi (7 dana, oznaka „bez članarine“). Klik vodi na profil člana, dugme za poziv. Broj u meniju |

### Za uključivanje push obaveštenja na telefonu

1. Napraviti EAS projekat (`eas init`) da bi `extra.eas.projectId` postojao u konfiguraciji aplikacije, i napraviti build (`eas build`). Expo Go ne prima push.
2. U `apps/api/.env` postaviti `PUSH_PROVIDER=expo` (i `EXPO_ACCESS_TOKEN` ako je u Expo projektu uključena zaštita push-a).

### Testovi

api +6 (bez duplih poruka pri ponovljenom poslu, podešavanja člana, push na jeziku člana i brisanje mrtvih uređaja, svi tekstovi bez praznih mesta, obaveštenja samo menadžer, centar upozorenja), classes +2 provere (mesto sa liste čekanja i otkazan termin stižu kao obaveštenje)

## F7c - Primeri ishrane, plan od trenera, dnevnik kalorija, predlog treninga, izmena profila (2026-11-18) · status: **završeno**

### Šta radi

| Oblast                  | Stanje                                                                                                                                                                                                                                                                  |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ishrana bez AI-ja       | Podrazumevano **nema AI odgovora**. Član vidi primer plana kluba za svoj cilj (mršavljenje, održavanje, masa), na sr/en/ru. Primere menja admin (Sadržaj aplikacije → Ishrana). AI ostaje samo kao mogućnost (`ANTHROPIC_API_KEY`), isključen dok se ne doda ključ      |
| Plan ishrane od trenera | Trener (za svoje klijente) ili menadžer pravi lični plan svakom članu, polazeći od primera ili praznog plana (profil člana → Planovi, ili Moji klijenti). Prioritet u aplikaciji: plan trenera, pa AI plan, pa primer kluba                                             |
| Dnevnik ishrane         | Član upisuje obroke (doručak, ručak, večera, užina) sa kcal i makronutrijentima, vidi dan prema svom dnevnom cilju iz čarobnjaka, listu „Nedavno“ za unos jednim dodirom i prethodne dane. Privatno: vidi ga samo član (RLS)                                            |
| Predlog treninga        | „Predlog za danas“ u Dnevniku treninga za članove koji treniraju sami: fokus (automatski bira odmorene mišiće), nivo, trajanje 30/45/60 min, jednim dugmetom pokreće trening. Pravila, bez AI-ja i bez interneta. Trener u adminu ima isto dugme „Predlog“ za dan plana |
| Admin po ulogama        | Meni je podeljen na Recepcija, Treninzi, Sadržaj aplikacije i Klub; svaka uloga vidi samo svoje stavke. „Vežbe“ su preimenovane u „Katalog vežbi“: admin ih kreira, članovi ih koriste u aplikaciji                                                                     |
| Profil                  | Član menja ime, prezime i profilnu sliku (600 px JPEG, provera tipa fajla na serveru). Slika se vidi i na početnom ekranu                                                                                                                                               |
| Fotografije kluba       | Galerija na početnom ekranu i fotografija u pozadini prijave u admin. Treneri bez potvrđenih imena su „Trener 2“ do „Trener 4“ dok vlasnik ne unese imena                                                                                                               |
| Stil teksta             | Bez dugih crta (—) u tekstovima aplikacije, admina, seed podataka i dokumentacije                                                                                                                                                                                       |

### Testovi

api +2 (dnevnik ishrane: idempotentan unos, zbir dana, izolacija između članova; izmena profila i slike), validation +3 (predlog treninga: determinističan, bez ponavljanja, izbegava skoro trenirane mišiće)

## F7b - Plan treninga od trenera, InBody mere, plan ishrane uz AI (2026-11-18) · status: **završeno**

### Šta radi

| Oblast        | Stanje                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plan treninga | Trener (samo za svoje aktivne klijente) ili menadžer piše plan: dani, vežbe, serije × ponavljanja, težina („75% 1RM“), pauza, napomena. Admin: „Moji klijenti“ → klijent, i profil člana → „Plan treninga“. Član u aplikaciji (Trening → Dnevnik → „Moj plan“) bira dan i jednim dugmetom pokreće trening sa već unetim vežbama i brojem serija. Plan ne zahteva pristanak za deljenje napretka                                                                                                                                                                                                                                                                              |
| InBody mere   | Visina, mišićna masa, voda u telu, visceralna mast, list; BMI se računa iz poslednje poznate visine                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Plan ishrane  | Čarobnjak u 4 koraka sa animacijama (cilj → telo → aktivnost → ishrana, ograničenja i želje). **Kalorije i makronutrijente računa server** (Mifflin-St Jeor, deficit najviše 20 % / 750 kcal, donja granica 1400/1600 kcal, bez deficita uz nizak BMI). **AI** predlaže primer jelovnika iz domaćih namirnica koji se uklapa u te brojeve: strukturisan JSON, ponovo proveren šemom, uz server-side rezervni model ako odbije zahtev. Bez `ANTHROPIC_API_KEY` član dobija samo ciljne vrednosti. Ispod 18 godina, uz zdravstveno stanje, trudnoću ili poremećaj ishrane: nema plana, savet da se obrati stručnjaku. Najviše 3 plana dnevno. Napomena „nije medicinski savet“ |

### Testovi: 426, svi prolaze (`pnpm check` 24/24)

api +7 (formula i bezbednosne granice, plan bez AI-ja, plan sa AI-jem dobija bezbedne ciljeve, maloletni i zdravstvena stanja odbijeni, dnevni limit, InBody i BMI, samo trener klijenta piše plan)

### Za uključivanje AI jelovnika

U `apps/api/.env` postaviti `ANTHROPIC_API_KEY` (ključ AI servisa kluba) i restartovati API. Model se menja preko `AI_NUTRITION_MODEL`.

## F8a - Recepcija+: odjava, „u klubu sada“ i ormarići (2026-11-17) · status: **završeno**

### Šta radi

| Oblast   | Stanje                                                                                                                                                                                                                     |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Poseta   | Svaki odobren ulaz (QR, ručni ili izuzetak) automatski otvara posetu (okidač u bazi). Ponovni ulaz istog člana ne pravi novu posetu                                                                                        |
| Odjava   | Član: „Izlazim“ u aplikaciji. Recepcija: „Odjavi“ na ekranu Ulaz. Zaboravljena poseta se zatvara sama posle 5 h (podešavanje `visits.auto_close_hours`)                                                                    |
| Ormarići | **Gost bira** slobodan ormarić u aplikaciji posle ulaska (muška ili ženska svlačionica, bira gost). Promena ormarića oslobađa prethodni. Odjava oslobađa ormarić. Gosti vide samo slobodno/zauzeto, nikad ko je u ormariću |
| Admin    | Ekran Ulaz: „Trenutno u klubu“ (broj, od kada, ormarić, odjava). Nova stranica **Garderobe**: mreža ormarića po svlačionici, ko je gde, oslobađanje, „van upotrebe“ sa napomenom, dodavanje opsega brojeva                 |
| Dozvole  | Pregled i oslobađanje: recepcija; dodavanje i servis ormarića: `lockers.manage` (vlasnik, menadžer, održavanje)                                                                                                            |

### Testovi: 410, svi prolaze (`pnpm check` 24/24)

database +4 (ulaz otvara jednu posetu, jedan ormarić po posetu, automatsko zatvaranje, privatnost) · api +5 (**dva gosta istovremeno biraju isti ormarić → tačno jedan dobija**, ormarić samo posle ulaska, odjava oslobađa, zamena, servis ormarića, recepcija vidi ko je unutra)

### Provizorno

- Broj ormarića (dev: 40 muških + 30 ženskih). Pravi broj se unosi u adminu: Garderobe → Dodaj ormariće.

## F7 - Vežbe, dnevnik treninga i napredak (2026-11-17) · status: **završeno**

### Šta radi (provereno uživo: trening bez API-ja → nastavak posle osvežavanja → sinhronizacija → rekordi)

| Oblast           | Stanje                                                                                                                                                                                                                                             |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Biblioteka vežbi | 34 vežbe (snaga, CrossFit, kardio, boks, mobilnost) sa nazivima i kratkim uputstvom na sr/en/ru, 13 mišićnih grupa, veza vežba ↔ sprava u klubu. Admin „Vežbe“: izmena, nova vežba, deaktivacija (vlasnik, menadžer, trener)                       |
| Dnevnik treninga | Kartica „Trening“ → „Dnevnik“: početak treninga, dodavanje vežbi, serije (kg × ponavljanja, vreme, distanca), kvačica za završenu seriju, nova serija se popunjava iz prethodne, procena 1RM uživo                                                 |
| Bez interneta    | Trening se čuva na telefonu (AsyncStorage) dok traje i dok se ne pošalje; ID-jevi se prave na uređaju. Slanje pri završetku, pri pokretanju i povratku u aplikaciju; „Čeka slanje“ u istoriji. Odjava prvo pokuša slanje, pa briše lokalne podatke |
| Napredak         | Ukupno / 30 dana / niz nedelja, grafikon po nedeljama, lični rekordi sa procenom 1RM, istorija po vežbi, mere tela, ciljevi (težina, težina na vežbi, treninga nedeljno, svoj cilj) sa trenutnom vrednošću                                         |
| Privatnost       | Sve je privatno. Trener vidi napredak **samo** ako je aktivni trener člana **i** član je uključio deljenje (pristanak se beleži kao istorija i može se povući). Svaki uvid trenera se upisuje u audit log. Recepcija nema pristup                  |
| Admin            | „Moji klijenti“ za trenere (napredak klijenata koji dele), dodela klijenata u profilu trenera                                                                                                                                                      |

### Testovi: 394, svi prolaze (`pnpm check` 24/24)

database +4 (biblioteka, privatnost dnevnika, pristup trenera samo uz odnos i pristanak, povlačenje pristanka, kraj saradnje) · api +9 (**isti trening poslat 3 puta i 2 paralelno → jedan zapis**, izmena serija, tuđi ID se odbija, brisanje se ne poništava starim slanjem, rekordi i 1RM, ciljevi, pristanak trenera) · mobile +4

### Usput ispravljeno

- Na webu su polja za unos imala podrazumevanu širinu, pa je red sa serijama izlazio van ekrana telefona.
- Vežbe su bile sortirane po kodovima znakova (č/ć/š/ž posle z). Sada se sortiraju po pravilima jezika.

### Ostaje (F7b, vidi PROTOTIP_ANALIZA.md)

- Plan treninga koji trener dodeli članu (po danima).
- Dodatne InBody mere (mišićna masa, voda, visceralna mast, visina/BMI).

## F6 - Treneri, grupni treninzi, rezervacije i personalni (2026-11-17) · status: **završeno**

### Šta radi (provereno uživo: raspored u adminu na ruskom, rezervacija u aplikaciji)

| Oblast           | Stanje                                                                                                                                                                                                                                                                                                                       |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Treneri          | Registar nezavisan od naloga: ime, zvanje i biografija na sr/en/ru, Instagram, „radi personalne“. Javni prikaz samo uz uključenu saglasnost; arhiviranje umesto brisanja                                                                                                                                                     |
| Vrste treninga   | CrossFit, boks, kik-boks (seed `[PROVIZORNO]`): boja, trajanje, kapacitet i **zona** - rezervisati može samo član čija članarina uključuje tu zonu                                                                                                                                                                           |
| Nedeljni plan    | Serije (dan, vreme, trener, prostorija, kapacitet) automatski prave termine 28 dana unapred, idempotentno. Izmena trenera/prostorije/kapaciteta važi za buduće termine; završetak serije briše prazne i otkazuje termine sa rezervacijama                                                                                    |
| Raspored (admin) | Nedeljni prikaz (kolone na desktopu, dani na telefonu), boja po vrsti, popunjenost i lista čekanja. Termin: spisak, „Došao / Nije došao“, upis člana pretragom, uklanjanje, izmena, otkazivanje sa razlogom (bez kazne za članove)                                                                                           |
| Rezervacije      | Kapacitet se proverava pod zaključavanjem reda termina; FIFO lista čekanja sa **automatskim unapređenjem** kada se mesto oslobodi ili poveća kapacitet. Prozor 7 dana, besplatno otkazivanje do 2 h, kasno otkazivanje i nedolazak = opomena, 3 opomene za 30 dana = blokada 7 dana. Sva pravila su podešavanja u `settings` |
| Personalni       | Član šalje zahtev (cilj, željeni termini, trener), najviše jedan otvoren. Osoblje vodi status i internu napomenu koju član ne vidi. Održani PT termini se upisuju na paket (troše termin), storno ga vraća                                                                                                                   |
| Aplikacija       | Nova kartica „Treninzi“: dani u nedelji, slobodna mesta, rezerviši / lista čekanja / otkaži (sa upozorenjem za kasno otkazivanje), moje rezervacije, obaveštenje o blokadi, treneri, zahtev za personalni                                                                                                                    |
| Dozvole          | `trainers.manage`, `classes.manage` (vlasnik, menadžer), `classes.roster` i `pt.manage` (+ recepcija, trener)                                                                                                                                                                                                                |

### Testovi: 339, svi prolaze (`pnpm check` 24/24)

database +7 (seed i idempotentno generisanje, lokalno vreme kluba, jedna živa rezervacija po terminu, RLS za rezervacije/trenere/PT) · api +17 (**8 paralelnih zahteva za 3 mesta → tačno 3 potvrđene i lista čekanja 1-5**, FIFO unapređenje, kasno otkazivanje, blokada posle 3 nedolaska, prozor rezervacije, kapacitet, otkazivanje termina, serije, PT zahtevi i termini, dozvole) · mobile +4

### Usput ispravljeno

- Test konkurentnosti je otkrio grešku u redosledu liste čekanja: `now()` je vreme početka transakcije, pa su dva zahteva koja čekaju isti lock dobijala pogrešan redosled. `bookings.created_at` sada koristi `clock_timestamp()`.
- RLS politika za prevode trenera nije smela da čita `trainers.is_public` (kolona nije dodeljena klijentima). Provera ide kroz `is_public_trainer()` (security definer).

### Ostaje

- Obaveštenje o unapređenju sa liste čekanja i podsetnik pred trening (push) stižu sa notifikacijama u F8. Do tada aplikacija prikazuje „Mesto se oslobodilo“.
- Pravi raspored, treneri (imena, fotografije, saglasnost) i cene unosi GRIT tim; `[DEMO]` treneri i `[PROVIZORNO]` raspored postoje samo u dev bazi.
- **Fotografije trenera:** otpremanje u adminu (sečenje na kvadrat 800×800 u browseru, API proverava pravi potpis fajla JPEG/PNG/WebP, najviše 1 MB). Lokalno se čuvaju u `apps/api/.tmp/media`; za produkciju treba Supabase Storage (isti `MediaStore` interfejs).
- Seed: Bojan Mačinković (Personal & CrossFit Coach, javno) sa `[PROVIZORNO]` biografijom; tri trenera sa timske fotografije su skrivena mesta dok ne stignu imena i saglasnost.

## F5 - Mapa, oprema i održavanje (2026-11-17) · status: **završeno**

### Šta radi (provereno uživo: vlasnik menja mapu na ruskom → član vidi promenu u aplikaciji)

| Oblast              | Stanje                                                                                                                                                                                                                                                                                             |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mapa (baza)         | Verzionisana: jedan nacrt, jedna objavljena, istorija arhiviranih. Objava pravi nepromenljivu kopiju (`clone_map_version`). Spratovi i prostorije sa nazivima/opisima na sr/en/ru, skrivene i privremeno nedostupne prostorije                                                                     |
| Šematska mapa       | Seed (samo dev/staging): 3 nivoa prema opisu vlasnika (ulaz → kafić, bašta desno, recepcija, ormarići, svlačionice, stepenice, toalet, boks, teretana, CrossFit, „bazen“ 20×5 skriven i označen „U izgradnji“). **Označena kao šematski prikaz** u adminu i aplikaciji                             |
| Editor mape (admin) | SVG editor: prevlačenje prostorija i promena veličine uz poravnavanje na mrežu, strelice za fino pomeranje, sprave kao tačke (pomeraju se zajedno sa prostorijom), dodavanje/brisanje spratova i prostorija, nazivi na 3 jezika, upozorenje o nesačuvanim izmenama, zaštita od istovremenih izmena |
| Oprema              | Registar nezavisan od mape (`ON DELETE RESTRICT`): kategorije, proizvođač, model, serijski/inventarski broj (interno), status, video link, opis/uputstvo/bezbednost na 3 jezika, arhiviranje umesto brisanja, lokacija na objavljenoj mapi                                                         |
| Održavanje          | Član prijavljuje kvar iz aplikacije (najviše 5/h). Prijava **ne menja** status sprave sama; osoblje trijažira (status, prioritet, napomena) i po potrebi u istom koraku menja status sprave. Sve se beleži u audit log                                                                             |
| Aplikacija          | Nova kartica „Istraži“: spratovi, interaktivna mapa, lista prostorija kao dugmad (pristupačnost), detalj prostorije sa opremom, katalog sa pretragom, detalj sprave sa uputstvom i prijavom problema                                                                                               |
| Dozvole             | `map.edit`, `map.publish`, `equipment.manage`, `maintenance.manage` (vlasnik/menadžer sve; uloga održavanje: oprema i održavanje; recepcija: održavanje)                                                                                                                                           |

### Testovi: 261, svi prolaze (`pnpm check` 24/24)

database +5 (samo objavljena verzija je javna, skriveni „bazen“ se ne vidi, serijski brojevi nisu dostupni klijentima, brisanje prostorije ili verzije ne briše opremu, jedan nacrt/jedna objava) · api +33 (lokalizovan katalog bez internih polja, nacrt → objava, zastarela revizija → 409, nepoznata oprema, duplirani ključevi, prijava ne menja status, trijaža, ograničenje prijava, dozvole po ulozi)

### Usput ispravljeno

- Sesija obrisanog naloga (profil više ne postoji) sada se automatski odjavljuje u aplikaciji i adminu, umesto da ostane u polu-prijavljenom stanju.
- `accessibilityRole` na SVG grupi se na webu pretvarao u `<button>` unutar SVG-a, pa se mapa nije iscrtavala. Dodir je premešten na prostoriju, a pristupačnost na listu prostorija.

### Ostaje

- Fotografije prostorija i sprava čekaju Supabase Storage (privatni/javni bucket, potpisani upload).
- Servisni dnevnik sprave postoji u bazi (`equipment_service_log`), a ekran u adminu dolazi kasnije.
- Pravi raspored objekta i spisak sprava unosi GRIT tim u adminu. Šematska mapa i `[DEMO]` sprave postoje samo u dev bazi.

## F4 - QR pristup i dolasci (2026-11-17) · status: **završeno**

### Šta radi (provereno uživo: aplikacija → QR → recepcija, na ruskom)

| Oblast            | Stanje                                                                                                                                                                                                                                                   |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| QR token          | `g1.<jti>.<potpis>`: 16 nasumičnih bajtova + HMAC-SHA256 (`QR_TOKEN_SECRET`), **bez ličnih podataka**. Važi 60 s (podešavanje `access.token_ttl_seconds`), jednokratan, čuva se u `access_tokens`. Izdaje se samo ako bi ulaz bio odobren                |
| Aplikacija        | Dugme „Pokaži QR kod“ (samo kada članarina važi) → ekran preko celog ekrana: beli QR sa tihom zonom, ime, paket, status, odbrojavanje, automatsko osvežavanje na 45 s, maksimalna osvetljenost (iOS/Android). Bez interneta nema QR-a, nego poruka       |
| Recepcija (admin) | Ekran „Ulaz“ (početni za recepciju): polje za USB skener sa stalnim fokusom (Enter = provera), kamera gde browser podržava BarcodeDetector, ručni ulaz pretragom, veliki zeleni/crveni rezultat sa zvukom, upozorenje o dugu, „Odobri ručno“ sa razlogom |
| Pravila ulaza     | Članarina mora da važi; paket na dolaske troši **jedan dolazak dnevno** (ponovni ulaz istog dana je besplatan, i posle poslednjeg dolaska); personalni paketi ne troše termin na ulazu; vremenski prozori; deaktiviran član je odbijen; dug ne blokira   |
| Bezbednost        | Atomično trošenje tokena (`UPDATE … WHERE consumed_at IS NULL`); zaključavanje članarina; dvostruko očitavanje istog koda na istom pultu u roku od 5 s vraća prvi rezultat; ograničenja: 10 tokena/min po članu, 60 provera/min po pultu                 |
| Evidencija        | **Svaki pokušaj** (i neispravan kod) ide u `attendance_attempts`; ručno odobrenje ide i u audit log. Stranica „Dolasci“ sa filterima; dashboard „Dolasci danas“ i grafikon sada imaju stvarne podatke                                                    |

### Novi API endpointi

`POST /me/access-token`, `POST /admin/access/validate`, `POST /admin/access/manual`, `POST /admin/access/override`, `GET /admin/attendance`.

### Testovi: 223, svi prolaze (`pnpm check` 24/24)

Novo (api +29): ispravan token prolazi jednom; ponovljen, istekao, izmenjen i besmislen token su odbijeni i zabeleženi; token izdat pre isteka članarine ne prolazi posle; **dva paralelna skena istog koda → tačno jedan ulaz**; dvostruko očitavanje; nema tokena bez važeće članarine ili bez povezanog naloga; ograničenje izdavanja; trošenje dolazaka i besplatan ponovni ulaz; personalni paket; vremenski prozor; deaktiviran član; upozorenje o dugu; ručno odobrenje (razlog, audit, bez trošenja, nedostupno treneru); član vidi samo svoje odobrene dolaske.

### Napomene

- Lokalno: `QR_TOKEN_SECRET` je generisan u `apps/api/.env`. Na serveru se postavlja kao tajna (najmanje 32 karaktera). Promena ključa poništava samo tokene koji su trenutno aktivni (žive 60 s).
- Kamera radi samo u browserima koji imaju BarcodeDetector (Chrome na Androidu/macOS-u). Na Windows-u recepcija koristi USB skener, što je i preporuka (D6).
- Na Windows-u zaustavljanje pozadinskog zadatka ne gasi uvek child procese (node/postgres). Pre ponovnog pokretanja proveri da li port drži stari proces.

## F3 - Mobilna aplikacija (2026-11-16) · status: **završeno (osnova)**, QR u F4

### Šta radi (provereno u browseru: telefon 390 px i tablet 1024 px, srpski i ruski)

| Oblast            | Stanje                                                                                                                                                                                                                        |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tehnologija       | Expo SDK 58, React Native 0.88, Expo Router (`src/app`), TanStack Query, zustand, i18next. API-ji provereni u zvaničnoj SDK 58 dokumentaciji                                                                                  |
| Brend             | Ikonica, adaptivna Android ikonica i splash napravljeni od zvaničnog logoa; Syncopate + Montserrat; tamna tema iz istih tokena kao admin                                                                                      |
| Prijava           | Email + lozinka (Supabase), registracija, zaboravljena lozinka; DEV prijava za lokalni rad. Sesija u Keychain/Keystore (`expo-secure-store`, sa deljenjem dugih vrednosti)                                                    |
| Povezivanje       | Recepcija izdaje 6-cifreni kod (admin → član → „Kod za aplikaciju“, važi 15 min, jednokratan, čuva se samo hash); član ga unosi u aplikaciji. Ograničenje pokušaja: 5/15 min po korisniku, 20/h po IP                         |
| Početna           | Pozdrav po beogradskom vremenu, **digitalna članska kartica** (paket, status, važi do, preostali dani, traka napretka, preostali dolasci/termini, dug), poslednji dolasci, današnje radno vreme, adresa, poziv jednim dodirom |
| Članstvo          | Istorija članarina sa statusima, uplate (bez internih napomena), napomena „nije fiskalni račun“                                                                                                                               |
| Profil            | Podaci, broj člana, izbor jezika (SR / EN / RU), kontakt kluba, odjava                                                                                                                                                        |
| Responsive        | Sadržaj najviše 560 px i centriran (tablet, web); dodirne površine ≥ 44 px; pull-to-refresh                                                                                                                                   |
| Samo stvarne f-je | Kartice „Istraži“ i „Trening“ nisu prikazane dok ne postoje (F5, F7). QR nije prikazan dok ne bude bezbedno urađen (F4)                                                                                                       |

### Ruski jezik (zahtev vlasnika)

Ruski je **kompletan jezik** u adminu i aplikaciji (288+ tekstova, ruska množina 1/2/5/21), a ne samo rezerva za engleski. Admin ima izbor jezika i na ekranu za prijavu. Paketi imaju i polje za ruski naziv. Syncopate nema ćirilicu, pa ruski naslovi automatski koriste Montserrat ExtraBold.

### Novo u API-ju

`GET /me/memberships`, `GET /me/payments`, `GET /me/visits` (RLS-scoped), `POST /me/link`, `POST /admin/members/:id/link-code`. Migracija `009_member_plan_visibility`: član uvek vidi naziv svog paketa, i kada paket više nije u prodaji.

### Admin, responsive

Telefon: gornja traka + donja navigacija, kartice umesto tabela (članovi, uplate, članarine), filteri koji se prevlače, forme u jednoj koloni. Tablet: uska traka sa ikonama. Desktop: pun meni.

### Testovi: 194, svi prolaze (`pnpm check` 24/24)

api 109 (+15: povezivanje, pogađanje koda, poništavanje starog koda, lokalizovani nazivi, sakriveni paketi, izolacija) · database 41 · design-tokens 14 · translations 10 (ruska i srpska množina) · mobile 9 (vremenska zona kluba, napredak perioda, svaki ključ postoji na sr/en/ru) · validation 7 · admin 4

### Pokretanje mobilne aplikacije

```sh
pnpm db:dev && pnpm dev:api       # (dva terminala)
pnpm dev:mobile                    # Expo → „w“ za web, ili skeniraj QR u Expo Go / development build
```

Dev nalog člana: `clan@grit.local`. Na fizičkom telefonu `EXPO_PUBLIC_API_URL` mora biti LAN IP računara (vidi `apps/mobile/.env.example`).

### Ostaje (sledeće faze)

- **F4:** QR token, skener na recepciji, evidencija dolazaka.
- Brisanje naloga i izvoz podataka iz aplikacije (zahtev App Store-a, pre objave). Izmena profila u aplikaciji.
- Na webu se pre učitavanja aplikacije kratko vidi bela pozadina. Na iOS-u i Androidu to nije slučaj, jer tamo postoji splash ekran.
- Push notifikacije (F8).

## F2 - Administracija i članovi (2026-11-16) · status: **završeno**

### Šta radi (provereno u browseru i testovima)

| Oblast         | Stanje                                                                                                                                                                                                                                       |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Admin panel    | React 19 + Vite 7 + Tailwind 4, GRIT tema (Syncopate + Montserrat, #E54E26), sr/en, port **5180**                                                                                                                                            |
| Prijava        | Supabase (email + lozinka, TOTP MFA za vlasnika i menadžera) **ili** lokalna DEV prijava za test naloge (samo `NODE_ENV=development`, test garantuje da ne postoji drugde)                                                                   |
| Pregled        | Aktivni, ističu uskoro, istekli (30 d), dolasci danas, uplate u periodu, grafikoni po danima, lista koja ističe, uplate po načinu plaćanja. **Samo stvarni podaci**, sa praznim stanjima kada podataka nema                                  |
| Članovi        | Pretraga (ime u bilo kom redosledu, telefon, email, broj člana), filter po statusu, paginacija, kreiranje i izmena (ista zod šema kao API), detalj sa karticama: članarine, uplate, dolasci, interne napomene, istorija izmena, deaktivacija |
| Članarine      | Dodela + uplata u **jednoj transakciji**; automatski početak (danas ili dan posle isteka postojeće); rok važenja; dug je dozvoljen i vidljiv; otkazivanje sa razlogom                                                                        |
| Uplate         | Lista sa filterima, storno i (delimični) povraćaj sa razlogom, nikad brisanje; napomena „nije fiskalni račun“ na svakom ekranu za uplate                                                                                                     |
| Paketi         | Lista i uređivanje (cena, trajanje, dolasci/termini, pauze, zone, sr/en naziv); provizorne cene su vidno označene svuda, uključujući padajuću listu pri prodaji                                                                              |
| Uloge u UI-ju  | Meni i dugmad se prilagođavaju dozvolama (recepcija ne vidi pregled, storno ni povraćaj), a API to proverava nezavisno                                                                                                                       |
| Lokalni razvoj | `pnpm db:dev` (Postgres bez Docker-a + provizorni podaci + 3 dev naloga), `pnpm dev:api`, `pnpm dev:admin`                                                                                                                                   |

### Novi API endpointi

`GET/POST /admin/plans`, `PATCH /admin/plans/:id`, `GET/POST /admin/members/:id/memberships`, `POST /admin/memberships/:id/cancel`, `GET/POST /admin/payments`, `POST /admin/payments/:id/void`, `POST /admin/payments/:id/refund`, `GET /admin/reports/dashboard`, `GET/POST /admin/members/:id/notes`, `GET /admin/members/:id/attendance`, `GET /admin/members/:id/audit`. `GET /admin/members` sada vraća i trenutni status, paket, rok i poslednji dolazak, sa filterom `status`.

### Nova migracija

`008_membership_overview`: pogledi `membership_overview` (izračunat status, preostali dani i dolasci, uplaćeno) i `member_current_status` (najbolja trenutna članarina po članu). Status se i dalje računa na **jednom mestu**, u bazi.

### Testovi: 167, svi prolaze

database 41 · api 94 (+54: paketi, dodela, obnova, preklapanje, unazad najviše 7 dana, dug, otkazivanje, uplate, storno, povraćaj, dashboard iz stvarnih podataka, istorija, DEV prijava i env zaštite) · translations 8 (srpska množina 1/2/5) · design-tokens 14 · validation 7 · admin 3 (svaki ključ koji UI koristi postoji na sr i en)

### Napomene

- **Računar ima 3,4 GB RAM-a**, pa `pnpm check` radi redom (`--concurrency=1`). Paralelno je pucao zbog nedostatka memorije, ne zbog greške u kodu. CI na GitHub-u ima dovoljno memorije.
- Port 5173 zauzima drugi lokalni projekat, pa admin radi na **5180**.
- E2E (Playwright) skripta još nije u repou. Tok T1 (novi član → članarina → uplata) i ograničenja uloga provereni su ručno u browseru. Automatizacija je zakazana za F10 / pre puštanja.
- Javni sajt (Astro) i podešavanja radnog vremena u adminu su sledeći mali koraci (MVP lista, M16/M19).

## F1 - Temelj (2026-11-16) · status: **završeno (backend temelj)**, UI kit prebačen na početak F2

### Šta radi

| Oblast       | Stanje                                                                                                                                                                                                  |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Monorepo     | pnpm 10 workspaces + Turborepo; zajednički TS (strict), ESLint 9 i Prettier; CI na GitHub Actions (lint, tipovi, testovi, build, gitleaks)                                                              |
| Baza         | 7 SQL migracija (`supabase/migrations`), 25 tabela, RLS na svim tabelama, generisani Kysely tipovi                                                                                                      |
| Testovi baze | Pravi PostgreSQL 17 lokalno **bez Docker-a** (embedded-postgres) + shim za Supabase `auth`                                                                                                              |
| API          | Express 5: JWT (Supabase JWKS ili HS256), uloge i dozvole, MFA za owner/manager, zod validacija, standardni odgovori i greške, pino logovi sa request-id, helmet, CORS, rate limit, OpenAPI iz zod šema |
| API moduli   | `health` (`/ready`), `public` (`/public/club`), `me` (`GET/PATCH /me`, RLS-scoped), `members` (šablon modula: list/search, create, get, update, deactivate + audit)                                     |
| Paketi       | `@grit/database`, `@grit/validation`, `@grit/translations` (sr, en; ru/ar → fallback en), `@grit/design-tokens` (+ generisan `theme.css` za Tailwind v4)                                                |

### Testovi (107, svi prolaze)

| Paket         | Broj | Šta pokrivaju                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| database      | 40   | RLS uključen na svakoj tabeli (provera kataloga); klijentske uloge imaju pristup samo dozvoljenim tabelama; anon nema pristup privatnim podacima; **član A ne vidi podatke člana B**; član ne vidi interne kolone; član ne može da menja članarinu ni da sebi dodeli ulogu; uplate se ne brišu i ne menjaju (samo storno); audit log i dolasci su append-only; preklapanje članarina; 11 graničnih slučajeva statusa članarine; seed je ispravan i označen |
| api           | 40   | Svaka zaštićena ruta vraća 401 bez tokena; svaka admin ruta vraća 403 za člana; lažni token; MFA; deaktiviran zaposleni gubi dozvole; recepcija ne može da deaktivira; kreiranje, pretraga, paginacija, izmena i deaktivacija člana sa audit zapisom; duplikat email-a → 409; `/me` je izolovan; javni endpoint ne izlaže interna podešavanja                                                                                                              |
| design-tokens | 14   | WCAG AA kontrast svih parova tekst/pozadina; tamni tekst na narandžastom dugmetu                                                                                                                                                                                                                                                                                                                                                                           |
| translations  | 6    | sr i en imaju iste ključeve; **svaka poruka koju API može da vrati postoji u prevodu**                                                                                                                                                                                                                                                                                                                                                                     |
| validation    | 7    | Normalizacija email-a i telefona; nepoznata polja se odbijaju                                                                                                                                                                                                                                                                                                                                                                                              |

### Pokretanje

```sh
pnpm install
pnpm check                     # lint + typecheck + test + build
pnpm --filter @grit/api dev    # potreban apps/api/.env (vidi .env.example) i Supabase projekat
```

### Odstupanja od plana (namerna)

1. **RLS testovi su u Vitest-u nad pravim Postgres-om, a ne u pgTAP-u.** Supabase CLI i Docker ne postoje na razvojnoj mašini. Vitest pokriva iste scenarije, radi na Windows-u i u CI-ju bez Docker-a, i koristi iste migracije.
2. **UI kit (web + RN) pomeren je na početak F2/F3.** Komponente se grade zajedno sa admin panelom i mobilnom aplikacijom, gde mogu da se vide i testiraju. Tokeni, prevodi i tema su spremni.
3. **OpenAPI se generiše nativnim `z.toJSONSchema` (zod 4)**, bez dodatne biblioteke.
4. **`packages/types` nije zaseban paket.** DB tipovi su u `@grit/database`, a DTO tipovi u `@grit/validation`, da bi se izbeglo dupliranje.
5. **Verzije:** TypeScript je fiksiran na 5.9 (stabilan ekosistem alata), iako postoji TS 7.

### Poznata ograničenja / sledeći koraci

- Rate limit koristi memorijski store (dovoljno za jednu API instancu). Za više instanci treba Postgres store.
- Supabase dev/staging projekti još nisu kreirani (potreban nalog vlasnika ili tima). Migracije se primenjuju sa `supabase db push`.
- `Tests closed successfully but something prevents Vite server from exiting` je kozmetičko upozorenje u testovima baze i ne utiče na rezultate.
- Repo je u `C:\dev\grit-digital-club` (van OneDrive-a). Git je inicijalizovan, a commit još nije napravljen.
