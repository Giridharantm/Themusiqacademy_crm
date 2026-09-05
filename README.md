# The Musiq Academy CRM

Leads, students, attendance, billing and role-based portals for a music academy — built with Next.js, Prisma and Postgres.

## Running locally

Postgres needs to be running before the app — the easiest way is via the `db` service in `docker-compose.yml` (see "Deployment" below), which also matches what production runs:

```bash
docker compose up -d db          # starts Postgres, exposed on localhost:5432 only
cp .env.example .env             # set DATABASE_URL to point at it, generate an AUTH_SECRET
npm install
npx prisma migrate deploy        # first run only — creates the schema
npm run dev
```

Open http://localhost:3000 — you'll be redirected to `/login`.

The database currently holds the academy's real migrated data — 345 students, 310 leads, batches, attendance and subscription history imported from their previous CRM (see "Data note" below), not the original demo seed. `npx prisma migrate reset` will wipe that and restore `prisma/seed.ts`'s small synthetic dataset instead — **don't run it against this database without a backup**, since it isn't reversible.

## Demo logins

The admin and teacher accounts below are real logins (`password123`), unaffected by the legacy data import. There's currently no Parent-role login — the imported data had no guardian/portal accounts to carry over — so the parent portal can't be demoed until one is created for a real student.

| Role    | Email                                | What they can do |
|---------|----------------------------------------|-------------------|
| Admin   | admin@musiqacademy.test                | Leads, students, attendance, courses, batches, teachers, billing |
| Teacher | teacher.ravi@musiqacademy.test         | Guitar & Violin — mark attendance, assign homework, give feedback |
| Teacher | teacher.anjali@musiqacademy.test       | Keyboard & Western Vocals |
| Teacher | teacher.lakshmi@musiqacademy.test      | Carnatic & Hindustani Vocals |
| Teacher | teacher.arun@musiqacademy.test         | Drums |

## Data note

The current dataset was migrated from the academy's previous CRM (three CSV/XLSX exports: enquiries, student details, attendance, and a separate real batch roster). Piano was merged into Keyboard (the old system tracked them as distinct labels for the same instrument). Legacy "classes completed" numbers from before this app existed are preserved via `Subscription.classesUsedAtMigration` — see `src/lib/subscription.ts` — rather than being lost when attendance tracking switched to this app's per-class records. A handful of individual data anomalies (duplicate person records under separate student IDs, one student attending past their plan while awaiting renewal) were reviewed and fixed case-by-case rather than auto-corrected in bulk — see git history for specifics if similar cases come up again.

## Student IDs

Every student gets a unique, sequential ID (`STUD-00001`, `STUD-00002`, ...) assigned on creation — from `/admin/students` directly or via lead conversion. This exists because phone numbers aren't reliable identifiers here: a family can have several students (siblings, or a parent and child both enrolled) sharing one number. Search boxes on the students, attendance, and billing pages all match against the student ID as well as name/phone/email.

## Courses offered

Guitar, Keyboard, Drums, Western Vocals, Carnatic Vocals, Hindustani Vocals, Violin. Manage these (name, description, session duration) from `/admin/courses` — there's no per-course fee, since billing is a fixed price list by plan duration across every instrument (see "Billing" below). Deleting a course is blocked with a specific count of what's in the way (batches, subscriptions, attendance records, interested leads) if it still has any — `deleteCourse()` in `src/lib/actions/course-actions.ts`; the same guard exists for deleting a batch with enrollments (`deleteBatch()` in `src/lib/actions/batch-actions.ts`).

## Batches

A batch is exactly **one instrument + one day + one 1-hour time slot** — e.g. "Drums, Tuesday, 3:00 PM - 4:00 PM" is one batch. There's no such thing as a batch spanning multiple days: a student who wants Guitar four times a week enrolls in four separate Guitar batches (Tue/Wed/Thu/Fri), each its own entity. The batch name is auto-generated from instrument + day + time, so there's nothing to type when creating one.

The "New batch" form (`/admin/batches`) only offers valid day/time combinations for this schedule:

- **Monday** — holiday, no classes
- **Tuesday–Friday** — 3:00 PM to 9:00 PM, hourly slots (last batch starts 8:00 PM)
- **Saturday** — 2:00 PM to 8:00 PM, hourly slots
- **Sunday** — 11:00 AM to 5:00 PM, hourly slots

Enforced both in the UI (`src/components/batch-schedule-fields.tsx`) and server-side (`src/lib/actions/batch-actions.ts`), driven by `src/lib/schedule.ts` — change the operating hours there if they ever change. The batches list is sorted by instrument, then day (Tue..Sun), then time (`sortBatches()` in the same file), so it reads like a weekly timetable.

Each batch on `/admin/batches` has an **Edit** disclosure to change its teacher, day/time, or room after creation (`updateBatch()`) — the same day/time picker as "New batch", pre-filled with its current values. Instrument isn't editable, since every enrollment and subscription pooled against that batch is keyed on it — moving to a different instrument goes through delete + create a fresh batch instead, the same restriction as editing a student's enrollment.

## Dashboard

`/admin` (and `/admin` alone) is the daily operating snapshot, not just a link hub:

- **Stat row 1**: Open leads (with a New/Contacted/Trial breakdown as the hint), Active students, Renewals this month, Classes today — each links straight into the matching filtered view (see "Finding who needs a renewal" and the batch-filter sections above).
- **Stat row 2**: Revenue this month (payments actually collected, not invoiced) and Outstanding dues (unpaid balance across Pending/Partial/Overdue invoices) — the same figures shown on `/admin/billing`, surfaced here too since they're the first thing to check most days.
- **Classes today**: grouped by **instrument**, not by individual batch/time-slot — matching how marking actually works now (one attendance session per instrument per day, not per time-slot). Each row shows the teacher(s), how many batches and students are on today's roster for that instrument, and whether attendance has been marked yet (Not marked yet / partially / Marked, colored red/yellow/green) with a **Mark** link straight into `/admin/attendance` pre-loaded for that instrument and today's date.

## How the workflow fits together

1. **Leads** (`/admin/leads`) — log an enquiry from a call or walk-in, track follow-ups, update status. Searchable by name/phone/email. "Edit details" lets you correct any captured field later.
2. **Convert to student** — from a lead's page, "Convert to student" opens a review form (name, phone, email, instrument, DOB, gender, address — all pre-filled from the lead but editable) with **Confirm & convert** / **Cancel** buttons. Nothing is created until you confirm; any corrections made here are saved back onto the lead too. The new student gets a unique student ID (`STUD-00001`, ...) — phone numbers get shared across a family, so that's what actually identifies a student.
3. **Enroll & guardians** — on the student's page, "Add a batch" walks through **Instrument → Day → Time** (cascading, only showing combinations that actually exist) and "+ Add this batch" queues it into a list — since a subscription's plan is usually spread across a couple of day-slots a week (e.g. Guitar Tue + Thu), you can queue up every batch the student needs before submitting once, rather than a submit-reload-repeat loop per batch (`src/components/enroll-batch-fields.tsx`). For each distinct instrument among the queued batches that doesn't already have an active subscription, the same form shows that instrument's own class-package fields (plan/carry-forward/bonus) — enrolling always creates or reuses a subscription per instrument in the same step, never leaving a batch enrollment without a package; queuing two batches of the same instrument only asks for one package, since they share its pool. Each already-enrolled batch has its own **Edit** (move it to a different day/time of the same instrument) and **Delete** (remove the enrollment outright — doesn't touch attendance or subscription history, which key off student+instrument, not the enrollment) alongside Pause/Complete/Resume. Link a guardian/parent/self account from the same page (auto-creates their parent-portal login) — students range from young children to adults, so use relation "Self" for adult students who manage their own account rather than a parent's.
4. **Subscriptions** — see "Class packages & renewals" below.
5. **Attendance** — bulk, by instrument + date, since group classes run several students at once and marking never needs to know which specific batch/time-slot (see "Attendance" below). Admins mark any instrument from `/admin/attendance`; teachers do the same for instruments they teach from `/teacher/attendance`. Both pages also let you search a student for their combined attendance history.
6. **Billing** (`/admin/billing`) — raise invoices per student, record payments; status updates automatically (Pending → Partial → Paid). Line item amounts are a fixed price list across every instrument, not free text — 1 Month = Rs. 4,800, 3 Months = Rs. 13,680, 6 Months = Rs. 25,920, 1 Year = Rs. 40,320 (`PLAN_INVOICE_AMOUNTS` in `src/lib/subscription.ts`) — and discounts are picked from Rs. 500 steps up to Rs. 10,000, or "No discount" (`DISCOUNT_STEPS`). Both are re-validated server-side in `createInvoice()` so a tampered submission can't sneak in an arbitrary amount. Every invoice's post-discount total is treated as **GST-inclusive at 18%** — `splitGst()` in `src/lib/billing.ts` breaks it into `amountWithoutGst` + 9% CGST + 9% SGST, computed once and stored on the invoice at creation (not recalculated from `total` on every render), so a future GST-rate change can't rewrite a past invoice's tax breakdown. Shown as its own "Fee details" section on the invoice page. A **Print invoice** button (`window.print()`) is available there any time — before or after payment — and the page hides the app's nav/sidebar and admin-only actions (record payment, cancel) when printing, so what comes out is just the invoice itself.
7. **Teachers** log in separately, see only their own batches and students, mark attendance, assign homework, and leave feedback. Manage teacher accounts from `/admin/teachers` — see "Managing teachers" below.
8. **Parents** log in and see their children's subscription progress, attendance history, pending/paid invoices, homework and teacher feedback — read only.

## Managing teachers

`/admin/teachers/[id]` (click through from the teachers list) is where you edit, deactivate, reassign, or delete a teacher:

- **Edit** — name/email/phone.
- **Reassign batches** — per-batch dropdown, or "Reassign ALL batches to" to move a full schedule to another teacher in one click. Useful before deactivating someone who's covering several classes.
- **Deactivate / Reactivate** — the standard way to "remove" a teacher who has history (batches, homework, feedback, or attendance they've marked). Deactivating disables their login (checked in `src/lib/auth.ts`'s `authorize()`) without touching any of that history or its attribution. Deactivated teachers also drop out of the "Teacher" dropdown when creating new batches (`/admin/batches` only offers `status: "ACTIVE"` teachers), but stay assigned to whatever they already had — reassign those explicitly if you want them cleared.
- **Delete** — only offered when the account has zero batches and zero history (checked in `deleteTeacher()` in `src/lib/actions/user-actions.ts`); otherwise it's blocked with an explanation to reassign + deactivate instead. This is for accounts created by mistake, not real removal of a teacher who's taught.

## Class packages & renewals

Subscriptions are class-count packages, not calendar periods — this is what "renewal" actually means here. A subscription is **pooled per (student, instrument)** — not per batch — because a student can attend one instrument across several day-slots (e.g. Guitar on Tuesday AND Thursday), or even a one-off comp/reschedule class in a batch they don't normally attend, all drawing from a single package. Matches "8 classes/month" working out to roughly 2 classes/week regardless of which specific days or batches those fall on. Each (student, course) pair can have one active `Subscription` at a time; `attendanceForSubscription()` in `src/lib/subscription.ts` pools every `Attendance` row for that student across any batch of that course.

- **Plans**: 1 Month = 8 classes, 3 Months = 24, 6 Months = 48, 1 Year = 96 (defined in `src/lib/subscription.ts`), or a Custom class count.
- **Expiry date**: pre-filled from the start date plus a fixed day count per plan — 40 days for 1 Month, 120 for 3 Months, 240 for 6 Months, 480 for 1 Year (`PLAN_DAYS` in `src/lib/subscription.ts`; that's 40 days per plan-month, a grace window beyond the nominal duration for holidays/reschedules, not calendar-month arithmetic). Shown as an editable "Expiry date" field — picking a different plan recomputes it, but it can be overridden before submitting. Custom plans have no formula and start blank.
- **Bonus classes**: promotional extra classes added on top of the base plan at any time, each with its own reason/note (`BonusGrant`), so you can see *why* a student has extra classes, not just a raw bumped number.
- **What counts as "used"**: only classes the student actually attended (`PRESENT`) draw down the package. An `ABSENT` class is not consumed — the student is still owed it. Change this in `countUsedClasses()` in `src/lib/subscription.ts` if that policy is ever wrong.
- **Renewing**: from a student's page (`/admin/students/[id]`), open "Renew / change subscription" under the relevant instrument group. This one form shows and lets you edit all three components of the new package together — **plan** (base classes), **carry-forward** (defaults to whatever's unused on the current subscription, e.g. a student on 22/24 renewing shows 2 pre-filled so those classes aren't lost), and **bonus classes** (with a reason) — plus a live running total, so you review the full picture before submitting rather than adding bonus classes as an afterthought. Submitting closes the old subscription (status → `EXPIRED`, used-classes frozen at that moment) and creates the new one with `baseClasses + carryForwardClasses + bonus` all set atomically. Past subscriptions are listed (collapsed), showing their base/carry-forward/bonus breakdown.
- **Correcting a mistake on the active subscription**: "Edit subscription" (next to "Renew / change subscription") updates the still-active `Subscription` row directly — plan, base classes, start date, expiry date, carry-forward, and the migration offset (below) — with no other side effects on usage stats and no new subscription row created. Use this for typos and corrections (wrong start date entered, wrong plan picked); use "Renew" instead when the student is actually starting a new package.
- **Fixing a wrong migration offset**: `classesUsedAtMigration` (see above) is itself editable from "Edit subscription" — a bulk data migration can get this number wrong for a given student, and there was previously no way to correct it short of hand-editing the database. Changing it doesn't touch any real per-date `Attendance` rows, only the offset added on top of them.
- **Adding a subscription for a student who was already enrolled/attending**: the "Add subscription" / "Renew" form has a "Classes already used (if any)" field — only shown when creating a brand-new subscription, not on a renewal — that sets `classesUsedAtMigration` at creation time. Use this for a student found with an enrollment or attendance history but no subscription tracking it (a leftover migration gap), so their prior usage counts immediately instead of needing a separate edit afterward.
- **Renewal-due signal**: a subscription shows "Renew soon" once 2 or fewer classes remain, and "Renewal overdue" at 0 — visible on the student's page, on `/admin/attendance`'s student list, and to the parent.
- **Finding who needs a renewal** (`/admin/students`): every row shows each active subscription's used/total classes and expiry date directly, colored by urgency. Four combinable filters — status, instrument, renewal state (renewing this month / renew soon / overdue), and sort (newest joined / soonest renewal / fewest classes remaining) — replace what used to be single-select pills, since pills don't compose and stop being usable once the student list runs into the hundreds (`src/components/student-filter-fields.tsx`). Picking a renewal filter narrows each row down to just the subscription(s) that matched it, so a student with one healthy and one overdue instrument doesn't bury the reason they're in the list.

## Attendance

`/admin/attendance` and `/teacher/attendance` open on a simple "pick an instrument, pick a date" form — loading a class shows every batch running that instrument on that day of the week (`dayCodeFromDate()` in `src/lib/schedule.ts` maps the picked date to TUE/WED/etc.), **grouped by batch** with its time slot (and teacher, on the admin view) as a header, since a popular instrument can run 5-6 batches on the same day and a flat alphabetical list of 30+ students doesn't let a teacher find who's in front of them.

Marking is **per-student and immediate, not a big list you compose and submit once.** Each student is their own tiny form — "Mark present" saves that one student's record right away; once marked, it shows "Present" with an "Unmark" button instead. There's no present/absent toggle: being marked *is* the present signal, and unmarking removes the record entirely rather than storing an explicit absence. This is deliberate for two reasons: a teacher with a large class can mark students as they physically arrive rather than holding the whole roster in their head until the end, and every group (and the whole card) shows a live "`X of Y marked`" count, so picking up a partially-marked class later is unambiguous. `markStudentPresent()` / `unmarkStudentAttendance()` in `src/lib/attendance.ts` each touch exactly one `(studentId, courseId, date)` record — earlier this was one action that treated "whatever's submitted" as the complete truth for the whole class and deleted anyone else's record for that date, which meant two overlapping marking sessions (a stale tab, a second admin correcting one student) could silently wipe each other's work. Per-student actions make that impossible: there's nothing to overwrite.

`Attendance` isn't tied to a `Batch` or a standing `Enrollment` — it's keyed directly by `(studentId, courseId, date)`. Marking only ever answers "did this student attend this instrument on this date" — which specific time-slot/batch they're normally in doesn't matter, only the day does. That's deliberate: a student can be marked for a **reschedule** or a **comp class** (e.g. filling in for an absent teacher) on a day that isn't their usual batch, and it still counts toward their subscription for that instrument since subscriptions already pool by course. On the marking screen, "Add a student (reschedule / comp class)" is a type-ahead search scoped to that same instrument only — other students already enrolled in it, just on a *different* day (the likeliest reschedule case) — not the whole academy, so a Carnatic Vocals class never turns up Guitar-only students. Selecting a result marks them present immediately, same as any other row; they then appear in their own "Other students" group, tagged "comp".

Teachers only see instruments they actually teach (have at least one batch of) in the picker, and the teacher-specific actions check that server-side too — but their roster for an instrument merges every batch/day of theirs for that course, not just one.

Each page also has a **tracking** side — search a student and see one *combined* attendance log per instrument (not split into separate cards per batch/day-slot the way it used to be), alongside their subscription progress. That combined view is on `/admin/attendance` (search section), `/admin/students/[id]`, `/teacher/students/[id]` (read-only — marking happens on `/teacher/attendance`), and the parent portal.

`/admin/batches` (managing the full weekly grid — creating batches, assigning teachers/rooms) is the one place that still deals with individual batches, and keeps the three facet filters — Instrument, Day, Time (`src/components/batch-filter-fields.tsx`). Each filter only ever lists values that actually exist among the current batches (so you're never offered a combination with zero results), and picking one auto-submits immediately — no separate search button to click. This replaced an earlier free-text search box that made it hard to jump straight to, say, "just Carnatic Vocals" without it getting lost among everything else matching a loose text query — especially once the full weekly timetable (all instrument × day × time combinations) is loaded and the batch count runs into the hundreds.

## Reports

`/admin/reports` — four filterable reports (Students, Leads, Attendance, Invoices & tax), each following the same pattern: a filter form (GET query params, so a filtered view is a shareable URL), a capped on-page preview (100–150 rows, with a note when the full result is larger), and a **Download CSV** button that hits a matching Route Handler (`.../export/route.ts`) with the exact same query params — the download always matches what's on screen, never a stale or unfiltered set. Query logic and CSV columns live once in `src/lib/reports/*.ts`, shared by both the page and its export route so they can't drift apart. CSV writing itself (`src/lib/csv.ts`) is a minimal RFC 4180 encoder — quotes only where a field actually needs it (commas, quotes, newlines), CRLF line endings for Excel.

- **Students** — status, instrument, gender, join-date range, free-text search. Columns include every core field plus enrolled instruments/batches, active subscriptions, and guardian details.
- **Leads** — status, source, interested instrument, created-date range, search. Includes the most recent follow-up and the converted student's ID, if any.
- **Attendance** — instrument, status, date range, student search. One row per attendance record.
- **Invoices & tax** — the one built specifically to file monthly GST: defaults to the **current calendar month** (not "all invoices ever") when no date range is given, and the page shows a summary row of Taxable Amount / CGST / SGST / Total Invoiced for the filtered period before you even download, so you can sanity-check the return total against the report. Both the summary and the CSV use each invoice's stored GST breakdown (see "Billing" above) rather than recalculating it.

## Search

Every admin list page (Leads, Students, Attendance, Courses, Batches, Teachers, Billing) and the teacher's batch list has a search box in the page header — it's a plain GET query param (`?q=`), so it works without JavaScript and composes with existing filters (e.g. leads' status filter). `src/lib/search.ts` has the shared normalization every page's `where` clause applies: the query is trimmed and matched case-insensitively (`mode: "insensitive"`), and matches against a phone field strip everything but digits from the query first, so "+91 918-741-1327" still finds a student stored as `9187411327`.

## Deployment

Runs as three Docker containers — the app, Postgres, and a Caddy reverse proxy — via `docker-compose.yml`:

```bash
cp .env.example .env   # set a real AUTH_SECRET (npx auth secret) — DATABASE_URL is wired up by compose
docker compose up --build -d
```

- The `app` container's entrypoint (`docker-entrypoint.sh`) runs `prisma migrate deploy` before starting the server, so every deploy applies pending migrations automatically — nothing manual to run on the server.
- Postgres data lives in the named volume `crm_postgres_data`, and its port (5432) is bound to `127.0.0.1` only — reachable from the host for local tooling (a DB GUI, a one-off script), not from outside the machine.
- **Caddy** (`Caddyfile`) fronts the app on ports 80/443 and gives it automatic HTTPS via Let's Encrypt once a real domain (not a bare IP) is set as the site address — `trustHost: true` is already set in `src/lib/auth.ts` so NextAuth trusts Caddy's forwarded headers. The app container itself only `expose`s port 3000 internally to the Compose network, not to the host.
- On a fresh VM, also open ports 80/443 in **both** the cloud provider's firewall (e.g. an Oracle Cloud Security List, an AWS Security Group) and the OS-level firewall (`ufw`/`iptables`) — Ubuntu images on some providers ship with a default-deny `iptables` policy that only allows SSH.
- If the host has 1-2GB RAM, add a swap file before the first `docker compose up --build` — the Next.js build step is memory-hungry: `sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile`.
- **Backups**: `docker compose exec db pg_dump -U crm crm > backup.sql` — do this on a schedule, this app has no built-in backup mechanism.

## Tech notes

- **Database**: Postgres via Prisma (`prisma/schema.prisma`). Local dev also just points `DATABASE_URL` at Postgres (e.g. `docker compose up -d db`) — there's no SQLite fallback anymore.
- **UI theme**: "Vinyl Label" — a retro record-sleeve palette (deep teal, coral, sunshine yellow on warm cream) defined as CSS custom properties in `src/app/globals.css`'s `@theme` block, including a retint of Tailwind's own `indigo`/`slate` scales so most of the app picked it up automatically. Shared primitives (`Card`, `Button`, `Badge`, `StatCard`, `Input`, etc.) live in `src/components/ui.tsx` — use those and the `vinyl-*`/retinted-`slate` color tokens for anything new rather than hardcoding colors.
- **Auth**: NextAuth v5 (credentials + JWT), role stored on the `User` model (`ADMIN` / `TEACHER` / `PARENT`). Route access is enforced in `src/middleware.ts`.
- **New teacher/guardian accounts**: created with a temporary password (`password123` by default) — have them sign in and note it, there's no password reset flow yet.
- See "Deployment" above for running this in Docker on a VPS/cloud VM.
- **After resetting the database** (`prisma migrate reset`), sign out and back in. Sessions are JWTs carrying the logged-in user's database ID; a reset regenerates all IDs, so a stale session will fail on the first action that uses your own ID as a foreign key (e.g. logging a lead, granting bonus classes) with a foreign-key-constraint error. Read-only pages keep working, which is why this can look fine right up until you try to submit something.
