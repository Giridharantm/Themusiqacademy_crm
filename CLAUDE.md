@AGENTS.md

# Working in this repo

`README.md` is the living product/feature doc — read it first for how the app actually behaves. **Keep it in sync**: a schema change, a new business rule, or a changed convention that isn't reflected there is an incomplete change, not a documentation nit for later.

## Database migrations

- **Additive changes** (new column/table with a default, new enum value): `npx prisma migrate dev --name <description>` works fine non-interactively.
- **Destructive changes** (dropping/renaming a column, anything Prisma calls "not safe"): `prisma migrate dev` will refuse to run non-interactively. Hand-write the migration SQL yourself (SQLite: rebuild the table — create `new_Table`, copy data, drop old, rename), then apply with `npx prisma migrate deploy` (doesn't prompt).
- **On Windows, stop the dev server before running any migration.** The Prisma query-engine DLL gets locked by the running `next dev` process, and `prisma migrate` / `prisma generate` will fail with an `EPERM` rename error otherwise. Restart the dev server after.
- After any schema change: `npx prisma generate` to regenerate the client (needed separately if `migrate deploy` was used, since that doesn't auto-generate).

## One-off data scripts

Ad-hoc data fixes, backfills, and one-time corrections are written as standalone scripts in `prisma/` (e.g. `prisma/fix-something.ts`), run via `npx tsx prisma/fix-something.ts`, and **deleted immediately after running them**. They are not part of the app and should never be left in the repo — check `git status` after this kind of task to make sure one wasn't left behind. If a fix is genuinely reusable (not a one-time correction), it belongs in `src/lib/` instead.

## Verifying a change

Before considering a change done:
- `npx tsc --noEmit` and `npm run lint` both pass.
- `npm test` passes (Vitest — currently covers `src/lib/subscription.ts`, `src/lib/billing.ts`, `src/lib/schedule.ts`; add cases there for any bug fix in those modules, and consider adding coverage for other pure logic you touch).
- For anything visible in the UI: actually load it in a browser and check it (dev server via `npm run dev`), not just type-check it. This app leans hard on Server Actions and RSC re-renders that don't always behave the way you'd assume — see the `<details>`-remount gotcha in git history (search `git log --all --oneline | grep -i details` for examples) if a form seems to silently not reset after a successful save.

## Design system

Shared UI primitives are in `src/components/ui.tsx` (`Card`, `Button`, `Badge`, `StatCard`, `Input`, `Select`, `Textarea`, `PageHeader`, `EmptyState`) — reuse these rather than hand-rolling markup. Theme colors are CSS custom properties in `src/app/globals.css`'s `@theme` block (the "vinyl-*" tokens, plus a retint of Tailwind's `indigo`/`slate` scales) — use those tokens, not hardcoded hex values or Tailwind's default palette names.

## Git

Commit as you go, with real messages — don't let a session's worth of unrelated changes pile up into one commit. This repo's history is meant to be a genuine record future sessions (and future you) can read with `git log` / `git blame` instead of having to ask.
