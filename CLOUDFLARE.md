# Cloudflare Workers runtime

The existing vinext/Vite/Wrangler build and the mobile UI are retained. The
production backend now uses **Cloudflare D1**, not Supabase. Start with
[D1_SETUP.md](D1_SETUP.md) for binding, migrations, secrets and private admin setup.

Cloudflare Workers Builds: Node 24, install `npm ci`, build `npm run build`, deploy
`npm run deploy`. The build output is `dist/server/wrangler.json` and `dist/client`.
Do not run an OpenNext migration or deploy `.next`/a static export. Update the
Worker name if your existing project is named differently.

`npm run build:vinext` remains an alias for the Worker production build;
`npm run dev:vinext` runs the Worker locally. `npm run dev` keeps the original
Next.js UI development server and proxies local D1. `build:next` is retained for
framework compatibility checks, but Node production hosting is not the D1 target.

Run:

```sh
npm run check:vinext
npm run typecheck
npm test
npm run test:worker
npm run build
npm run test:app
npm run deploy -- --dry-run
```

Tests only apply migrations to isolated **local** D1 databases. They do not
provision remote resources, replace live account PINs, or send data to providers.
The deployment wrapper refuses the placeholder database ID for a real deployment.

Photo processing retains sharp in Node and uses the existing IMAGES binding on
Workers. Images performs raster validation, resizing inside 2000×2000 without
upscaling and JPEG conversion at quality 82. ImgBB hosting and Resend delivery
are retained. Unsupported HEIC/HEIF inputs still need JPEG export. Native sharp
and the historical SQLite access store are excluded from the Worker.

Node scrypt, HMAC and timing-safe PIN verification run in workerd. The configured
30-second CPU ceiling accommodates PIN hashing and rendering; verify your plan
supports it. Images transformations may incur charges when used. No plan change,
new paid resource, R2 bucket or live D1 provisioning is automated.

Authenticated responses are not CDN/data-cached. Hashed static assets still use
Cloudflare asset serving. `.env.local`, `.dev.vars`, `.wrangler`, `dist` and local
state are ignored. Vite may generate `dist/server/.dev.vars` for preview; it is
not committed or automatically published as production secrets.

Known upstream audit limitation remains: ten findings (six high, four moderate)
in vinext's glob/OG dependency chain. A force downgrade is not applied. No user
build-glob/OG generation feature is exposed by this application. Build source-map
warnings are upstream tooling warnings; verify account-specific live integrations
separately. The live Worker is not updated merely by running a local build/test.
