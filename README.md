# Dallty

A booking marketplace platform for Algeria.

## Development

Requires Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone git@github.com:mimou900/dallty.git
cd dallty
npm i
cp .env.example .env   # fill in real values locally, never commit .env
npm run dev
```

Other scripts: `npm run build` (production build), `npm run lint`, `npx tsc --noEmit` (type-check).

## Architecture

See [`docs/DALLTY_MASTER_ARCHITECTURE.md`](docs/DALLTY_MASTER_ARCHITECTURE.md) for the full
architecture, [`docs/DALLTY_DEPLOYMENT.md`](docs/DALLTY_DEPLOYMENT.md) for deployment, and
[`docs/DALLTY_VENDOR_INDEPENDENCE.md`](docs/DALLTY_VENDOR_INDEPENDENCE.md) for how this project
depends only on Dallty-owned provider abstractions rather than any single vendor SDK.

## Built with

- TanStack Start
- TypeScript
- React
- Tailwind CSS
- Supabase (database, auth, storage)
- Vercel (hosting) + Cloudflare (DNS/CDN)
