#!/usr/bin/env bash
# 로컬에서 실행: bash scripts/deploy.sh [branch] [ref]  (branch 기본 master, ref 기본 origin/<branch>)
# 서버에 저장소가 없으면 만든다 (.env가 먼저 있어도 되도록 clone 대신 init + remote 사용)
set -euo pipefail

BRANCH="${1:-master}"
REF="${2:-origin/$BRANCH}"
KEY="${DEPLOY_KEY:-$HOME/.ssh/coffee_note_deploy}"
PORT="${DEPLOY_PORT:-2022}"
TARGET="${DEPLOY_USER:-rocky}@${DEPLOY_HOST:-bytebard.cloud}"
REPO_URL=https://github.com/ApostleB/coffee-note.git
APP_DIR=/home/rocky/coffee-note

# 원격 셸에 넘기기 전에 허용 문자만 통과시킨다 ('-'로 시작하면 git 옵션으로 해석될 수 있어 거부)
for value in "$BRANCH" "$REF"; do
  if [[ ! "$value" =~ ^[A-Za-z0-9._/][A-Za-z0-9._/-]*$ ]]; then
    echo "오류: 허용되지 않는 브랜치/ref 값입니다: $value" >&2
    exit 1
  fi
done

q_branch="$(printf '%q' "$BRANCH")"
q_ref="$(printf '%q' "$REF")"

ssh -i "$KEY" -p "$PORT" "$TARGET" \
  "set -euo pipefail; if [ ! -d $APP_DIR/.git ]; then mkdir -p $APP_DIR && git init -q $APP_DIR && git -C $APP_DIR remote add origin $REPO_URL; fi; cd $APP_DIR && git fetch origin && git checkout -B $q_branch $q_ref && bash scripts/remote-deploy.sh $q_branch $q_ref"
