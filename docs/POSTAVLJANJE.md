# Postavljanje na fit.metis.rs

Cilj: aplikacija za članove na **fit.metis.rs**, admin na **admin.fit.metis.rs**, server na **api.fit.metis.rs**. Sve radi stalno, bez lokalnog računara.

| Deo                            | Gde                        | Cena (orijentaciono)                               |
| ------------------------------ | -------------------------- | -------------------------------------------------- |
| Baza, prijava (email), slike   | Supabase (EU, Frankfurt)   | besplatno za početak                               |
| Server (API)                   | Render, Docker             | Starter oko 7 USD mesečno (besplatni plan "spava") |
| Admin i web verzija aplikacije | Render, statički sajt      | besplatno                                          |
| Domen                          | Loopia (već imaš metis.rs) | samo DNS zapisi                                    |

Sve tri usluge na Renderu pravi fajl `render.yaml` iz repozitorijuma; ručno se unose samo tajni ključevi.

## 1. Supabase (oko 10 minuta)

1. Na supabase.com napravi nalog i **New project**: ime `metis-fit`, region **Central EU (Frankfurt)**, jaka lozinka baze (sačuvaj je).
2. **Storage → New bucket**: ime `club-media`, označi **Public**.
3. **Authentication → URL Configuration**:
   - Site URL: `https://fit.metis.rs`
   - Redirect URLs: `https://fit.metis.rs/**` i `https://admin.fit.metis.rs/**`
4. **Authentication → Providers → Email**: uključeno, potvrda emaila uključena.
5. Prepiši (Project Settings):
   - **Project URL** (`https://xxxx.supabase.co`)
   - **anon public** ključ (API keys)
   - **service_role** ključ (tajni, samo za server)
   - **Connection string → Session pooler** (Database), sa lozinkom baze

Pošalji mi **Connection string**: primenjujem sve migracije baze (tabele, pravila, katalog namirnica). Ostale ključeve unosiš sam na Renderu (korak 2).

## 2. Render (oko 10 minuta)

1. Na render.com napravi nalog preko **GitHub-a** i dozvoli pristup repozitorijumu `NikolaDackovic/Metis-Fit`.
2. **New → Blueprint** → izaberi `Metis-Fit` → Render pročita `render.yaml` i prikaže tri usluge: `metis-api`, `metis-admin`, `metis-app`.
3. Unesi tražene vrednosti:

| Promenljiva                                                     | Vrednost iz Supabase-a             |
| --------------------------------------------------------------- | ---------------------------------- |
| `DATABASE_URL`                                                  | Connection string (Session pooler) |
| `SUPABASE_URL`, `VITE_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_URL` | Project URL                        |
| `SUPABASE_SERVICE_ROLE_KEY`                                     | service_role ključ (samo ovde)     |
| `VITE_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`       | anon public ključ                  |

4. **Apply**. Prvo pravljenje traje 5 do 10 minuta. Render za svaku uslugu prikaže adresu oblika `metis-app.onrender.com`.

## 3. Loopia DNS (oko 5 minuta, pa do sat vremena da se proširi)

Loopia Customer Zone → **metis.rs** → DNS editor:

1. Kod poddomena **fit** obriši postojeće zapise za parking (A zapisi 194.9.94.85 i 194.9.94.86).
2. Dodaj (tačne ciljeve prikazuje Render u Settings → Custom Domains svake usluge):

| Poddomen    | Tip   | Vrednost                   |
| ----------- | ----- | -------------------------- |
| `fit`       | CNAME | `metis-app.onrender.com`   |
| `admin.fit` | CNAME | `metis-admin.onrender.com` |
| `api.fit`   | CNAME | `metis-api.onrender.com`   |

Render sam izdaje HTTPS sertifikate čim DNS proradi.

## 4. Prvi vlasnik

1. Otvori **https://fit.metis.rs**, registruj se svojim emailom i potvrdi email.
2. Javi mi: tvom nalogu dodeljujem ulogu vlasnika platforme (odobravanje teretana) i vlasnika prve teretane.
3. U adminu (**https://admin.fit.metis.rs**) pri prvoj prijavi podesi dvostepenu prijavu (aplikacija za kodove, npr. Google Authenticator).
4. U adminu podesi teretanu: naziv, logo, radno vreme, pakete i cene, trenere; zaposlene dodaj pozivnicom.

## Napomene

- Ništa od ovoga ne menja kod; sledeći `git push` na `main` sam ažurira sve tri usluge.
- Tajni ključevi (service_role, lozinka baze) nikad ne idu u repozitorijum ni u aplikaciju.
- Lokalni razvoj (`pnpm db:dev`, admin 5180, aplikacija 8081) radi kao i do sada.
