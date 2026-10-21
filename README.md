# Oasis · Field Operations

Mobile-first Field Operations Management System: **Oasis Waste Tracking (COSA)** and **OnSite Facilities Tracking (OFT)**. The interface uses warm gray surfaces, rounded white cards, black navigation, teal actions and restrained yellow accents inspired by the supplied reference.

## Run

Requires Node.js 22.13+ and npm.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Without Supabase configuration the application shows a setup workspace with no sample records. Once configured, the dashboard requires an active authenticated account. Never use the setup view as an authentication fallback for a configured deployment.

## Supabase

1. Create a Supabase project. Run `supabase/migrations/001_field_operations.sql` in its SQL editor (once, on a fresh database).
2. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and server-only `SUPABASE_SERVICE_ROLE_KEY`. Disable public signups in Authentication settings. Only administrator-created users receive application profiles.
3. Configure the Site URL and redirect allowlist for `https://YOUR_DOMAIN/auth/callback` and your localhost callback. Configure Supabase Auth SMTP for production password reset delivery. Enable appropriate Auth rate limits and strong password settings.
4. Supply `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_NAME`, `BOOTSTRAP_ADMIN_PASSWORD` (at least 12 characters) as temporary process environment variables, then run `npm run bootstrap-admin`. This script reads `.env.local` for Supabase credentials, refuses to run if an admin exists, and does not print credentials. Clear bootstrap variables afterward. There is no public admin creation endpoint.
5. Sign in as the administrator, create supervisors, register facilities, and assign each facility to its authorized supervisor. Unassigned facilities are visible only to administrators.

Apply migration as database owner. It creates tables, indexes, RLS, column-level grants, atomic sequences, upload ownership, single-use GPS verification, idempotent submission transactions, audit triggers and email delivery claims. Sequence gaps after rollbacks/deletions are normal; existing identifiers are never reused.

## Server configuration

Set environment variables in `.env.local` locally and your deployment's environment dashboard. Never commit credentials.

| Variable                        | Purpose                                                                                   |
| ------------------------------- | ----------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Supabase project URL                                                                      |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public Supabase API key; protected data uses RLS                                          |
| `SUPABASE_SERVICE_ROLE_KEY`     | Server-only account management, GPS events, upload registration and notification delivery |
| `IMGBB_API_KEY`                 | Server-only ImgBB upload credential                                                       |
| `RESEND_API_KEY`                | Server-only Resend credential                                                             |
| `MANAGER_EMAIL`                 | Manager email recipient                                                                   |
| `RESEND_FROM_EMAIL`             | Sender on a verified Resend domain, e.g. Operations <reports@yourdomain.com>              |
| `APP_URL`                       | Canonical HTTPS deployment URL for reset and report links                                 |
| `APP_TIMEZONE`                  | Initially `Asia/Riyadh`                                                                   |
| `GPS_ACCURACY_METERS`           | UI acquisition target, initially `20`                                                     |

The authoritative GPS threshold is `app_settings.gps_accuracy_meters` in PostgreSQL, initially 20. If changing it, update the UI environment target to match. GPS freshness is 5 minutes. UTC timestamps are stored; the UI defaults to Riyadh. Daily query boundaries and inspection future-date validation currently use Riyadh; update those if deploying for another timezone.

## Features and security

- Shared cookie-based Supabase login, password reset, active-account checks, role guards, no public app registration. Auth rate limiting uses Supabase; protected write/upload rate limits are stored in PostgreSQL.
- Supervisors submit and read their own immutable reports. They can inspect only active facilities assigned to them. Administrators manage reports, facilities, users, category/unit/status options and notification retries.
- ImgBB uploads run server-side. JPEG/PNG/WebP are validated by decoding, auto-oriented, resized and re-encoded with Sharp. HEIC/HEIF works only if the host's libvips build supports that codec; otherwise the UI asks for JPEG. The browser prepares supported images as JPEG up to 2,000 pixels before upload, capped at 3.5 MB to fit Vercel Function body limits. The server independently validates/re-encodes the image (15 MB/60 MP hard limit). Unsupported browser HEIC decoding requires an original under 3.5 MB or exporting to JPEG.
- Images are uploaded separately with progress and retry. A report commits only with 2–3 distinct successful uploads owned by the current user. Upload failures never create a report. Removed/unsubmitted uploads can remain hosted at ImgBB; there is no automatic orphan cleanup. Direct ImgBB URLs remain accessible to anyone possessing them. URLs are disclosed only through authorized report/facility reads.
- GPS requests use high accuracy, no cached positions and a 25-second timeout. The map uses Leaflet/OpenStreetMap, the actual unsnapped coordinate and the device accuracy circle. Confirmation is enabled after map tiles load; a server-recorded view must precede confirmation. Recapture resets confirmation. The database rechecks freshness, accuracy, ownership and single-use verification atomically at submission.
- A server can validate metadata and the confirmation event, but cannot prove a user visually inspected a map, prevent all device spoofing, or guarantee consumer GPS accuracy. HTTPS and device location permission are required.
- Form text is preserved on the same device using localStorage. Photos and GPS must be recaptured after reload. Drafts are local, not offline submissions. Avoid shared-device drafts for sensitive content.
- Report and photo persistence, in-app notifications and an email delivery row are committed in the same database transaction. Email failure cannot remove the report. Failed/pending delivery is retryable from admin Notifications. Requests are claimed to avoid concurrent sends; a stale pending claim can be retried after 10 minutes.
- Resend acceptance is **sent**, never **delivered**. A provider webhook integration for confirmed delivery is not included. If a process stops after provider acceptance and before persisting the message ID, verify provider logs before retrying to avoid a possible duplicate after lease expiry.
- All changes and report deletions are audited in PostgreSQL. Facilities are archived, preserving historical inspections. Admin edits cannot change report ownership, number, capture metadata or submission time.
- Reports support search, category/supervisor/date filters, date sorting and pagination. Administrator maps are separate per module and use filtered pages of up to 1,000 markers; use pagination/filters for larger datasets. Facility selection supports the first 250 authorized references; paginate the register for larger deployments. Marker clustering is not implemented.
- Manifest provides install metadata; no service worker or offline submission is claimed. Self-hosted SVG icon is included.

## Checks

```sh
npm run typecheck
npm test
npm run build
```

The PostgreSQL tests execute the migration in local PGlite with Supabase auth roles simulated. They exercise RLS isolation, blocked supervisor edits, active accounts, mandatory GPS verification, photo ownership, atomic numbering and idempotency. They do not replace testing against a configured Supabase project. Live Supabase, real-device GPS, ImgBB, password reset email and Resend require their external services and have not been independently verified without configuration.

## Deploy on Vercel

Import the GitHub repository into Vercel, select Next.js, and configure the variables above. Build command: `npm run build`. Deploy over HTTPS, set `APP_URL` to the resulting domain, and update Supabase Auth callback URLs. The app uses Next.js App Router route handlers; no separate backend is required. Configure provider accounts and run the migration before allowing operational use. Nothing is deployed merely by cloning or pushing this repository.

Before field rollout, verify on Android Chrome and iPhone Safari: sign-in/reset, facility authorization, 2–3 phone images, permission denial, GPS acquisition, map loading, explicit confirmation, stale GPS rejection, record refresh persistence, deactivation, and email failure/retry. Use separate administrator and supervisor accounts to confirm Supabase RLS against the live project.
