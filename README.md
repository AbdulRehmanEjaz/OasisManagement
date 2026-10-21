# Oasis · Field Operations

Enter one PIN to sign in. The server identifies the account and opens its panel automatically; there is no role selector.

Three PIN-protected panels in one mobile-first Next.js application:

| Panel      | Access                                                                                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Admin      | All records and maps; create, edit, delete/archive; add/remove users; activate/deactivate accounts; change PINs; notifications and settings                  |
| Viewer     | Read reports, photographs and maps only. No user directory, supervisor identities, account details, edits, deletes or submissions                            |
| Supervisor | Submit waste reports and facility inspections with site details, photographs and confirmed GPS. No report browsing, user management, edit or delete controls |

## Run locally

Requires Node.js **22.13+** (Node 24 recommended) and npm.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Set `INITIAL_ADMIN_PIN`, `INITIAL_VIEWER_PIN`, and `INITIAL_SUPERVISOR_PIN` in `.env.local` to the requested initial PINs. Keep leading zeroes: PINs are strings, not numbers. The configured initial PINs are not committed to Git.

Without Supabase, development mode stores **real local accounts and sessions** in ignored `.data/access.sqlite`. Admin user management and all three logins work locally. Operational field records, image uploads, and report maps still require Supabase and ImgBB; no mock field records are supplied. Local accounts are not automatically copied into Supabase when connecting a project.

Initial PINs seed the local accounts only once. Restarting the app does not overwrite PIN changes. Production never falls back to SQLite authentication.

## Production Supabase setup

1. Create a Supabase project. On a fresh database apply `supabase/migrations/001_field_operations.sql`, then `002_panels_and_pins.sql` and `003_pin_only_login.sql`. Existing installations should apply only migrations they have not yet applied.
2. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and the server-only `SUPABASE_SERVICE_ROLE_KEY`. Disable public Auth signups. Set the Supabase Auth Site URL to the deployment domain.
3. Generate a permanent random `PIN_LOOKUP_SECRET` of at least 32 characters and store it only in the server environment. Supply the three distinct `INITIAL_*_PIN` values privately.
4. Run `npm run bootstrap-panels` from a trusted environment with those variables. This provisions the three roles, or attaches PIN access to an existing first account of each role. It refuses to overwrite existing PIN credentials, making reruns safe. It does not print PINs or send invitation emails. Clear initial PIN variables after cloud provisioning.
5. Log in as Admin. Use **Users & PINs** to create named users, assign a panel, change PINs, or revoke access. Assign facility references to the appropriate Supervisor account.

Supabase Auth remains the session provider in production. A server-only, rate-limited PIN check starts a verified Supabase session without emailing a magic link. Public database access additionally requires an active, unexpired PIN session whose credential version matches the current PIN. Normal password or direct Auth sign-in alone does not grant application data access.

PINs use salted scrypt hashes. A separate keyed fingerprint enforces unique PINs without a plain PIN lookup table. Keep `PIN_LOOKUP_SECRET` stable: rotating it requires re-provisioning the credential fingerprints/PINs through a trusted administrative recovery. Never send the service-role key, PIN hashes, fingerprints, or session tokens to browsers.

## Environment

`.env.example` contains names only. Set actual values privately in `.env.local` and the deployment environment.

| Variable                                                            | Purpose                                                   |
| ------------------------------------------------------------------- | --------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`                                          | Supabase project URL                                      |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`                                     | Public API key; protected data uses RLS                   |
| `SUPABASE_SERVICE_ROLE_KEY`                                         | Server-only account, PIN and delivery management          |
| `PIN_LOOKUP_SECRET`                                                 | Permanent random secret, at least 32 characters           |
| `INITIAL_ADMIN_PIN`, `INITIAL_VIEWER_PIN`, `INITIAL_SUPERVISOR_PIN` | Distinct initial 3–12 digit PINs; preserve leading zeroes |
| `IMGBB_API_KEY`                                                     | Server-only ImgBB upload credential                       |
| `RESEND_API_KEY`                                                    | Server-only Resend credential                             |
| `MANAGER_EMAIL`                                                     | Manager notification recipient                            |
| `RESEND_FROM_EMAIL`                                                 | Sender on a verified Resend domain                        |
| `APP_URL`                                                           | Canonical HTTPS deployment URL                            |
| `APP_TIMEZONE`                                                      | Initially `Asia/Riyadh`                                   |
| `GPS_ACCURACY_METERS`                                               | UI acquisition target; initially `20`                     |

The database's authoritative GPS threshold is `app_settings.gps_accuracy_meters`, initially 20. Keep the UI target in sync. Timestamps are stored in UTC; daily query boundaries currently use Riyadh.

## Security and behavior

- HttpOnly cookies, same-origin write checks, eight-hour PIN sessions, and five login attempts per five-minute window. Unknown or inactive accounts cannot sign in.
- PIN changes, deactivation and removal invalidate sessions. Admins cannot deactivate or remove themselves. Removed accounts lose access immediately; historical field records retain their references.
- RLS protects records independently of navigation. Viewers cannot query underlying report/user/photo tables for others' identities. A narrowly scoped database function exposes only permitted report/map fields and photographs. Supervisors receive only minimal authorized facility choices and cannot read submitted records, even their own.
- The submission RPC checks the authenticated role, field validation, distinct owned uploads, confirmed fresh GPS and idempotency atomically. Sequential COSA/OFT identifiers are generated in PostgreSQL. Rollback/deletion gaps are normal.
- Waste submissions require the project/site name. Facility inspections use an authorized facility with its registered site. Admin report edits preserve submission identity and original GPS evidence.
- GPS uses high accuracy, no cached positions and a 25-second timeout. The Leaflet/OpenStreetMap modal shows the unsnapped coordinate and device accuracy circle. Confirmation is possible after map tiles load. Recapture invalidates prior verification; readings expire after five minutes. A server cannot prove physical presence or visual inspection, or eliminate consumer GPS error.
- Each submission requires 2–3 successful image uploads. Supported phone images are resized to 2,000 pixels and under 3.5 MB before upload. The server independently decodes, auto-orients and re-encodes images (15 MB / 60 MP maximum). HEIC/HEIF depends on browser/host codec support; export unsupported images as JPEG.
- ImgBB calls stay server-side. Direct image URLs may be opened by anyone possessing them. Removed/unsubmitted uploads can remain on ImgBB; automatic orphan cleanup is not implemented.
- Text drafts are scoped to the signed-in account and cleared on logout. Photos and GPS require recapture after reload. There is no offline submission support.
- Reports, in-app notifications and pending email rows commit together. Resend failures cannot remove saved reports. Admin can retry failed delivery. **Sent** means provider acceptance; a delivery-confirmation webhook is not implemented. After a process crash around provider acceptance, check Resend logs before retrying a stale claim.
- Facilities archive without destroying inspection history. Maps use filtered pages of up to 1,000 markers; clustering is not implemented. Form facility choices use all authorized references.

## Checks and deployment

```sh
npm run typecheck
npm test
npm run build
```

Tests cover PIN hashing, persistence, throttling, expiry and revocation, the role matrix, GPS validation, upload ownership, atomic submissions, idempotency and the PostgreSQL migrations in PGlite. Database tests explicitly verify Viewer privacy, Supervisor submit-only restrictions and PIN-version session invalidation. Legacy migration-001 tests remain as migration regression coverage; migration 002 supersedes their old Supervisor read policies.

Import the GitHub repository into Vercel as a Next.js project, configure the production environment, apply the migrations and provision panels before operational use. Build with `npm run build` and serve over HTTPS. The local SQLite access store is development-only and is not a cloud database substitute.

Live Supabase sessions, ImgBB, Resend and Android/iPhone device GPS require external setup and have not been independently verified without those accounts. Local PIN logins and protected API role restrictions are checked separately from those integrations.
