#!/usr/bin/env bash
# 서버에서 실행: bash scripts/remote-deploy.sh [branch]  (기본 master)
set -euo pipefail

BRANCH="${1:-master}"
APP_DIR=/home/rocky/coffee-note

export PATH="$HOME/.local/bin:$PATH"

cd "$APP_DIR"
git fetch origin
git checkout -B "$BRANCH" "origin/$BRANCH"

if ! command -v pnpm >/dev/null 2>&1; then
  npm i -g pnpm@11 --prefix "$HOME/.local"
fi

pnpm install --frozen-lockfile
pnpm build

if [ ! -f .env ]; then
  echo "오류: $APP_DIR/.env 가 없습니다. .env.example을 참고해 만든 뒤 다시 실행하세요." >&2
  exit 1
fi

pnpm migrate
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save

# 기동 직후에는 연결이 거부될 수 있어 몇 번 재시도한다
curl -fsS --retry 10 --retry-delay 1 --retry-connrefused http://127.0.0.1:3070/healthz
echo
