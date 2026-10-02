#!/usr/bin/env bash
# Mac se VPS par code bhejo aur stack (re)build karo.
#   ./deploy/deploy.sh root@187.126.116.78
#
# Pehli baar: server par /opt/cryptoandai/.env banana zaroori hai
# (template: .env.production.example). Script use kabhi overwrite nahi karta.
set -euo pipefail

TARGET="${1:-root@187.126.116.78}"
APP_DIR=/opt/cryptoandai
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> Code bhej rahe hain: $TARGET:$APP_DIR"
ssh "$TARGET" "mkdir -p $APP_DIR"
rsync -az --delete \
  --exclude '.git' \
  --exclude '.env' \
  --exclude '.env.local' \
  --exclude 'node_modules' \
  --exclude '.next' \
  --exclude 'venv' \
  --exclude '__pycache__' \
  --exclude '*.sqlite3' \
  --exclude '*.tsbuildinfo' \
  --exclude '.vercel' \
  --exclude '.claude' \
  --exclude '.cursor' \
  --exclude 'docs' \
  --exclude '.DS_Store' \
  "$ROOT/" "$TARGET:$APP_DIR/"

echo "==> Build aur start"
ssh "$TARGET" bash -s <<EOF
set -euo pipefail
cd $APP_DIR
if [ ! -f .env ]; then
  echo "❌ $APP_DIR/.env nahi mili."
  echo "   Server par: cp .env.production.example .env && nano .env"
  exit 1
fi
docker compose up -d --build --remove-orphans
docker image prune -f >/dev/null
docker compose ps
EOF

echo
echo "✅ Deploy ho gaya. Check: curl -s http://${TARGET#*@}/health"
