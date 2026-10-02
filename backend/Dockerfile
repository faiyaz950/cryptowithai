# Backend — FastAPI (AI chat) + mounted Flask (trading), ek hi uvicorn process.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

RUN useradd --create-home --uid 1000 app && mkdir -p /data && chown -R app:app /app /data
USER app

EXPOSE 8000

# Ek hi worker: startup par Django migrate chalta hai aur rate-limit state
# memory mein hai — kai workers hone par dono gadbad karte hain.
# --proxy-headers: Caddy ke peeche asli client IP aur https scheme dikhe.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
