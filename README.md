# A/B Testing Platform for Framer

Run real split tests directly inside Framer — no third-party services, no data leaving your own infrastructure.

---

## What It Does

- **Split traffic** between two design variants (50/50 or any custom ratio)
- **Track impressions** automatically when a visitor sees a variant
- **Track conversions** on click, page load, or scroll-into-view
- **Declare winners** based on conversion rates via the plugin panel

## Architecture

```
Framer site (published)
  └── ABSectionSwap        — assigns variant, tracks impression
  └── ABConversionTrigger  — tracks conversion event
          │
          ▼  HTTPS POST /v1/events
Cloudflare Worker  ←→  D1 SQLite database
          │
          ▼
  Plugin panel (Framer Desktop, local dev server)
          └── reads stats, manages experiments
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime components | React 18, TypeScript |
| Plugin panel | React 18, Vite, framer-plugin |
| Backend | Cloudflare Workers |
| Database | Cloudflare D1 (SQLite) |
| Monorepo | pnpm workspaces + Turborepo |

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | >= 20 | [nodejs.org](https://nodejs.org) |
| pnpm | >= 9 | `npm install -g pnpm` |
| Wrangler CLI | >= 3 | `npm install -g wrangler` |
| Cloudflare account | free tier works | [cloudflare.com](https://cloudflare.com) |
| Framer Desktop | any recent | [framer.com](https://framer.com) |

---

## Setup — Step by Step

### 1. Clone & Install

```bash
git clone https://github.com/KenbonTN/ab-testing-platform.git
cd ab-testing-platform
pnpm install
```

> Always run `pnpm install` from the **repo root**, not inside individual packages. pnpm workspaces link packages together — running install inside a subdirectory breaks workspace symlinks.

---

### 2. Deploy the Cloudflare Worker (Backend)

> Skip to [Step 3](#3-configure-the-plugin-env) if you are using the shared hosted API — see [Using the Hosted API](#using-the-hosted-api).

#### 2a. Log in to Cloudflare

```bash
wrangler login
```

A browser window opens. Authenticate and close it.

#### 2b. Create your D1 database

```bash
wrangler d1 create ab-testing-db
```

Wrangler prints:

```
✅ Successfully created DB 'ab-testing-db'

[[d1_databases]]
binding = "DB"
database_name = "ab-testing-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

Copy the `database_id` value.

#### 2c. Update `wrangler.toml` with your database ID

Open [apps/worker/wrangler.toml](apps/worker/wrangler.toml) and replace the `database_id`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "ab-testing-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"   ← paste your own ID here
```

> The `database_id` is not a secret — it only works with your Cloudflare account credentials. Never add your `CLOUDFLARE_API_TOKEN` to this file.

#### 2d. Run migrations

```bash
pnpm --filter @ab-platform/worker db:migrate
```

#### 2e. Deploy the worker

```bash
pnpm --filter @ab-platform/worker deploy
```

Your worker URL will be printed:

```
https://ab-testing-worker.YOUR-SUBDOMAIN.workers.dev
```

Save this URL — you will use it in Step 3 and inside Framer.

---

### 3. Configure the Plugin Env

The plugin reads the worker URL from an environment file.

#### 3a. Copy the example file

```bash
cp apps/plugin/.env.example apps/plugin/.env.development
cp apps/plugin/.env.example apps/plugin/.env.production
```

#### 3b. Set your worker URL in both files

```env
# apps/plugin/.env.development  AND  apps/plugin/.env.production
VITE_API_URL=https://ab-testing-worker.YOUR-SUBDOMAIN.workers.dev
```

> `.env.development` is loaded by `pnpm dev`. `.env.production` is loaded by `pnpm build`. Both must point to your worker.

---

### 4. Start the Local Dev Server

```bash
cd apps/plugin
pnpm dev
```

You should see:

```
  VITE ready

  Local:  https://localhost:5173/
```

---

### 5. Accept the Self-Signed HTTPS Certificate (One-Time Per Machine)

Framer **requires HTTPS** to load plugins. Vite automatically generates a self-signed certificate via `@vitejs/plugin-basic-ssl`. Browsers block self-signed certs by default, which causes Framer to silently fail to load the plugin.

**You must do this once after every fresh `pnpm dev` start on a new machine:**

1. Open **`https://localhost:5173`** directly in your browser (Chrome, Firefox, or Safari)
2. You will see a security warning page
3. **Chrome/Edge**: click **Advanced** → **Proceed to localhost (unsafe)**
   — or type `thisisunsafe` anywhere on the warning page
4. **Firefox**: click **Advanced** → **Accept the Risk and Continue**
5. **Safari**: click **Show Details** → **visit this website**
6. The page will show a blank screen or the plugin UI — that is correct
7. Return to Framer Desktop and load the plugin

> You must repeat this step after clearing browser data or on a new machine.

---

### 6. Load the Plugin in Framer Desktop

1. Open Framer Desktop
2. Open your project (or create a new one)
3. In the top menu, go to **Plugins** → **Development** → **Load Plugin from URL**
4. Enter: `https://localhost:5173/`
5. Click **Load**

The plugin panel appears on the right. The plugin hot-reloads when you save source files.

> Framer caches the plugin URL. If you change the port, you must re-enter the URL in Framer.

---

### 7. Add Runtime Components to Your Framer Project

After loading the plugin, your two runtime components appear in the **Assets** panel (left sidebar) under **Components**.

#### Adding ABSectionSwap

1. Drag **ABSectionSwap** from Assets onto your canvas
2. In the right **Properties** panel, configure:

| Property | What to enter |
|----------|---------------|
| **Experiment ID** | A unique slug, e.g. `hero-cta-test` |
| **Write Key** | Your project's write key from the API |
| **Split % (Variant A)** | `50` for a 50/50 split |
| **Cookie Days** | `30` (how long to remember variant) |
| **Respect Consent** | `false` for local testing, `true` for production |
| **API URL** | Your worker URL (same as `VITE_API_URL`) |

3. Drag your **control design** into the **Variant A** slot
4. Drag your **test design** into the **Variant B** slot

#### Adding ABConversionTrigger

1. Drag **ABConversionTrigger** onto your canvas (wrap it around a CTA or button)
2. Configure:

| Property | What to enter |
|----------|---------------|
| **Experiment ID** | **Exactly the same** as ABSectionSwap |
| **Write Key** | Same write key as ABSectionSwap |
| **Trigger On** | `click`, `mount`, or `visible` |
| **API URL** | Same worker URL as ABSectionSwap |

3. Drag your button or CTA into the **Content** slot

#### Getting your Write Key

Create a project by calling your worker once:

```bash
curl -X POST https://ab-testing-worker.YOUR-SUBDOMAIN.workers.dev/v1/projects \
  -H "Content-Type: application/json" \
  -d '{"name": "My Framer Site"}'
```

Response:

```json
{
  "project_id": "...",
  "write_key": "use-this-in-framer",
  "read_key": "use-this-in-plugin-panel"
}
```

---

## Using the Hosted API

If you do not want to deploy your own worker, you can use the shared hosted API:

```
https://ab-testing-worker.kenbonfloziio.workers.dev
```

Set this as `VITE_API_URL` and enter it in the **API URL** property of each component. The hosted API is suitable for testing — deploy your own worker for production.

---

## Strict Rules — Must Follow to Avoid Breaking the Plugin

### Experiment IDs

- **`ABSectionSwap` and `ABConversionTrigger` must have the exact same `Experiment ID`** — if they differ by even one character, conversions will never link to impressions.
- **Never change the `Experiment ID` after live traffic has started** — existing visitors have a cookie with the old ID. Changing it re-assigns them randomly and corrupts your data. Create a new experiment instead.
- **Experiment IDs are case-sensitive** — `Hero-Test` and `hero-test` are different experiments.

### API URL

- **Must not have a trailing slash** — `https://worker.workers.dev` works, `https://worker.workers.dev/` does not.
- **Must start with `https://`** — the worker enforces CORS and the browser requires HTTPS on published Framer sites.
- **Both components must point to the same API URL** — mixing URLs (hosted vs. self-hosted) causes data to go to different databases.

### Consent

- **Set `Respect Consent` to `false` during local testing** — by default the component looks for a cookie named `cookie_consent`. No such cookie exists on localhost, so all tracking is silently suppressed and Variant A is always shown.
- **Valid consent cookie values** are exactly: `true`, `accepted`, or `1`. Anything else is treated as no consent.

### framer.json

- **Do not rename the exported function** (`ABSectionSwap`, `ABConversionTrigger`) without also updating the `components` array in [apps/plugin/framer.json](apps/plugin/framer.json).
- **Component paths in `framer.json` must be relative to the manifest file** — e.g. `"src/ABSectionSwap.tsx"`, not an absolute path.
- **Do not import `framer` or `framer-plugin` inside runtime components** — these are not available on the published Framer site. They are externalized by Vite and only available inside the plugin panel.

### Port & HTTPS

- **Port `5173` must be free** — `strictPort: true` is set in Vite config. If the port is in use, `pnpm dev` exits rather than picking another port, because Framer must always connect to the same URL.
- **Always accept the self-signed cert in the browser before loading the plugin in Framer** — if you skip this, Framer silently shows nothing with no error message.
- **Do not change `server.port` in `vite.config.ts`** without also updating the URL you enter in Framer's "Load Plugin" dialog.

### Build & Packages

- **Always run `pnpm install` from the repo root**, not from inside `apps/plugin` or `apps/worker`.
- **If you modify `packages/types`, rebuild it first**: `pnpm build --filter=@ab-platform/types`
- **Do not bundle `framer` or `framer-plugin`** — they are listed as `external` in `vite.config.ts` and injected by the Framer runtime. Bundling them causes version conflicts.

---

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Plugin panel is blank after loading URL | Self-signed cert not accepted | Visit `https://localhost:5173` in browser and accept the warning |
| `ERR_CONNECTION_REFUSED` in Framer | Dev server not running | Run `pnpm dev` in `apps/plugin/` |
| Components missing from Assets panel | `framer.json` path mismatch | Verify file names in `framer.json` match actual file names |
| Always shows Variant A, no network requests | `Respect Consent = true` but no consent cookie | Set **Respect Consent** to `false` for testing |
| Impressions fire but conversions never fire | `Experiment ID` mismatch between components | Copy-paste the ID — do not retype it |
| `401 Unauthorized` in Network tab | Wrong or expired Write Key | Create a new project via `POST /v1/projects` and copy the new key |
| `wrangler d1 migrations apply` fails | Wrong `database_id` in `wrangler.toml` | Run `wrangler d1 list` and copy the correct ID |
| Port 5173 already in use | Another dev server running | Run: `lsof -ti:5173 \| xargs kill` then restart `pnpm dev` |
| Duplicate impressions on every page load | SessionStorage was cleared mid-session | Expected behavior — deduplication resets when sessionStorage clears |

---

## Project Structure

```
ab-testing-platform/
├── apps/
│   ├── plugin/
│   │   ├── src/
│   │   │   ├── ABSectionSwap.tsx        # Runtime component — variant display + impression
│   │   │   ├── ABConversionTrigger.tsx  # Runtime component — conversion tracking
│   │   │   └── main.tsx                 # Plugin panel entry point
│   │   ├── framer.json                  # Plugin manifest — components registered here
│   │   ├── vite.config.ts               # Dev server config (port 5173, HTTPS, externals)
│   │   ├── .env.development             # Local API URL (not committed if using .gitignore)
│   │   ├── .env.production              # Build API URL
│   │   └── .env.example                 # Template — copy to .env.development/.env.production
│   └── worker/
│       ├── src/index.ts                 # All API endpoints
│       ├── migrations/schema.sql        # D1 database schema
│       └── wrangler.toml                # Worker config — update database_id for your account
├── packages/
│   ├── types/                           # Shared TypeScript types
│   └── ui/                              # Shared React components
├── pnpm-workspace.yaml
└── turbo.json
```

---

## License

MIT
