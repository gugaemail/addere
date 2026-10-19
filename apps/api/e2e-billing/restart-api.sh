#!/usr/bin/env bash
# Derruba a API na 3334 e sobe de novo, anexando a logs/api-<banco>.log.
# Serve para rodar o ticker apply-due-terms, que só roda no boot (t014f).
E2E="$(cd "$(dirname "$0")" && pwd)"
DB="${E2E_DB:-addere_e2e}"
mkdir -p "$E2E/logs"
bash "$E2E/stop-port.sh" 3334 || exit 1
echo "===== restart $(date -u +%Y-%m-%dT%H:%M:%SZ) =====" >> "$E2E/logs/api-$DB.log"
nohup bash "$E2E/start-api.sh" >> "$E2E/logs/api-$DB.log" 2>&1 &
for i in $(seq 1 90); do
  if curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3334/health 2>/dev/null | grep -q 200; then echo "API no ar"; exit 0; fi
  node -e "setTimeout(()=>{},1000)"
done
echo "A API não subiu"; exit 1
