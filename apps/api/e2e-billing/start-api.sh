#!/usr/bin/env bash
# Sobe a API deste checkout contra o Postgres LOCAL descartável (5434)
# e o Resend falso (3999). Banco: E2E_DB (padrão addere_e2e). Sem .env, sem
# Sentry, sem LLM, sem agendador de cobrança.
set -euo pipefail
E2E="$(cd "$(dirname "$0")" && pwd)"
WT="$(cd "$E2E/../../.." && pwd)"
DB="${E2E_DB:-addere_e2e}"
URL="postgresql://addere_dev_user:addere_dev_password@localhost:5434/$DB"
for f in "$WT/.env" "$WT/apps/api/.env" "$WT/packages/db/.env" "$WT/packages/db/prisma/.env"; do
  if [ -e "$f" ]; then echo "ABORT: existe $f"; exit 1; fi
done
mkdir -p "$E2E/uploads"
cd "$WT/apps/api"
exec env -u ANTHROPIC_API_KEY -u GOOGLE_GEOCODING_API_KEY -u SENTRY_DSN \
  DATABASE_URL="$URL" \
  DATABASE_URL_DIRECT="$URL" \
  JWT_SECRET=e2e-jwt-secret-local-only-0123456789abcdef \
  JWT_REFRESH_SECRET=e2e-jwt-refresh-secret-local-only-0123456789 \
  PROTHEUS_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef \
  NODE_ENV=development \
  PORT=3334 \
  WEB_URL=http://localhost:3000 \
  TRUST_PROXY_HOPS=1 \
  RESEND_API_KEY=re_fake_e2e \
  RESEND_BASE_URL=http://127.0.0.1:3999 \
  SENTRY_DSN= \
  INTEL_LLM_ENABLED=false \
  INTEL_GEOCODER=mock \
  BILLING_JOBS_ENABLED=false \
  UPLOAD_DIR="$E2E/uploads" \
  npx tsx src/server.ts
