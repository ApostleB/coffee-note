#!/usr/bin/env bash
# 서버에서 root로 한 번 실행: sudo bash /home/rocky/coffee-note/deploy/nginx/install.sh
# coffee.bytebard.cloud 전용 nginx conf와 인증서만 다루며, 다른 conf·인증서는 건드리지 않는다.
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "root 권한이 필요합니다: sudo bash $0" >&2
  exit 1
fi

DOMAIN=coffee.bytebard.cloud
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONF_DEST="/etc/nginx/conf.d/$DOMAIN.conf"
CERT_DIR="/etc/letsencrypt/live/$DOMAIN"
ENV_FILE=/home/rocky/coffee-note/.env

# 설정을 설치하고 nginx -t와 reload가 모두 성공할 때만 유지한다.
# 어느 단계든 실패하면 이전 conf로 복구(없었으면 삭제)하고 실패를 반환한다.
# (if/|| 안에서 호출돼도 set -e가 꺼지므로 각 명령의 실패를 직접 확인한다)
install_conf() {
  local src="$1" backup=""
  if [ -f "$CONF_DEST" ]; then
    backup="$(mktemp)"
    cp "$CONF_DEST" "$backup" || return 1
  fi
  restore() {
    if [ -n "$backup" ]; then
      cp "$backup" "$CONF_DEST"
    else
      rm -f "$CONF_DEST"
    fi
    nginx -t >/dev/null 2>&1 && systemctl reload nginx || true
  }
  if ! cp "$src" "$CONF_DEST"; then
    restore; rm -f "$backup"; return 1
  fi
  if ! nginx -t; then
    restore; rm -f "$backup"; return 1
  fi
  if ! systemctl reload nginx; then
    restore; rm -f "$backup"; return 1
  fi
  rm -f "$backup"
  return 0
}

# (0) 앱 .env 확인 (nginx를 바꾸기 전에)
if [ ! -r "$ENV_FILE" ]; then
  echo "오류: $ENV_FILE 이 없거나 읽을 수 없습니다. 먼저 앱을 배포하세요." >&2
  exit 1
fi

# (1) HTTP 전용 conf
mkdir -p /var/www/certbot
# SELinux 라벨이 맞지 않으면 nginx가 챌린지 파일을 못 읽어 발급이 403으로 실패한다
if command -v restorecon >/dev/null 2>&1; then
  restorecon -R /var/www/certbot
fi
install_conf "$SRC_DIR/$DOMAIN.http.conf" || { echo "HTTP conf 설치 실패 (nginx -t)" >&2; exit 1; }

# (2) 인증서 발급
if [ ! -f "$CERT_DIR/fullchain.pem" ]; then
  if [ -d /etc/letsencrypt/accounts ]; then
    ACCOUNT_OPT=()
  else
    ACCOUNT_OPT=(--register-unsafely-without-email)
  fi
  if ! certbot certonly --webroot -w /var/www/certbot -d "$DOMAIN" \
      --non-interactive --agree-tos --keep-until-expiring \
      --deploy-hook "systemctl reload nginx" "${ACCOUNT_OPT[@]}"; then
    echo "인증서 발급 실패: HTTP 상태로 유지합니다. DNS($DOMAIN → 이 서버)와 80 포트를 확인한 뒤 다시 실행하세요." >&2
    exit 1
  fi
fi

# (3) 최종 HTTPS conf
if ! install_conf "$SRC_DIR/$DOMAIN.conf"; then
  echo "HTTPS conf 적용 실패: HTTP conf로 되돌립니다." >&2
  install_conf "$SRC_DIR/$DOMAIN.http.conf" || true
  exit 1
fi

# (4) 쿠키 Secure 활성화 후 앱 재로드 (PM2는 rocky 사용자 것)
if grep -q '^COOKIE_SECURE=' "$ENV_FILE"; then
  sed -i 's/^COOKIE_SECURE=.*/COOKIE_SECURE=true/' "$ENV_FILE"
else
  # 마지막 줄에 개행이 없어도 새 줄에 추가되도록 개행을 보장한다
  [ -z "$(tail -c1 "$ENV_FILE")" ] || echo >> "$ENV_FILE"
  echo 'COOKIE_SECURE=true' >> "$ENV_FILE"
fi
if ! runuser -l rocky -c "pm2 reload coffee-note --update-env"; then
  echo "pm2 reload 실패: rocky 사용자로 직접 실행하세요 → pm2 reload coffee-note --update-env" >&2
fi

# (5) 결과 확인
# reload 직후에는 502가 잠깐 나올 수 있어 최대 10회 1초 간격으로 재시도한다
for _ in $(seq 10); do
  if curl -sSI -f "https://$DOMAIN/healthz"; then
    break
  fi
  sleep 1
done

echo
echo "자동 갱신 확인: certbot renew --dry-run --cert-name $DOMAIN"
