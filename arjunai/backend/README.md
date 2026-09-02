# Finowings AI — Backend

FastAPI service powering chat, model routing and market data.

## Deploying on Vercel

Create a **separate** Vercel project from the same repository with:

| Setting | Value |
| --- | --- |
| Root Directory | `arjunai/backend` |
| Framework Preset | Other |

`vercel.json` routes every request to `api/index.py`, which exposes the ASGI app
from `main.py`. Streaming chat responses get `maxDuration: 300`.

### Environment variables

Add these in **Settings → Environment Variables**. API keys must be typed as
**Secret**; never give them a `NEXT_PUBLIC_` prefix.

| Variable | Required | Notes |
| --- | --- | --- |
| `GEMINI_API_KEY` | yes | `GEMINI_API_KEY_2` / `_3` are also read, for rotation |
| `OPENAI_API_KEY` | optional | enables the GPT models |
| `CLAUDE_API_KEY` | optional | enables the Claude models |
| `GROQ_API_KEY` | optional | enables the Groq models |
| `GROK_API_KEY` | optional | enables Grok |
| `FRONTEND_URL` | **yes** | the deployed frontend origin, e.g. `https://cryptowithai.vercel.app` — no trailing slash |
| `REDIS_URL` | optional | response caching; the app runs fine without it |

`FRONTEND_URL` is added to the CORS allow-list. Without it the browser blocks
every request from the deployed frontend, and chat fails with a network error.
Only that one origin is allowed, so Vercel *preview* URLs stay blocked.

## Local development

```bash
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env      # then fill in your keys
uvicorn main:app --reload --port 8001
```
