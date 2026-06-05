#!/bin/bash
# Glasslyn Vets — production deploy for client outbound-call fixes
# Run on VPS: bash scripts/deploy-production.sh

set -e

APP_DIR="${APP_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$APP_DIR"

echo "=== Glasslyn Vets production deploy ==="
echo "App directory: $APP_DIR"

echo ""
echo "--- Step 1: Pull latest code ---"
git pull origin main

echo ""
echo "--- Step 2: Update Telnyx env vars ---"
ENV_FILE="$APP_DIR/.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: .env not found at $ENV_FILE"
  exit 1
fi

# Update or append TELNYX_FROM_NUMBER (Irish landline — ComReg compliant)
if grep -q '^TELNYX_FROM_NUMBER=' "$ENV_FILE"; then
  sed -i 's|^TELNYX_FROM_NUMBER=.*|TELNYX_FROM_NUMBER=+353216037774|' "$ENV_FILE"
else
  echo 'TELNYX_FROM_NUMBER=+353216037774' >> "$ENV_FILE"
fi

if grep -q '^TELNYX_VOICE=' "$ENV_FILE"; then
  sed -i 's|^TELNYX_VOICE=.*|TELNYX_VOICE=Telnyx.NaturalHD.astra|' "$ENV_FILE"
else
  echo 'TELNYX_VOICE=Telnyx.NaturalHD.astra' >> "$ENV_FILE"
fi

if grep -q '^TELNYX_VOICE_LANGUAGE=' "$ENV_FILE"; then
  sed -i 's|^TELNYX_VOICE_LANGUAGE=.*|TELNYX_VOICE_LANGUAGE=en-GB|' "$ENV_FILE"
else
  echo 'TELNYX_VOICE_LANGUAGE=en-GB' >> "$ENV_FILE"
fi

echo "Updated .env Telnyx settings:"
grep '^TELNYX_FROM_NUMBER=' "$ENV_FILE" || true
grep '^TELNYX_VOICE=' "$ENV_FILE" || true
grep '^TELNYX_VOICE_LANGUAGE=' "$ENV_FILE" || true

echo ""
echo "--- Step 3: Install dependencies ---"
npm install --production

echo ""
echo "--- Step 4: Restart PM2 ---"
pm2 restart vet-receptionist || pm2 start src/index.js --name vet-receptionist
pm2 save

echo ""
echo "--- Step 5: Verify startup ---"
sleep 3
pm2 logs vet-receptionist --lines 20 --nostream

echo ""
echo "=== Deploy complete ==="
echo "Confirm in logs: [CONFIG] Telnyx outbound caller ID: +353216037774"
echo "Trigger a test escalation and verify vet call shows +353216037774"
