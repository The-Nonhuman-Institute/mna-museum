#!/bin/bash
# MNA Queue Check — runs on Claude Code session start
# Checks Turso for pending registrations and submitted works

# Credentials come from system/.env, which is gitignored. This file previously
# hardcoded a Turso token; the repo is public, so it never should have.
ENV_FILE="$(dirname "$0")/../system/.env"
[ -f "$ENV_FILE" ] || { echo '{"systemMessage":""}'; exit 0; }
TURSO_URL="$(grep -m1 '^TURSO_DATABASE_URL=' "$ENV_FILE" | cut -d= -f2- | tr -d '"'"'"'\r')"
TURSO_TOKEN="$(grep -m1 '^TURSO_AUTH_TOKEN=' "$ENV_FILE" | cut -d= -f2- | tr -d '"'"'"'\r')"
[ -n "$TURSO_TOKEN" ] || { echo '{"systemMessage":""}'; exit 0; }

# Query Turso via HTTP API
query() {
  curl -s "$TURSO_URL" \
    -H "Authorization: Bearer $TURSO_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"statements\":[\"$1\"]}" 2>/dev/null
}

pending=$(query "SELECT COUNT(*) as n FROM pending_registrations WHERE status = 'PENDING'" | node -pe 'JSON.parse(require("fs").readFileSync("/dev/stdin","utf8")).results?.[0]?.rows?.[0]?.[0] || 0' 2>/dev/null)
submitted=$(query "SELECT COUNT(*) as n FROM canon_status WHERE status = 'SUBMITTED'" | node -pe 'JSON.parse(require("fs").readFileSync("/dev/stdin","utf8")).results?.[0]?.rows?.[0]?.[0] || 0' 2>/dev/null)

msg=""
if [ "$pending" != "0" ] && [ -n "$pending" ]; then
  msg="$msg$pending pending registration(s) awaiting activation. "
fi
if [ "$submitted" != "0" ] && [ -n "$submitted" ]; then
  msg="$msg$submitted submitted work(s) awaiting evaluation. "
fi

if [ -n "$msg" ]; then
  echo "{\"systemMessage\":\"📋 MNA QUEUE: ${msg}Use turso db shell mna-museum to inspect.\"}"
else
  echo "{\"systemMessage\":\"\"}"
fi
