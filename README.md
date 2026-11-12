# CryptoAndAI

AI-powered crypto trading terminal — chat assistant, live market charts, strategy
backtesting, AI coin screener aur portfolio tracking, sab ek jagah.

```
cryptoandai/
├── frontend/          # Next.js app  →  Vercel
├── backend/           # Ek hi Python service  →  Render
│   ├── main.py        #   entrypoint: FastAPI + mounted Flask
│   ├── ai/            #   chat, models, market context
│   └── trading/       #   candles, backtest, screener, orders, auth
├── docs/              # research aur reports
└── render.yaml        # backend ka deploy blueprint
```

Do hi cheezein hain: **ek frontend, ek backend.**

---

## Backend

AI chat aur crypto trading dono ek hi service mein chalte hain. Andar do frameworks
hain (chat FastAPI par, trading Flask par) par bahar se ek hi app hai, ek hi port
aur ek hi `.env`. `backend/main.py` FastAPI app par Flask ko mount kar deta hai,
isliye dono ke saare URLs bina badle kaam karte hain:

| Route | Kaun handle karta hai |
|---|---|
| `/health`, `/api/models`, `/api/chat`, `/api/chart/*` | FastAPI (`ai/`) |
| `/api/candles`, `/api/screener`, `/api/backtest` | Flask (`trading/`) |
| `/api/orders`, `/api/auth/*`, `/api/byok/*`, `/api/delta/*` | Flask (`trading/`) |

### Local par chalao

```bash
cd backend
python3 -m venv venv
venv/bin/pip install -r requirements.txt
cp .env.example .env          # phir apni keys bharein
venv/bin/python -m uvicorn main:app --reload --port 8000
```

Check: <http://127.0.0.1:8000/health> aur <http://127.0.0.1:8000/api/health>

### Env

Sab kuch `backend/.env` mein — AI providers (`GEMINI_API_KEY`, `OPENAI_API_KEY`,
`CLAUDE_API_KEY`, `GROQ_API_KEY`) aur Delta Exchange (`DELTA_API_KEY`,
`DELTA_SECRET_KEY`). Poori list `backend/.env.example` mein hai.

---

## Frontend

```bash
cd frontend
npm install
cp .env.example .env.local    # backend ka URL check kar lein
npm run dev                   # http://127.0.0.1:3003
```

Pages: `/` (AI chat) · `/trade` (Markets, Screener, Backtest, Strategies) ·
`/trade/strategies/[id]` (har strategy ka apna run page) · `/portfolio`

---

## Deploy

| Kya | Kahan | Setting |
|---|---|---|
| Backend | Render | `render.yaml` blueprint — `rootDir: backend`, start `uvicorn main:app` |
| Backend (alternative) | Vercel | `backend/vercel.json` + `backend/api/index.py` |
| Frontend | Vercel | **Root Directory = `frontend`** |

Deploy ke baad frontend ke env mein backend ka URL daalein
(`NEXT_PUBLIC_BACKEND_URL`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_CRYPTO_API_URL` —
teeno wahi ek URL), aur backend ke `FRONTEND_URL` mein frontend ka origin
(bina trailing slash) — warna CORS request block kar dega.

### Hostinger VPS (Docker)

Poora stack ek server par: Caddy (80/443, auto HTTPS) → frontend + backend,
saath mein Postgres aur Redis. Files: `docker-compose.yml`, `deploy/`.

```bash
# 1. Ek baar — VPS taiyaar karo (Docker, firewall, swap)
ssh root@187.126.116.78 'bash -s' < deploy/server-setup.sh

# 2. Ek baar — server par .env banao
./deploy/deploy.sh root@187.126.116.78        # code bhejega, .env na milne par ruk jaayega
ssh root@187.126.116.78
cd /opt/cryptoandai && cp .env.production.example .env && nano .env

# 3. Har deploy par (Mac se)
./deploy/deploy.sh root@187.126.116.78
```

Domain lagana ho to uska A record VPS IP par point karein, phir server ki `.env`
mein `SITE_ADDRESS=example.com` aur `PUBLIC_URL=https://example.com` karke
`./deploy/deploy.sh` dobara chalayein. Logs: `docker compose logs -f backend`.

---

## Note

Ye software analysis aur backtesting ke liye hai, investment advice ke liye nahi.
Crypto trading mein poora capital doob sakta hai.
