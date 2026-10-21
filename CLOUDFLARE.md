# Cloudflare Workers deployment

This repository uses vinext + Vite + Wrangler for Workers, alongside the original
Next.js development server. Do not run OpenNext's interactive migration.

## Cloudflare Git build settings

- Project root: the repository root containing `package.json` and `wrangler.jsonc`.
- Install: `npm ci` (Node 24; configure `NODE_VERSION=24` in Workers Builds).
- Build command: `npm run build`.
- Deploy command: `npm run deploy`.
- The build generates `dist/server/wrangler.json` and `dist/client`; deploy the
  generated Worker configuration, not `.next` and not a static export.
- Worker name: `oasis-management`. If the existing Cloudflare Worker has another
  name, change `name` in `wrangler.jsonc` to match it before deploying.

The checked-in Wrangler configuration prevents framework auto-detection from
starting an OpenNext migration. `next.config.mjs` explicitly records the existing
default Next configuration; it is not an OpenNext configuration.

## Environment and provisioning

Set the variables listed in `.env.example` in the deployed Worker's settings.
Sensitive values must be Worker secrets, not committed Wrangler `vars` or client
environment variables. Supabase URL and anon key are public configuration;
`SUPABASE_SERVICE_ROLE_KEY`, `PIN_LOOKUP_SECRET`, `IMGBB_API_KEY`, and
`RESEND_API_KEY` must remain server-only. Set `APP_URL` to the final HTTPS URL.
The `NEXT_PUBLIC_*` values should also be available to the build when used there.

Apply the existing three Supabase migrations and run `bootstrap-panels` from a
trusted Node environment as described in README.md. Never provision or reset
accounts during a Worker build. Keep `PIN_LOOKUP_SECRET` stable. Initial PIN
variables are for trusted provisioning only; remove them from the Worker after
provisioning. Supabase Auth's Site URL must match the deployed HTTPS domain.

Local `.env.local` and `.dev.vars` are ignored. Vite may generate an ignored
`dist/server/.dev.vars` for local preview; do not upload that file manually or
commit it. Wrangler deploy does not publish local dev-vars as Worker secrets.

## Runtime compatibility

| Component | Workers implementation and limits |
| --- | --- |
| PINs / Node crypto | Existing salted scrypt format, HMAC lookup and timing-safe comparison. Actual `workerd` tests verify a Node-generated scrypt vector and hash/check round trips. No PIN migration. |
| Local SQLite | Node-only development store remains available under `npm run dev`. The Vite Worker build substitutes a factory that refuses local login; production requires Supabase, as before. No SQLite/native addon is bundled into the Worker. |
| Photos / sharp | Node keeps its original sharp processing. Workers use the `IMAGES` binding for safe raster decoding, the 60-million-pixel limit, resize inside 2000×2000 without enlargement, and JPEG quality 82 conversion before the original ImgBB upload. Unsupported HEIC/HEIF files still require JPEG export. No empty sharp stub is used. |
| Cloudflare Images | Binding is declared as `IMAGES`. Enable Images transformations for the account before operational uploads. Transformations may incur Cloudflare Images charges. Local tests use the offline Images emulator; remote format support and billing are account-dependent. |
| Supabase | Existing SSR cookies, service-role calls, RPCs, RLS, roles and account checks are retained. Package execution is checked with fixture HTTP transport. Live authentication/database setup still requires a configured project. |
| ImgBB | Existing HTTPS multipart upload and upload-registration flow retained. Workers multipart/base64 encoding is tested; live hosting requires a valid ImgBB key. |
| Resend | Existing HTTPS JSON delivery, idempotency and retry behavior retained. Request encoding is tested; live email requires a valid key and verified sender. |
| GPS / maps | Browser-side device capture and Leaflet are unchanged. Use HTTPS and allow precise location on the device; hosting cannot guarantee hardware GPS precision. |

The Worker CPU limit is 30 seconds to accommodate scrypt and server rendering.
Use a Workers plan that supports that configured limit; the Free plan's CPU
budget is unsuitable for relying on these password-hashing operations. No plan
upgrade or billable cloud resource is provisioned by this configuration change.

Authenticated application responses deliberately have no added CDN/data cache.
Static hashed assets still use Cloudflare's asset serving.

## Verification commands

```sh
npm run check:vinext
npm run typecheck
npm test
npm run test:worker
npm run build:next
npm run build
npm run deploy -- --dry-run
```

`test:worker` runs isolated workerd tests with fixture credentials and local image
emulation; it does not send real data to external services. To inspect the actual
built application locally, run `npm run start:vinext` (production Supabase
configuration is required to log in). The original local server remains
`npm run dev`; the original Node production build is `npm run build:next`.

The compatibility scanner passed with no partial or unsupported framework
features. Tests also cover the unchanged panel permissions and database
policies. A successful build/dry run is not proof of a live account deployment,
real-device GPS accuracy, or provider credentials. Those require an authorized
Cloudflare deployment and live integration checks.

The dependency audit currently reports 10 transitive/toolchain findings (6 high,
4 moderate), via vinext's OG/glob dependencies. `npm audit` proposes downgrading
vinext rather than a safe in-range fix. No force downgrade is applied; assess
upstream fixes before production rollout. This application does not use OG image
generation or accept user-supplied build glob patterns.

Sources:
- https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/
- https://github.com/cloudflare/vinext
- https://developers.cloudflare.com/workers/runtime-apis/nodejs/crypto/
- https://developers.cloudflare.com/images/optimization/binding/
