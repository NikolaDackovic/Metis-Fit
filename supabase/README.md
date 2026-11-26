# supabase/

- `migrations/` - the **only** source of truth for the database schema. Applied to Supabase projects with
  `supabase db push` (dev → staging → production). Never edit an applied migration; add a new one.
- `seed/seed.sql` - DEV/STAGING only. Example plans, opening hours, members and equipment for development.

Local tests do not need Docker: `packages/database` starts an embedded PostgreSQL 17, applies a minimal
Supabase shim (`auth` schema, `anon`/`authenticated` roles) and then these migrations.

After adding a migration, regenerate Kysely types:

```sh
pnpm --filter @grit/database db:types
```
