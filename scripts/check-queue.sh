#!/bin/bash
# MNA Queue Check — runs on Claude Code session start
# Checks Turso for pending registrations and submitted works

# Read from the environment, never from this file. A token pasted inline here
# was committed on 2026-04-02 and became publicly readable the moment this
# repository went public; it has since been revoked. Every other file in this
# project already reads these from the environment — this one did not.
TURSO_URL="${TURSO_DATABASE_URL:-}"
TURSO_TOKEN="${TURSO_AUTH_TOKEN:-}"

if [ -z "$TURSO_URL" ] || [ -z "$TURSO_TOKEN" ]; then
  echo "check-queue: set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in the environment." >&2
  exit 1
fi

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
