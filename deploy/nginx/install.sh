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

# 설정을 설치하고 nginx -t를 통과할 때만 reload 한다. 실패하면 이전 conf로 되돌린다.
install_conf() {
  local src="$1" backup=""
  if [ -f "$CONF_DEST" ]; then
    backup="$(mktemp)"
    cp "$CONF_DEST" "$backup"
  fi
  cp "$src" "$CONF_DEST"
  if nginx -t; then
    systemctl reload nginx
    rm -f "$backup"
    return 0
  fi
  if [ -n "$backup" ]; then
    cp "$backup" "$CONF_DEST"
    rm -f "$backup"
  else
    rm -f "$CONF_DEST"
  fi
  return 1
}

# (1) HTTP 전용 conf
mkdir -p /var/www/certbot
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
  echo 'COOKIE_SECURE=true' >> "$ENV_FILE"
fi
sudo -u rocky -H pm2 reload coffee-note --update-env

# (5) 결과 확인
curl -sSI "https://$DOMAIN/healthz"
