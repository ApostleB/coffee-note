#!/usr/bin/env bash
# 로컬에서 실행: bash scripts/deploy.sh [branch]  (기본 master)
set -euo pipefail

BRANCH="${1:-master}"
KEY="${DEPLOY_KEY:-$HOME/.ssh/coffee_note_deploy}"
PORT="${DEPLOY_PORT:-2022}"
TARGET="${DEPLOY_USER:-rocky}@${DEPLOY_HOST:-bytebard.cloud}"
REPO_URL=https://github.com/ApostleB/coffee-note.git
APP_DIR=/home/rocky/coffee-note

ssh -i "$KEY" -p "$PORT" "$TARGET" \
  "set -euo pipefail; [ -d $APP_DIR/.git ] || git clone $REPO_URL $APP_DIR; cd $APP_DIR && git fetch origin && git checkout -B '$BRANCH' 'origin/$BRANCH' && bash scripts/remote-deploy.sh '$BRANCH'"
