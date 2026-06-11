#!/bin/bash
# mqtt_auth_enable.sh — turn on MQTT (mosquitto) password auth using the SAME
# admin credentials as the web panel and SSH. One password for everything.
#
# Run once with: sudo bash /home/playerok/playerok/mqtt_auth_enable.sh
# Idempotent — safe to re-run (e.g. after changing the admin password).
#
# What it does:
#   1. reads admin_login / admin_pass from meta/player_config.json
#   2. writes /etc/mosquitto/passwd (mosquitto_passwd)
#   3. rewrites mosquitto.conf: global `allow_anonymous false` + `password_file`
#      placed BEFORE the first listener (required when per_listener_settings=false)
#   4. restarts mosquitto, then the bus clients so they reconnect with creds

export PATH="$PATH:/sbin:/usr/sbin"

if [ "$(id -u)" -ne 0 ]; then
  echo "Запусти под sudo:  sudo bash $0"
  exit 1
fi

ROOT=/home/playerok/playerok
CONF=/etc/mosquitto/mosquitto.conf
PW=/etc/mosquitto/passwd

# --- 1. read credentials (node parses JSON safely, no jq needed) ---
LOGIN=$(node -e 'process.stdout.write(String((require("'"$ROOT"'/meta/player_config.json").security||{}).admin_login||""))')
PASS=$(node -e 'process.stdout.write(String((require("'"$ROOT"'/meta/player_config.json").security||{}).admin_pass||""))')

if [ -z "$LOGIN" ] || [ -z "$PASS" ]; then
  echo "!! admin_login / admin_pass пусты в player_config.json — задай пароль в Настройках → Безопасность и повтори."
  exit 1
fi
echo "MQTT-пользователь: $LOGIN"

# --- 2. password file ---
mosquitto_passwd -b -c "$PW" "$LOGIN" "$PASS"
chown mosquitto:mosquitto "$PW" 2>/dev/null
chmod 600 "$PW"
echo "Создан $PW"

# --- 3. mosquitto.conf: global auth before the first listener ---
cp -n "$CONF" "$CONF.bak.$(date +%s)" 2>/dev/null
# drop any prior auth lines, then insert fresh ones before the first `listener`
sed -i -E '/^[[:space:]]*(allow_anonymous|password_file)\b/d' "$CONF"
sed -i '0,/^listener /s//allow_anonymous false\npassword_file \/etc\/mosquitto\/passwd\nlistener /' "$CONF"

echo "----- активная конфигурация mosquitto -----"
grep -nE '^[[:space:]]*(listener|allow_anonymous|password_file|protocol|socket_domain)' "$CONF"

# --- 4. restart broker, validate, then bounce clients ---
systemctl restart mosquitto
sleep 1
if ! systemctl is-active --quiet mosquitto; then
  echo "!! mosquitto не запустился — проверь: journalctl -u mosquitto -n 30"
  exit 1
fi
echo "mosquitto: запущен"

# Smoke test: anonymous must be REJECTED, creds must be ACCEPTED.
if command -v mosquitto_pub >/dev/null; then
  if mosquitto_pub -h 127.0.0.1 -t test/anon -m x 2>/dev/null; then
    echo "!! ВНИМАНИЕ: анонимная публикация всё ещё проходит — авторизация не применилась"
  else
    echo "OK: анонимный доступ отклонён"
  fi
  if mosquitto_pub -h 127.0.0.1 -u "$LOGIN" -P "$PASS" -t test/auth -m x 2>/dev/null; then
    echo "OK: доступ с паролем работает"
  else
    echo "!! доступ с паролем не прошёл — проверь passwd/конфиг"
  fi
fi

echo "----- перезапуск клиентов шины -----"
systemctl restart scheduler webka supervisor
echo "Готово. Один пароль теперь действует на админку, SSH и MQTT."
