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
- Active Farms KPIs: `/kpi/login` (independent KPI PIN authentication).
- Manpower & Equipment: `/hr/login` (Coming soon).
The legacy `/login` permanently redirects to `/survey/login`. Survey and KPI use independent users, PINs and session cookies. HR remains a separate reserved dashboard.

### Admin Excel bulk import
Reports Management provides separate Waste and Facilities `.xlsx` templates, validation previews, and imports. The Reports worksheet has Date, category/site details, decimal Latitude/Longitude, Photo URL 1, and optional Photo URL 2; see the Instructions worksheet. Use direct public HTTPS image links (JPEG/PNG/WebP), not share/gallery pages. Up to 100 rows and 2 MB per file. Invalid spreadsheets are rejected before importing. Rows are committed individually with progress; an interrupted run can resume, and exact same-file row retries are idempotent. Different files are treated as new imports.

Imports are Admin-only and record the administrator and Excel provenance. Imported coordinates are never labelled hardware-GPS verified. Normal Supervisor submissions retain all existing GPS/ownership checks. Photos use ImgBB: existing ImgBB JPEG/PNG images are retained unchanged after validation; other public image URLs are copied to ImgBB, and WebP is converted to JPEG for Excel compatibility. No new paid resources are created. Failed rows leave earlier completed rows saved and report an error.

Migration 0007 adds Excel import provenance and a Waste numbering floor of 102. New Waste records start at COSA-102 and continue upwards; gap compaction respects that floor. Facilities numbering remains independent. The administrator-requested deletion of the twelve old Waste reports is a one-time production data operation, not part of the migration or future deployments. Private local backups are excluded from Git.

### Admin report location corrections
Open a report and choose **Change location** under Recorded location. Admin can enter decimal Latitude/Longitude, check the satellite preview, and save. The server validates ranges, checks the active Admin session, and audits the old/new coordinates. D1 independently rejects location overrides without an authenticated Admin transaction. Viewer and Supervisor cannot change report coordinates.
Migration 0008 stores corrections separately from immutable original GPS/Excel coordinates. Maps, report details, Google Maps links, and Excel exports use the corrected location. Corrected points are labelled Admin updated and do not claim fresh device-GPS verification or the original GPS accuracy. Report codes and photo associations are unchanged.


### KPI dashboard
`/kpi` provides Admin, Viewer and Supervisor panels with accounts isolated from Survey. Admin can enter historical daily reports, edit/delete entries and manage KPI users/PINs; Viewer is read-only with supervisor identities omitted; Supervisor submits today's Riyadh activity once and views their own reports; Admin handles corrections. PIN changes and session revocation apply only within that dashboard.

Migration 0009 creates separate KPI tables, indexes and authorization triggers without changing Survey records or importing example data. The dashboard starts empty. All writes require authenticated same-origin requests and database authorization guards; creates are idempotent and edits/deletions are audited.

Project dates, targets and 13 custom reporting weeks are centralized in src/lib/kpi/config.ts. Reporting supports daily, weekly, calendar monthly, full-project and custom ranges, with separate period totals and cumulative completion through the cutoff. Pruning and Composting are independent all-tree activities with separate 16,000-tree targets. All activity inputs are independent: there is no cross-field comparison requiring date-palm pruning to be below tree pruning. Tree Base Management excludes date palms, which have their own basin field. Crop Management averages pruning, composting and tree-base percentages. Operational trips, basins and kilograms are kept separate from tree/hectare KPIs.

Validation: unit calculation tests, isolated D1 role/ownership tests, application HTTP/authentication tests, production Worker build and Wrangler dry-run. No sample reports are written to production during verification.

### Mobile Supervisor KPI submission
Supervisors open directly into an inline daily form after KPI login. English/Arabic switching covers the Supervisor navigation, form labels, hints, units, confirmation and own-report details; Arabic uses right-to-left layout and the language preference is stored locally. Mobile inputs use numeric keyboards and a sticky submit action.

Migration 0010 enforces one submission per Supervisor per Riyadh calendar day, including concurrent requests and reports later soft-deleted. Same-request retries remain idempotent. Submitted reports are read-only to Supervisors; corrections go through Admin in Daily Reports. Admin historical entry remains available. Existing reports are retained.

Migration 0011 adds audited Admin-only form wording settings. The Admin Edit tab changes English/Arabic activity labels and instructions without changing metric keys, units or calculations. Changes reach forms on the next refresh; edit an already opened form only after saving or cancelling its draft.

### Editable KPI form and daily-report filters
Admin Edit can add up to 30 bilingual textboxes, mark additional fields required, remove fields from future forms, and restore removed fields. Removal retains the field definition and historical answers; existing numeric KPI quantities and calculations remain unchanged. New textboxes store additional text independently in custom_fields (migration 0012). Hidden standard KPI inputs are omitted from new forms, not removed from historical reports. Supervisor identity is fixed by authentication. Required custom answers are checked on the server.

Supervisor forms start in Arabic on each opening, with an English switch. The automatic Riyadh reporting date appears in a compact form-title capsule. Admin Users & PINs supports audited name changes and the existing secure PIN-reset process. Account changes apply only to the selected dashboard.

Daily Reports loads every authorized report through paginated API reads, presents the newest submission first, and supports inclusive activity-date ranges, Supervisor filtering for Admin, search, and paginated display. Clearing filters restores the complete report list.

### Dashboard account isolation
Migration 0013 scopes users and credential fingerprints to Survey, KPI or future HR, preserves globally unique account IDs for report ownership, scopes last-Admin protection, and invalidates old shared sessions. Survey and KPI use separate HttpOnly Secure SameSite cookies. Login/account requests explicitly select a dashboard; server routes validate the matching scoped session. Cross-dashboard account edits and data requests are rejected. Existing PIN values may be retained independently; changing a name, PIN, activation or session in one dashboard does not change another.

Production account separation is a backed-up, rehearsed one-time maintenance operation using private SQL excluded from Git. It retains original Survey owner IDs and restores its original Supervisor credentials from the pre-KPI backup, while preserving all current KPI identities and credentials under separate account IDs. No default PIN is added to application code. Reports, quantities, photos and GPS metadata are not deleted or renumbered.

### KPI-only historical Excel import
Admin KPI Daily Reports provides Download template and Import Excel. The .xlsx template uses the supplied 21 bilingual columns; existing workbooks with the matching English/Arabic headers, whitespace differences and supported spelling aliases are accepted. It reads the first worksheet, supports shared/rich Unicode text, Arabic/Persian digits and separators, Excel 1900/1904 date serials, ISO or DD/MM/YYYY dates, and Excel or 24/12-hour times. Blank quantities become zero. Whole-number counts, non-negative values, dates within the configured project are validated before preview; formulas and Excel errors are rejected. Maximum: 1,000 rows and 2 MB per file.

Supervisor names are matched conservatively to existing active KPI accounts only. Admin explicitly maps unknown or ambiguous names before import; the importer never creates accounts or changes PINs. Dyana and Truck columns contain trip counts, with volume calculated at 3 and 12 cubic metres per trip respectively. Compost remains independent. Original Time, GPS, supervisor text and file/row provenance are retained separately; imported GPS never claims hardware verification. Viewer responses omit source supervisor identity metadata.

Migration 0014 adds KPI-only import provenance and unique import keys. Identical canonical row retries (including renamed files or concurrent submissions) are skipped. Historical submissions with distinct times/locations/GPS remain separate; conflicting quantities for the same imported historical identity are flagged rather than overwritten. Admin-deleted imports are not automatically resurrected. Import runs in bounded batches with per-row results; earlier successful rows remain saved if later rows fail. Survey data, routes and users are not changed.
