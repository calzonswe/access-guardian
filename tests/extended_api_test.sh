#!/bin/bash
set -e

BASE_URL="http://localhost:3000"
API="${BASE_URL}/api"

echo "==========================================="
echo "  Access Guardian - Extended API Tests"
echo "==========================================="
echo ""

# Login as admin
LOGIN_RESP=$(curl -s -X POST "${API}/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@foretag.se","password":"Admin123!"}')
TOKEN=$(echo "$LOGIN_RESP" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
echo "✅ Logged in as admin"
echo ""

# Get existing test data
USERS=$(curl -s "${API}/users" -H "Authorization: Bearer $TOKEN")
TEST_USER_ID=$(echo "$USERS" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "Test user ID: $TEST_USER_ID"

FACILITIES=$(curl -s "${API}/facilities" -H "Authorization: Bearer $TOKEN")
FACILITY_ID=$(echo "$FACILITIES" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "Facility ID: $FACILITY_ID"

REQUIREMENTS=$(curl -s "${API}/requirements" -H "Authorization: Bearer $TOKEN")
REQ_ID=$(echo "$REQUIREMENTS" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "Requirement ID: $REQ_ID"
echo ""

# === User Requirements Tests ===
echo "=== User Requirements Tests ==="

# Create user requirement
TODAY=$(date +%Y-%m-%d)
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
UR_BODY=$(echo "$UR_RESP" | head -1)
if [ "$UR_STATUS" = "201" ]; then
  echo "✅ Create user requirement - OK"
  UR_ID=$(echo "$UR_BODY" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
else
  echo "❌ Create user requirement failed: $UR_BODY"
  UR_ID=""
fi

# Get user requirements
echo "- Getting user requirements..."
URS_RESP=$(curl -s -w "\n%{http_code}" -X GET "${API}/user-requirements?user_id=${TEST_USER_ID}" \
  -H "Authorization: Bearer $TOKEN")
URS_STATUS=$(echo "$URS_RESP" | tail -1)
[ "$URS_STATUS" = "200" ] && echo "✅ Get user requirements - OK" || echo "❌ Get user requirements - FAILED"

# Update user requirement
if [ -n "$UR_ID" ]; then
  echo "- Updating user requirement..."
  UR_UPDATE_RESP=$(curl -s -w "\n%{http_code}" -X PUT "${API}/user-requirements/${UR_ID}" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"status": "expired"}')
  UR_UPDATE_STATUS=$(echo "$UR_UPDATE_RESP" | tail -1)
  [ "$UR_UPDATE_STATUS" = "200" ] && echo "✅ Update user requirement - OK" || echo "❌ Update user requirement - FAILED"
fi
echo ""

# === Application Tests ===
echo "=== Application Tests ==="

# Create application
if [ -n "$FACILITY_ID" ] && [ -n "$TEST_USER_ID" ]; then
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
  APP_BODY=$(echo "$APP_RESP" | head -1)
  if [ "$APP_STATUS" = "201" ]; then
    echo "✅ Create application - OK"
    APP_ID=$(echo "$APP_BODY" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
  else
    echo "❌ Create application failed: $APP_BODY"
    APP_ID=""
  fi

  # Get applications
  echo "- Getting applications..."
  APPS_RESP=$(curl -s -w "\n%{http_code}" -X GET "${API}/applications" \
    -H "Authorization: Bearer $TOKEN")
  APPS_STATUS=$(echo "$APPS_RESP" | tail -1)
  [ "$APPS_STATUS" = "200" ] && echo "✅ Get applications - OK" || echo "❌ Get applications - FAILED"

  # Get application by ID
  if [ -n "$APP_ID" ]; then
    echo "- Getting application by ID..."
    APP_GET_RESP=$(curl -s -w "\n%{http_code}" -X GET "${API}/applications/${APP_ID}" \
      -H "Authorization: Bearer $TOKEN")
    APP_GET_STATUS=$(echo "$APP_GET_RESP" | tail -1)
    [ "$APP_GET_STATUS" = "200" ] && echo "✅ Get application by ID - OK" || echo "❌ Get application by ID - FAILED"

    # Update application status
    echo "- Updating application status (pending_manager)..."
    APP_UPDATE_RESP=$(curl -s -w "\n%{http_code}" -X PUT "${API}/applications/${APP_ID}" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d '{"status": "pending_manager"}')
    APP_UPDATE_STATUS=$(echo "$APP_UPDATE_RESP" | tail -1)
    [ "$APP_UPDATE_STATUS" = "200" ] && echo "✅ Update application status - OK" || echo "❌ Update application status - FAILED"
  fi
fi
echo ""

# === Notifications Tests ===
echo "=== Notifications Tests ==="

if [ -n "$TEST_USER_ID" ]; then
  # Create notification
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
  NOTIF_BODY=$(echo "$NOTIF_RESP" | head -1)
  if [ "$NOTIF_STATUS" = "201" ]; then
    echo "✅ Create notification - OK"
    NOTIF_ID=$(echo "$NOTIF_BODY" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
  else
    echo "❌ Create notification failed: $NOTIF_BODY"
    NOTIF_ID=""
  fi

  # Get notifications
  echo "- Getting notifications..."
  NOTIFS_RESP=$(curl -s -w "\n%{http_code}" -X GET "${API}/notifications?user_id=${TEST_USER_ID}" \
    -H "Authorization: Bearer $TOKEN")
  NOTIFS_STATUS=$(echo "$NOTIFS_RESP" | tail -1)
  [ "$NOTIFS_STATUS" = "200" ] && echo "✅ Get notifications - OK" || echo "❌ Get notifications - FAILED"

  # Mark as read
  if [ -n "$NOTIF_ID" ]; then
    echo "- Marking notification as read..."
    NOTIF_READ_RESP=$(curl -s -w "\n%{http_code}" -X PUT "${API}/notifications/${NOTIF_ID}/read" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d '{}')
    NOTIF_READ_STATUS=$(echo "$NOTIF_READ_RESP" | tail -1)
    [ "$NOTIF_READ_STATUS" = "200" ] && echo "✅ Mark notification read - OK" || echo "❌ Mark notification read - FAILED"
  fi
fi
echo ""

# === Area Requirements Tests ===
echo "=== Area Requirements Tests ==="

AREAS=$(curl -s "${API}/areas?facility_id=${FACILITY_ID}" -H "Authorization: Bearer $TOKEN")
AREA_ID=$(echo "$AREAS" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -n "$AREA_ID" ] && [ -n "$REQ_ID" ]; then
  # Add area requirement
  echo "- Adding area requirement..."
  AREA_REQ_RESP=$(curl -s -w "\n%{http_code}" -X POST "${API}/area-requirements" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"area_id\": \"${AREA_ID}\",
      \"requirement_id\": \"${REQ_ID}\"
    }")
  AREA_REQ_STATUS=$(echo "$AREA_REQ_RESP" | tail -1)
  [ "$AREA_REQ_STATUS" = "201" ] && echo "✅ Add area requirement - OK" || echo "❌ Add area requirement - FAILED"

  # Get area requirements
  echo "- Getting area requirements..."
  AREA_REQS_RESP=$(curl -s -w "\n%{http_code}" -X GET "${API}/area-requirements?area_id=${AREA_ID}" \
    -H "Authorization: Bearer $TOKEN")
  AREA_REQS_STATUS=$(echo "$AREA_REQS_RESP" | tail -1)
  [ "$AREA_REQS_STATUS" = "200" ] && echo "✅ Get area requirements - OK" || echo "❌ Get area requirements - FAILED"
fi
echo ""

# === Attachment Tests ===
echo "=== Attachment Tests ==="

if [ -n "$APP_ID" ]; then
  # Upload attachment (base64)
  echo "- Uploading attachment..."
  ATTACH_RESP=$(curl -s -w "\n%{http_code}" -X POST "${API}/attachments" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"application_id\": \"${APP_ID}\",
      \"file_name\": \"test.txt\",
      \"file_data\": \"$(echo -n 'Test file content' | base64)\"
    }")
  ATTACH_STATUS=$(echo "$ATTACH_RESP" | tail -1)
  ATTACH_BODY=$(echo "$ATTACH_RESP" | head -1)
  if [ "$ATTACH_STATUS" = "201" ]; then
    echo "✅ Upload attachment - OK"
    ATTACH_ID=$(echo "$ATTACH_BODY" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
  else
    echo "❌ Upload attachment failed: $ATTACH_BODY"
    ATTACH_ID=""
  fi

  # Get attachments
  echo "- Getting attachments..."
  ATTACHS_RESP=$(curl -s -w "\n%{http_code}" -X GET "${API}/attachments?application_id=${APP_ID}" \
    -H "Authorization: Bearer $TOKEN")
  ATTACHS_STATUS=$(echo "$ATTACHS_RESP" | tail -1)
  [ "$ATTACHS_STATUS" = "200" ] && echo "✅ Get attachments - OK" || echo "❌ Get attachments - FAILED"

  # Delete attachment
  if [ -n "$ATTACH_ID" ]; then
    echo "- Deleting attachment..."
    ATTACH_DEL_RESP=$(curl -s -w "\n%{http_code}" -X DELETE "${API}/attachments/${ATTACH_ID}" \
      -H "Authorization: Bearer $TOKEN")
    ATTACH_DEL_STATUS=$(echo "$ATTACH_DEL_RESP" | tail -1)
    [ "$ATTACH_DEL_STATUS" = "200" ] && echo "✅ Delete attachment - OK" || echo "❌ Delete attachment - FAILED"
  fi
fi
echo ""

# === Auth Me Test ===
echo "=== Auth Tests ==="

# Get current user
echo "- Getting current user..."
ME_RESP=$(curl -s -w "\n%{http_code}" -X GET "${API}/auth/me" \
  -H "Authorization: Bearer $TOKEN")
ME_STATUS=$(echo "$ME_RESP" | tail -1)
[ "$ME_STATUS" = "200" ] && echo "✅ Get current user - OK" || echo "❌ Get current user - FAILED"

# Change password
echo "- Testing password change (invalid old password)..."
PWD_RESP=$(curl -s -w "\n%{http_code}" -X POST "${API}/auth/change-password" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"oldPassword": "wrongpassword", "newPassword": "NewPass123!"}')
PWD_STATUS=$(echo "$PWD_RESP" | tail -1)
[ "$PWD_STATUS" = "400" ] || [ "$PWD_STATUS" = "401" ] && echo "✅ Reject invalid old password - OK" || echo "❌ Reject invalid old password - FAILED"

echo ""
echo "==========================================="
echo "  Extended Tests Completed!"
echo "==========================================="