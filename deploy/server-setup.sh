#!/usr/bin/env bash
# VPS ki one-time setup (Ubuntu). Root ke taur par chalayein:
#   ssh root@187.126.116.78 'bash -s' < deploy/server-setup.sh
# Dobara chalana safe hai.
set -euo pipefail

APP_DIR=/opt/cryptoandai

echo "==> Packages update"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y ca-certificates curl rsync ufw

echo "==> Docker"
if ! command -v docker >/dev/null 2>&1; then
  # Ubuntu ke apne packages pehle — naye Ubuntu releases par get.docker.com
  # kabhi-kabhi der se support deta hai.
  if ! apt-get install -y docker.io docker-compose-v2; then
    curl -fsSL https://get.docker.com | sh
  fi
fi
if ! docker compose version >/dev/null 2>&1; then
  apt-get install -y docker-compose-plugin || apt-get install -y docker-compose-v2
fi
systemctl enable --now docker

echo "==> Swap (Next.js build ko RAM chahiye hoti hai)"
if ! swapon --show | grep -q '/swapfile'; then
  fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "==> Firewall (SSH, HTTP, HTTPS)"
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

mkdir -p "$APP_DIR"

echo
echo "Setup ho gaya. Docker: $(docker --version)"
echo "Ab Mac se chalayein:  ./deploy/deploy.sh root@<VPS-IP>"
