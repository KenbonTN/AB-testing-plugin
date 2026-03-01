# A/B Testing Platform
Create, run, and analyze A/B tests directly in Framer.

## What It Does

- **Split traffic** between two design variants (50/50 or custom)
- **Track impressions** when users see a variant
- **Track conversions** when users take action (clicks, submits)
- **Declare winners** based on conversion rates

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Vite |
| Backend | Cloudflare Workers |
| Database | Cloudflare D1 (SQLite) |
| Monorepo | pnpm workspaces |

## Project Structure
apps/
├── plugin/          # Framer plugin UI
└── worker/          # Cloudflare Worker API
packages/
├── types/           # Shared TypeScript types
└── ui/              # Shared React components

## Requirements
- Node >= 20
- pnpm (as package manager)
- Cloudflare Wrangler for worker deploy (if deploying)

## Local development

```bash
# Install dependencies
pnpm install

# Build shared packages
pnpm build --filter=@ab-platform/types --filter=@ab-platform/ui

# Run worker locally
cd apps/worker && pnpm dev

# Run plugin locally (new terminal)
cd apps/plugin && pnpm dev


## API (Worker)
The worker exposes these endpoints (see [apps/worker/src/index.ts](apps/worker/src/index.ts)):
- POST /assign — assign a variant (`handleAssign`)  
- POST /impression — record impression (`handleImpression`)  
- POST /convert — record conversion (`handleConversion`)  
- GET /stats — retrieve stats (`handleStats`)  


## Build & Deploy
cp .env.example .env.local
cd apps/worker && wrangler deploy


License: MIT
