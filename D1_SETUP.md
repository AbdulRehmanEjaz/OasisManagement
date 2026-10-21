# D1 setup and private administrator provisioning

No live D1 database is created or migrated by a build, test or deployment. The
checked-in `database_id` identifies the dedicated Oasis database in this account.
For another Cloudflare account, use its own dedicated D1 database ID.
No paid resources or plan changes are made by the setup code.

## 1. Create and bind D1

1. In your Cloudflare account, open **Storage & databases → D1 SQL Database**.
2. Create `oasis-management-db`. Review your account's quota/terms before confirming;
   this code does not purchase a plan or provision it automatically.
3. Copy its Database ID. Set `database_id` in the `DB` entry
   in repository-root `wrangler.jsonc`. The binding name must stay `DB`.
4. The deployed Worker must have this same D1 binding. Repository config is the
   source of truth: rebuild and deploy after changing it so a later deployment
   does not discard dashboard-only edits. Never attach a production DB to tests.

## 2. Apply the SQL migrations

From the repository root, in your authenticated Cloudflare CLI:

```sh
npm ci
npm run db:migrate:remote
```

This runs `wrangler d1 migrations apply DB --remote` against the exact configured
D1 ID. Inspect the database name/ID before confirming. `migrations/0001_d1.sql`
creates users, hashed sessions, throttles, GPS verifications, photo metadata,
both reporting modules, facilities, counters, notifications, email delivery,
audits and category defaults. It creates **no accounts or plaintext PINs**.

Alternatively apply the complete migration through the D1 dashboard SQL console,
including all triggers and seed statements. The Wrangler migration command is
preferred because it tracks the applied version and rolls back failed migrations.

An existing Supabase project is not needed. The deployed application previously
had no configured production database, so no records have been copied. If you
have a separate existing dataset, arrange a private export and reviewed offline
import before cutover; do not paste records or credentials into chat. Retain its
UUIDs, timestamps, photo URLs and report numbers and advance the D1 counters;
historical data requires an explicit import procedure because normal write
triggers reject stale GPS. There is no automatic data transfer or deletion.

## 3. Set secrets and environment values

In **Workers & Pages → oasis-management → Settings → Variables and Secrets**:

| Name | Type / purpose |
| --- | --- |
| `PIN_LOOKUP_SECRET` | Required secret: at least 32 cryptographically random characters. Generate privately in a password manager. Keep a secure backup and keep it stable: it keys unique PIN fingerprints. Rotation without re-enrolling PINs breaks lookup. |
| `ADMIN_SETUP_TOKEN` | Temporary secret: at least 32 random characters, different from the lookup secret. Keep private; used only to authorize first-admin setup. |
| `IMGBB_API_KEY` | Secret required for photo uploads. |
| `RESEND_API_KEY` | Secret required for email delivery. |
| `RESEND_FROM_EMAIL` | Verified Resend sender address. |
| `MANAGER_EMAIL` | Intended notification recipient. |
| `APP_URL` | Final canonical HTTPS deployment URL. |
| `APP_TIMEZONE` | `Asia/Riyadh` for the existing local date/report filters. |
| `GPS_ACCURACY_METERS` | UI target, normally 20; keep it aligned with `app_settings.gps_accuracy_meters` in D1. |

You can instead run `npx wrangler secret put NAME` for each secret; enter its value
only in the private CLI prompt. Never put values in shell arguments, GitHub,
Wrangler `vars`, chat, screenshots or logs. Initial/default PIN variables and
Supabase variables are no longer used. D1 needs no database password/API key in
the browser; access is through the Worker's `DB` binding.

The existing `IMAGES` binding processes raw photos before ImgBB upload. Images
transformations and the existing Worker CPU limit may require enabled services
or a suitable plan. Review those account requirements yourself; no automatic
upgrade or R2 bucket creation is performed here.

## 4. Deploy and create your private administrator

```sh
npm run typecheck
npm run build
npm run deploy -- --dry-run
npm run deploy
```

Open `https://YOUR-WORKER-DOMAIN/setup` yourself. Enter the temporary setup token,
your name, a **private Admin PIN of 3 digits**, and its confirmation. Also enter
different Viewer and Supervisor PINs of 3 digits. Setup creates all three
accounts atomically. Choose PINs
unrelated to public examples; never send it to the assistant. Inputs are masked,
not persisted in browser storage, and transmitted only over your HTTPS origin.
The server uses a random 16-byte salt and scrypt; only the salted hash and HMAC
fingerprint are stored. Request bodies/PINs are never logged by application code.

A unique D1 bootstrap lock and account creation run in one transaction. A second
setup cannot overwrite users, even if concurrent requests know the token. After
success, delete `ADMIN_SETUP_TOKEN` from Worker settings. The setup endpoint then
returns "disabled"; the already-created account remains valid. There is no
public registration or default PIN fallback.

Sign in with your private PIN at `/login`. In **Users & PINs**, manage the Viewer
and Supervisor accounts and add named staff as needed. Do not recreate the old
public sample PINs. PIN changes, activation changes and account removal revoke
all sessions for that account. You cannot remove/deactivate your own account or
remove the last active admin. Viewer exports never include the user directory,
supervisor names, assignee identities, PIN hashes or session information.

## 5. Verify before inviting your team

- Verify your admin login, user management, logout and private PIN reset.
- Verify Viewer can read reports/maps/photos but cannot read users or write.
- Verify Supervisor can submit and choose assigned facilities but cannot browse
  existing reports or use admin controls.
- Upload real photos with ImgBB, capture GPS outdoors on a suitable device, open
  the map, confirm and submit. Check the persisted coordinates and report number.
- Verify notifications and a Resend email from the verified sender. Missing email
  credentials do not erase reports; the failed delivery is visible for admin retry.

Only after the live binding exists, migrations are applied and these steps pass
should you treat live login and operations as configured. Local test success does
not verify your cloud credentials, email domain or hardware GPS accuracy.

## Security and operational details

Sessions last at most eight hours. Only SHA-256 hashes of random 256-bit session
tokens are stored. Production cookies use `__Host-`, Path=/, HttpOnly, Secure,
SameSite=Strict and no Domain attribute. Each protected page/API checks active
account, version, expiry and role; modifying transactions recheck the session.
PIN login has persistent per-IP and per-PIN five-attempt/5-minute limits plus a
60-attempt global bound. Success does not reset attempts. Keys contain HMACs,
not raw IPs/PINs. Setup, uploads, admin changes and report actions are also bounded.

D1 is not public PostgREST and has no RLS. Its binding is private to the Worker;
explicit role checks and safe response projections replace RLS/RPCs. SQL values
are bound parameters, and record types/columns are allowlisted. Triggers and
`D1.batch` preserve atomic report numbering, photo/GPS ownership, idempotency,
notifications and rollback. Back up D1 and secrets through your Cloudflare account;
never expose the binding or use a broad browser-side database credential.

Email retries use durable claims and a provider idempotency key. A crash after
provider acceptance can leave a claim pending; reconcile Resend logs before a
trusted operator clears that claim. "Sent" means provider acceptance, not a
verified delivery webhook. Expired sessions/throttle rows are cleaned on login;
review abandoned uploads and old verification rows as routine maintenance.

Sources: https://developers.cloudflare.com/d1/worker-api/d1-database/ and
https://developers.cloudflare.com/d1/reference/migrations/
