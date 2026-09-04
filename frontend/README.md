# Finowings AI — Frontend

Next.js 16 app: AI chat, portfolio tracking, and a crypto trading terminal
(live Delta Exchange candles, EMA overlays, backtesting and strategies).

## Deploying on Vercel

This app lives in a **subdirectory** of the monorepo, so the Vercel project must
be configured with:

| Setting | Value |
| --- | --- |
| Root Directory | `arjunai/frontend-nextjs` |
| Framework Preset | Next.js (auto-detected) |

Leaving Root Directory empty makes Vercel build the repository root, which has no
app in it — the deployment then serves a `404: NOT_FOUND`.

## Environment variables

Set these in **Project → Settings → Environment Variables**. Each value is the
public URL of a backend you have deployed; the defaults below only work locally.

| Variable | Points at | Local default |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | `arjunai/backend` (FastAPI, chat/AI) | `http://localhost:8001` |
| `NEXT_PUBLIC_CRYPTO_API_URL` | `cryptoproject` (Flask) — note the `/api` suffix | `http://127.0.0.1:2000/api` |
| `CRYPTO_API_URL` | `cryptoproject` — same host, **no** `/api` suffix | `http://127.0.0.1:2000` |

`NEXT_PUBLIC_*` variables are inlined at build time, so changing one requires a
**redeploy**, not just a save.

Without these the site still builds and renders; the trade page simply reports
that the backend is offline.

## Local development

```bash
npm install
npm run dev
```

Runs on http://127.0.0.1:3003. Copy `.env.example` to `.env.local` first if you
need to point at non-default backend ports.

The crypto backend is started separately:

```bash
cd ../../cryptoproject && python3 backend_api.py
```
