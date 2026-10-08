#!/usr/bin/env bash
# 로컬에서 실행: bash scripts/deploy.sh [branch]  (기본 master)
# 서버에 저장소가 없으면 만든다 (.env가 먼저 있어도 되도록 clone 대신 init + remote 사용)
set -euo pipefail

BRANCH="${1:-master}"
KEY="${DEPLOY_KEY:-$HOME/.ssh/coffee_note_deploy}"
PORT="${DEPLOY_PORT:-2022}"
TARGET="${DEPLOY_USER:-rocky}@${DEPLOY_HOST:-bytebard.cloud}"
REPO_URL=https://github.com/ApostleB/coffee-note.git
APP_DIR=/home/rocky/coffee-note

ssh -i "$KEY" -p "$PORT" "$TARGET" \
  "set -euo pipefail; if [ ! -d $APP_DIR/.git ]; then mkdir -p $APP_DIR && git init -q $APP_DIR && git -C $APP_DIR remote add origin $REPO_URL; fi; cd $APP_DIR && git fetch origin && git checkout -B '$BRANCH' 'origin/$BRANCH' && bash scripts/remote-deploy.sh '$BRANCH'"
