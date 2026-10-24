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
- Waste codes: COSA-001, COSA-002, …; facilities report codes: OFT-001, OFT-002, … (expand naturally beyond 999). Atomic D1 triggers allocate codes; retries do not allocate duplicates. Deleted codes are compacted within their category by migration 0006: remaining report codes move down and the next submission follows without a gap. Report IDs and photo associations stay stable.
- Migration 0005 renumbers existing reports chronologically, preserves report IDs/photo relationships, and aligns both counters. Apply it before deploying this version.
- ZIP uses unchanged stored ImgBB image bytes, named `COSA-001/COSA-001-01.jpg` (or `OFT-001/...`); suffixes distinguish multiple photos.
- Excel exports are actual .xlsx files with all attached photos embedded, Riyadh submission dates, numeric coordinates/weights, clickable Google Maps links, frozen headers, and filters. Facilities Type of Structure is intentionally empty only in the export; the stored value remains unchanged.
- Both export routes enforce Admin authorization and rate limits. JPEG/PNG images are supported by Excel (the app's upload processing stores JPEG). Downloads are saved only after the complete archive is received and its end record is checked. Image-host failures show an error without saving an incomplete file; retry the download. ZIP32 limits apply: under 4 GB and 65,535 archive entries.
