#!/bin/bash
# Query Analytics Engine for postback events using SQL API
# Docs: https://developers.cloudflare.com/analytics/analytics-engine/sql-api/

# Cloudflare account ID
ACCOUNT_ID="b846a37c6228b2869896493f338f17d5"

# API token with Account Analytics Read permission
CLOUDFLARE_API_TOKEN="${CLOUDFLARE_API_TOKEN:-YGeh93yMgMl32K_GErNgyl36BeomWrF0ZcvlS2q8}"

echo "════════════════════════════════════════════════════════════════"
echo "  Analytics Engine - Postback Events"
echo "════════════════════════════════════════════════════════════════"
echo ""

# Query: Event counts by type (last 24 hours)
echo "📊 Event counts by type (last 24 hours):"
echo ""

SQL_QUERY="SELECT
  index1 AS event_type,
  count() AS count,
  avg(double1) AS avg_latency_ms
FROM postback_events
WHERE timestamp >= NOW() - INTERVAL '1' DAY
GROUP BY event_type
ORDER BY count DESC"

RESPONSE=$(curl -s "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/analytics_engine/sql" \
  --header "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  --data "$SQL_QUERY")

# Check if response is valid JSON (starts with { or [)
if echo "$RESPONSE" | jq -e . >/dev/null 2>&1; then
  echo "$RESPONSE" | jq -r '
    .data |
    ["Event Type", "Count", "Avg Latency (ms)"],
    ["-----------", "-----", "----------------"],
    (.[] | [.event_type, .count, (.avg_latency_ms | tostring)])
    | @tsv
  '
else
  # Raw response (likely plain text error or data)
  echo "$RESPONSE"
fi

echo ""
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "Data point schema:"
echo "  - index1: event_type (postback_success, postback_auth_failed, etc.)"
echo "  - blob1: scanId"
echo "  - blob2: deviceId"
echo "  - blob3: organizationId or error message"
echo "  - double1: latency (ms)"
echo "  - double2: port count (for success events)"
echo ""
echo "To see more queries, check: https://developers.cloudflare.com/analytics/analytics-engine/sql-api/"
echo ""
