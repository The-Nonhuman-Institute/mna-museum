#!/bin/bash
# MNA Queue Check — runs on Claude Code session start
# Checks Turso for pending registrations and submitted works

TURSO_URL="libsql://mna-museum-tudoxukno.aws-us-east-2.turso.io"
TURSO_TOKEN="eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3NzUxNzk1MDMsImlkIjoiMDE5ZDUwZjEtNGQwMS03MmVlLTkyOWItNjkzOTEyNjQwNDZiIiwicmlkIjoiZDg0MGNmMWMtZjdjOS00MmU0LTllNDYtZDA1NmNlMGFiZTIxIn0.DpTRCvDYUxFvA2hZoXQ7O8pOpB-T4TsosjpRX8QF5vJZzGPYIXchy3jjhLR1kohkj2ezwbEMNWLRVB43ERFLCA"

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
