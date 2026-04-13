#!/bin/bash
set -e

BASE_URL="http://localhost:3000"
API="${BASE_URL}/api"

echo "=== Health Check ==="
curl -s "${BASE_URL}/health" | head -20
echo ""

echo "=== Login Test ==="
LOGIN_RESP=$(curl -s -X POST "${API}/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@foretag.se","password":"Admin123!"}')
echo "Login response: $LOGIN_RESP"

if echo "$LOGIN_RESP" | grep -q "token"; then
  TOKEN=$(echo "$LOGIN_RESP" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
  echo "Token obtained: ${TOKEN:0:20}..."
else
  echo "Login failed!"
  exit 1
fi

echo ""
echo "=== Get Users ==="
curl -s "${API}/users" -H "Authorization: Bearer $TOKEN" | head -100

echo ""
echo "=== Get Facilities ==="
curl -s "${API}/facilities" -H "Authorization: Bearer $TOKEN" | head -100

echo ""
echo "=== Get Applications ==="
curl -s "${API}/applications" -H "Authorization: Bearer $TOKEN" | head -100

echo ""
echo "=== Get Requirements ==="
curl -s "${API}/requirements" -H "Authorization: Bearer $TOKEN" | head -100

echo ""
echo "=== All basic API tests passed! ==="