# Oasis · Field Operations

Mobile-friendly Admin, Viewer and Supervisor panels on Cloudflare Workers, with
Cloudflare D1 as the only production database and session provider. No Supabase
account, key, SDK or external authentication provider is required.

| Panel | Access |
| --- | --- |
| Admin | Reports/maps, CRUD, facilities, users, PIN resets, activation, notifications, delivery retries, categories and settings |
| Viewer | Reports, photographs and maps; no user identities, account details or writes |
| Supervisor | Site reports, GPS verification and photos; assigned facility choices only; no report browsing, edit/delete or user directory |

Enter one private PIN to open the matching panel. No default accounts/PINs are
created by builds, migrations or deployment. Follow **[D1_SETUP.md](D1_SETUP.md)**
to bind the database, apply migrations and privately create the first admin.

## Commands

Node 24 and npm are recommended.

```sh
npm ci
npm run db:migrate:local
npm run dev:vinext
```

For local development, privately put `PIN_LOOKUP_SECRET` and `ADMIN_SETUP_TOKEN`
in ignored `.dev.vars` (each at least 32 random characters). Open `/setup` once
and choose a private administrator PIN. The original `npm run dev` Next.js UI
server also uses Wrangler's local D1 through its platform proxy; it no longer
uses the old SQLite accounts or seeded initial panel PINs.

```sh
npm run typecheck
npm test
npm run test:worker
npm run build
npm run test:app
npm run deploy -- --dry-run
```

`test:worker` applies the real migration to an isolated local D1 database and
checks transactional writes, authorization, PIN/session security, reports,
facilities, GPS ownership, photo ownership, privacy and image conversion.
`test:app` checks the actual built application's HTTP routes and production
cookie attributes against another isolated local D1 database. Neither test
creates remote resources or uses private production PINs.

`npm test` additionally preserves the 31 existing validation/access regression
tests, including historical PostgreSQL migration tests. The `supabase/` SQL files
and Node `pin-store.ts` remain historical test fixtures only; no production route
imports them. Existing private datasets are never automatically exported, copied
or deleted.

## Deployment

```sh
npm run build
npm run deploy
```

The deploy command refuses a missing/placeholder D1 ID or a binding changed since
the last build. Configure Cloudflare Workers Builds with those same commands and
Node 24. [CLOUDFLARE.md](CLOUDFLARE.md) describes the runtime. All secrets and local
state are ignored; only `.env.example` (empty values) is tracked.

Report IDs retain COSA-, OFT-, and OFT-I- prefixes. D1 transactions atomically
allocate numbers, consume GPS/photos, save reports, and create notifications and
pending email delivery rows. Sessions use hashed random tokens and account
versions; deactivation/removal/PIN reset revokes sessions immediately. Every
protected server route checks the D1 session and role. Viewer responses omit
supervisor/assignee identities.

ImgBB remains the photo host and Resend the email provider. Missing integration
credentials produce explicit errors or failed retryable delivery records. GPS
remains device-reported and requires a fresh accurate fix and map confirmation.
Serve over HTTPS. Public ImgBB links are accessible to anyone with the URL;
[optional R2 migration](R2_OPTIONAL.md) is documented separately and not enabled.

The source changes and local test results do not mean that the live D1 binding,
credentials, private admin or live integrations have been configured. Complete
and verify the setup before operational use.

### Report exports and codes
Admin → Reports Management has separate Waste Tracking and Facilities Tracking tabs.
- Waste codes: COSA-102, COSA-103, …; facilities report codes: OFT-001, OFT-002, … (expand naturally beyond 999). Atomic D1 triggers allocate codes; retries do not allocate duplicates. Deleted codes are compacted within their category by migration 0006: remaining report codes move down and the next submission follows without a gap. Report IDs and photo associations stay stable.
- Migration 0005 renumbers existing reports chronologically, preserves report IDs/photo relationships, and aligns both counters. Apply it before deploying this version.
- ZIP uses unchanged stored ImgBB image bytes, named `COSA-102/COSA-102-01.jpg` (or `OFT-001/...`); suffixes distinguish multiple photos.
- Excel exports are actual .xlsx files with all attached photos embedded, Riyadh submission dates, numeric coordinates/weights, clickable Google Maps links, frozen headers, and filters. Facilities Type of Structure is intentionally empty only in the export; the stored value remains unchanged.
- Both export routes enforce Admin authorization and rate limits. JPEG/PNG images are supported by Excel (the app's upload processing stores JPEG). Downloads are saved only after the complete archive is received and its end record is checked. Image-host failures show an error without saving an incomplete file; retry the download. ZIP32 limits apply: under 4 GB and 65,535 archive entries.

### Dashboard login URLs
- Site Survey: `/survey/login` (existing PIN authentication).
- Active Farms KPIs: `/kpi/login` (Coming soon).
- Manpower & Equipment: `/hr/login` (Coming soon).
The legacy `/login` permanently redirects to `/survey/login`. Future dashboard pages do not authenticate users or grant access to Site Survey.

### Admin Excel bulk import
Reports Management provides separate Waste and Facilities `.xlsx` templates, validation previews, and imports. The Reports worksheet has Date, category/site details, decimal Latitude/Longitude, Photo URL 1, and optional Photo URL 2; see the Instructions worksheet. Use direct public HTTPS image links (JPEG/PNG/WebP), not share/gallery pages. Up to 100 rows and 2 MB per file. Invalid spreadsheets are rejected before importing. Rows are committed individually with progress; an interrupted run can resume, and exact same-file row retries are idempotent. Different files are treated as new imports.

Imports are Admin-only and record the administrator and Excel provenance. Imported coordinates are never labelled hardware-GPS verified. Normal Supervisor submissions retain all existing GPS/ownership checks. Photos use ImgBB: existing ImgBB JPEG/PNG images are retained unchanged after validation; other public image URLs are copied to ImgBB, and WebP is converted to JPEG for Excel compatibility. No new paid resources are created. Failed rows leave earlier completed rows saved and report an error.

Migration 0007 adds Excel import provenance and a Waste numbering floor of 102. New Waste records start at COSA-102 and continue upwards; gap compaction respects that floor. Facilities numbering remains independent. The administrator-requested deletion of the twelve old Waste reports is a one-time production data operation, not part of the migration or future deployments. Private local backups are excluded from Git.

### Admin report location corrections
Open a report and choose **Change location** under Recorded location. Admin can enter decimal Latitude/Longitude, check the satellite preview, and save. The server validates ranges, checks the active Admin session, and audits the old/new coordinates. D1 independently rejects location overrides without an authenticated Admin transaction. Viewer and Supervisor cannot change report coordinates.
Migration 0008 stores corrections separately from immutable original GPS/Excel coordinates. Maps, report details, Google Maps links, and Excel exports use the corrected location. Corrected points are labelled Admin updated and do not claim fresh device-GPS verification or the original GPS accuracy. Report codes and photo associations are unchanged.
