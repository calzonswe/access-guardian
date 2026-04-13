#!/bin/bash
set -e

BASE_URL="http://localhost:3000"
API="${BASE_URL}/api"

echo "==========================================="
echo "  Access Guardian - Comprehensive API Tests"
echo "==========================================="
echo ""

# Helper function to check response
check_response() {
  local status=$1
  local name=$2
  if [ "$status" -eq "0" ]; then
    echo "❌ $name - FAILED (no response)"
    return 1
  elif echo "$status" | grep -q "^[23]"; then
    echo "✅ $name - OK"
    return 0
  else
    echo "❌ $name - FAILED (status $status)"
    return 1
  fi
}

# Login as admin
echo "=== 1. Authentication Tests ==="
LOGIN_RESP=$(curl -s -w "\n%{http_code}" -X POST "${API}/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@foretag.se","password":"Admin123!"}')
LOGIN_BODY=$(echo "$LOGIN_RESP" | head -1)
LOGIN_STATUS=$(echo "$LOGIN_RESP" | tail -1)

if [ "$LOGIN_STATUS" = "200" ]; then
  echo "✅ Login successful"
  TOKEN=$(echo "$LOGIN_BODY" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
  USER_ID=$(echo "$LOGIN_BODY" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
else
  echo "❌ Login failed"
  exit 1
fi

echo ""
echo "=== 2. User Management Tests ==="

# Create test user
echo "- Creating user..."
USER_RESP=$(curl -s -w "\n%{http_code}" -X POST "${API}/users" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test.user@foretag.se",
    "full_name": "Test User",
    "first_name": "Test",
    "last_name": "User",
    "password": "TestPass123!",
    "department": "IT",
    "title": "Developer",
    "roles": ["employee"]
  }')
USER_STATUS=$(echo "$USER_RESP" | tail -1)
if [ "$USER_STATUS" = "201" ]; then
  echo "✅ Create user - OK"
  TEST_USER_ID=$(echo "$USER_RESP" | head -1 | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
else
  echo "❌ Create user failed: $(echo "$USER_RESP" | head -1)"
  TEST_USER_ID=""
fi

# Get users
echo "- Getting users..."
USERS_RESP=$(curl -s -w "\n%{http_code}" -X GET "${API}/users" \
  -H "Authorization: Bearer $TOKEN")
USERS_STATUS=$(echo "$USERS_RESP" | tail -1)
check_response "$USERS_STATUS" "Get users"

# Update user
if [ -n "$TEST_USER_ID" ]; then
  echo "- Updating user..."
  UPDATE_RESP=$(curl -s -w "\n%{http_code}" -X PUT "${API}/users/${TEST_USER_ID}" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"department": "Engineering"}')
  UPDATE_STATUS=$(echo "$UPDATE_RESP" | tail -1)
  check_response "$UPDATE_STATUS" "Update user"
fi

echo ""
echo "=== 3. Facilities Tests ==="

# Create facility
echo "- Creating facility..."
FAC_RESP=$(curl -s -w "\n%{http_code}" -X POST "${API}/facilities" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Facility",
    "description": "A test facility",
    "address": "123 Test Street"
  }')
FAC_STATUS=$(echo "$FAC_RESP" | tail -1)
if [ "$FAC_STATUS" = "201" ]; then
  echo "✅ Create facility - OK"
  FACILITY_ID=$(echo "$FAC_RESP" | head -1 | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
else
  echo "❌ Create facility failed"
  FACILITY_ID=""
fi

# Get facilities
echo "- Getting facilities..."
FAC_GET_RESP=$(curl -s -w "\n%{http_code}" -X GET "${API}/facilities" \
  -H "Authorization: Bearer $TOKEN")
FAC_GET_STATUS=$(echo "$FAC_GET_RESP" | tail -1)
check_response "$FAC_GET_STATUS" "Get facilities"

  # Update facility
  if [ -n "$FACILITY_ID" ]; then
    echo "- Updating facility..."
    FAC_UPDATE_RESP=$(curl -s -w "\n%{http_code}" -X PUT "${API}/facilities/${FACILITY_ID}" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d '{"name": "Updated Facility Name"}')
    FAC_UPDATE_STATUS=$(echo "$FAC_UPDATE_RESP" | tail -1)
    check_response "$FAC_UPDATE_STATUS" "Update facility"
  fi

echo ""
echo "=== 4. Areas Tests ==="

if [ -n "$FACILITY_ID" ]; then
  # Create area
  echo "- Creating area..."
  AREA_RESP=$(curl -s -w "\n%{http_code}" -X POST "${API}/areas" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"facility_id\": \"${FACILITY_ID}\",
      \"name\": \"Test Area\",
      \"description\": \"A test area\",
      \"security_level\": \"medium\"
    }")
  AREA_STATUS=$(echo "$AREA_RESP" | tail -1)
  if [ "$AREA_STATUS" = "201" ]; then
    echo "✅ Create area - OK"
    AREA_ID=$(echo "$AREA_RESP" | head -1 | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
  else
    echo "❌ Create area failed"
    AREA_ID=""
  fi

  # Get areas
  echo "- Getting areas..."
  AREAS_RESP=$(curl -s -w "\n%{http_code}" -X GET "${API}/areas?facility_id=${FACILITY_ID}" \
    -H "Authorization: Bearer $TOKEN")
  AREAS_STATUS=$(echo "$AREAS_RESP" | tail -1)
  check_response "$AREAS_STATUS" "Get areas"
fi

echo ""
echo "=== 5. Requirements Tests ==="

# Create requirement
echo "- Creating requirement..."
REQ_RESP=$(curl -s -w "\n%{http_code}" -X POST "${API}/requirements" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Safety Certification",
    "description": "Safety certification required",
    "type": "certification",
    "has_expiry": true,
    "validity_days": 365
  }')
REQ_STATUS=$(echo "$REQ_RESP" | tail -1)
if [ "$REQ_STATUS" = "201" ]; then
  echo "✅ Create requirement - OK"
  REQ_ID=$(echo "$REQ_RESP" | head -1 | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
else
  echo "❌ Create requirement failed"
  REQ_ID=""
fi

# Get requirements
echo "- Getting requirements..."
REQ_GET_RESP=$(curl -s -w "\n%{http_code}" -X GET "${API}/requirements" \
  -H "Authorization: Bearer $TOKEN")
REQ_GET_STATUS=$(echo "$REQ_GET_RESP" | tail -1)
check_response "$REQ_GET_STATUS" "Get requirements"

echo ""
echo "=== 6. Facility Requirements Tests ==="

if [ -n "$FACILITY_ID" ] && [ -n "$REQ_ID" ]; then
  # Add facility requirement
  echo "- Adding facility requirement..."
  FAC_REQ_RESP=$(curl -s -w "\n%{http_code}" -X POST "${API}/facility-requirements" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"facility_id\": \"${FACILITY_ID}\",
      \"requirement_id\": \"${REQ_ID}\"
    }")
  FAC_REQ_STATUS=$(echo "$FAC_REQ_RESP" | tail -1)
  check_response "$FAC_REQ_STATUS" "Add facility requirement"

  # Get facility requirements
  echo "- Getting facility requirements..."
  FAC_REQS_RESP=$(curl -s -w "\n%{http_code}" -X GET "${API}/facility-requirements?facility_id=${FACILITY_ID}" \
    -H "Authorization: Bearer $TOKEN")
  FAC_REQS_STATUS=$(echo "$FAC_REQS_RESP" | tail -1)
  check_response "$FAC_REQS_STATUS" "Get facility requirements"
fi

echo ""
echo "=== 7. Application Tests ==="

if [ -n "$FACILITY_ID" ] && [ -n "$TEST_USER_ID" ]; then
  # Create application
  echo "- Creating application..."
  TODAY=$(date +%Y-%m-%d)
  FUTURE=$(date -d "+30 days" +%Y-%m-%d)
  APP_RESP=$(curl -s -w "\n%{http_code}" -X POST "${API}/applications" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"applicant_id\": \"${TEST_USER_ID}\",
      \"facility_id\": \"${FACILITY_ID}\",
      \"start_date\": \"${TODAY}\",
      \"end_date\": \"${FUTURE}\"
    }")
  APP_STATUS=$(echo "$APP_RESP" | tail -1)
  if [ "$APP_STATUS" = "201" ]; then
    echo "✅ Create application - OK"
    APP_ID=$(echo "$APP_RESP" | head -1 | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
  else
    echo "❌ Create application failed"
    APP_ID=""
  fi

  # Get applications
  echo "- Getting applications..."
  APPS_RESP=$(curl -s -w "\n%{http_code}" -X GET "${API}/applications" \
    -H "Authorization: Bearer $TOKEN")
  APPS_STATUS=$(echo "$APPS_RESP" | tail -1)
  check_response "$APPS_STATUS" "Get applications"

  # Update application (approve)
  if [ -n "$APP_ID" ]; then
    echo "- Updating application status..."
    APP_UPDATE_RESP=$(curl -s -w "\n%{http_code}" -X PUT "${API}/applications/${APP_ID}" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d '{"status": "approved"}')
    APP_UPDATE_STATUS=$(echo "$APP_UPDATE_RESP" | tail -1)
    check_response "$APP_UPDATE_STATUS" "Update application"
  fi
fi

echo ""
echo "=== 8. User Requirements Tests ==="

if [ -n "$TEST_USER_ID" ] && [ -n "$REQ_ID" ]; then
  # Create user requirement
  echo "- Creating user requirement..."
  UR_RESP=$(curl -s -w "\n%{http_code}" -X POST "${API}/user-requirements" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"user_id\": \"${TEST_USER_ID}\",
      \"requirement_id\": \"${REQ_ID}\",
      \"status\": \"fulfilled\",
      \"fulfilled_at\": \"${TODAY}\"
    }")
  UR_STATUS=$(echo "$UR_RESP" | tail -1)
  if [ "$UR_STATUS" = "201" ]; then
    echo "✅ Create user requirement - OK"
    UR_ID=$(echo "$UR_RESP" | head -1 | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
  else
    echo "❌ Create user requirement failed"
    UR_ID=""
  fi

  # Get user requirements
  echo "- Getting user requirements..."
  URS_RESP=$(curl -s -w "\n%{http_code}" -X GET "${API}/user-requirements?user_id=${TEST_USER_ID}" \
    -H "Authorization: Bearer $TOKEN")
  URS_STATUS=$(echo "$URS_RESP" | tail -1)
  check_response "$URS_STATUS" "Get user requirements"
fi

echo ""
echo "=== 9. Notifications Tests ==="

if [ -n "$TEST_USER_ID" ]; then
  # Create notification
  echo "- Creating notification..."
  NOTIF_RESP=$(curl -s -w "\n%{http_code}" -X POST "${API}/notifications" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"user_id\": \"${TEST_USER_ID}\",
      \"title\": \"Test Notification\",
      \"message\": \"This is a test notification\",
      \"type\": \"info\"
    }")
  NOTIF_STATUS=$(echo "$NOTIF_RESP" | tail -1)
  if [ "$NOTIF_STATUS" = "201" ]; then
    echo "✅ Create notification - OK"
    NOTIF_ID=$(echo "$NOTIF_RESP" | head -1 | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
  else
    echo "❌ Create notification failed"
    NOTIF_ID=""
  fi

  # Get notifications
  echo "- Getting notifications..."
  NOTIFS_RESP=$(curl -s -w "\n%{http_code}" -X GET "${API}/notifications?user_id=${TEST_USER_ID}" \
    -H "Authorization: Bearer $TOKEN")
  NOTIFS_STATUS=$(echo "$NOTIFS_RESP" | tail -1)
  check_response "$NOTIFS_STATUS" "Get notifications"

  # Mark notification as read
  if [ -n "$NOTIF_ID" ]; then
    echo "- Marking notification as read..."
    NOTIF_READ_RESP=$(curl -s -w "\n%{http_code}" -X PUT "${API}/notifications/${NOTIF_ID}/read" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d '{}')
    NOTIF_READ_STATUS=$(echo "$NOTIF_READ_RESP" | tail -1)
    check_response "$NOTIF_READ_STATUS" "Mark notification read"
  fi
fi

echo ""
echo "=== 10. Logs Tests ==="

# Get logs
echo "- Getting logs..."
LOGS_RESP=$(curl -s -w "\n%{http_code}" -X GET "${API}/logs" \
  -H "Authorization: Bearer $TOKEN")
LOGS_STATUS=$(echo "$LOGS_RESP" | tail -1)
check_response "$LOGS_STATUS" "Get logs"

echo ""
echo "=== 11. Settings Tests ==="

# Get settings
echo "- Getting settings..."
SETTINGS_RESP=$(curl -s -w "\n%{http_code}" -X GET "${API}/settings" \
  -H "Authorization: Bearer $TOKEN")
SETTINGS_STATUS=$(echo "$SETTINGS_RESP" | tail -1)
check_response "$SETTINGS_STATUS" "Get settings"

# Update settings
echo "- Updating settings..."
SETTINGS_UPDATE_RESP=$(curl -s -w "\n%{http_code}" -X PUT "${API}/settings" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "company_name": "Test Company",
    "session_timeout_minutes": 60
  }')
SETTINGS_UPDATE_STATUS=$(echo "$SETTINGS_UPDATE_RESP" | tail -1)
check_response "$SETTINGS_UPDATE_STATUS" "Update settings"

echo ""
echo "=== 12. Organization Tests ==="

# Get org tree
echo "- Getting org tree..."
ORG_RESP=$(curl -s -w "\n%{http_code}" -X GET "${API}/org" \
  -H "Authorization: Bearer $TOKEN")
ORG_STATUS=$(echo "$ORG_RESP" | tail -1)
check_response "$ORG_STATUS" "Get org tree"

# Update org tree
echo "- Updating org tree..."
ORG_UPDATE_RESP=$(curl -s -w "\n%{http_code}" -X PUT "${API}/org" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '[
    {"title": "CEO", "department": "Executive", "sort_order": 1},
    {"title": "CTO", "department": "Technology", "sort_order": 2}
  ]')
ORG_UPDATE_STATUS=$(echo "$ORG_UPDATE_RESP" | tail -1)
check_response "$ORG_UPDATE_STATUS" "Update org tree"

echo ""
echo "=== 13. RBAC Tests ==="

# Test unauthorized access
echo "- Testing unauthorized access..."
UNAUTH_RESP=$(curl -s -w "\n%{http_code}" -X GET "${API}/users")
UNAUTH_STATUS=$(echo "$UNAUTH_RESP" | tail -1)
if [ "$UNAUTH_STATUS" = "401" ] || [ "$UNAUTH_STATUS" = "403" ]; then
  echo "✅ Unauthorized access blocked - OK"
else
  echo "❌ Unauthorized access not blocked (status: $UNAUTH_STATUS)"
fi

# Test invalid token
echo "- Testing invalid token..."
INVALID_RESP=$(curl -s -w "\n%{http_code}" -X GET "${API}/users" \
  -H "Authorization: Bearer invalid_token_here")
INVALID_STATUS=$(echo "$INVALID_RESP" | tail -1)
if [ "$INVALID_STATUS" = "401" ]; then
  echo "✅ Invalid token rejected - OK"
else
  echo "❌ Invalid token not rejected (status: $INVALID_STATUS)"
fi

echo ""
echo "=== 14. Validation Tests ==="

# Test missing required fields
echo "- Testing missing required fields..."
VALIDATE_RESP=$(curl -s -w "\n%{http_code}" -X POST "${API}/users" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}')
VALIDATE_STATUS=$(echo "$VALIDATE_RESP" | tail -1)
if [ "$VALIDATE_STATUS" = "400" ]; then
  echo "✅ Validation of missing fields - OK"
else
  echo "❌ Validation of missing fields failed (status: $VALIDATE_STATUS)"
fi

# Test invalid email
echo "- Testing invalid email..."
INVALID_EMAIL_RESP=$(curl -s -w "\n%{http_code}" -X POST "${API}/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"not-an-email","password":"test"}')
INVALID_EMAIL_STATUS=$(echo "$INVALID_EMAIL_RESP" | tail -1)
if [ "$INVALID_EMAIL_STATUS" = "400" ]; then
  echo "✅ Invalid email rejected - OK"
else
  echo "❌ Invalid email not rejected (status: $INVALID_EMAIL_STATUS)"
fi

echo ""
echo "==========================================="
echo "  All Tests Completed!"
echo "==========================================="