#!/bin/bash
set -e

# Copy devices from remote (production) to local for testing
# Usage: ./scripts/copy-devices-to-local.sh [organization_id] [project_id]

ORG_ID="${1:-SdeaOIRq605IgsuqxDWlQQXqHcMG7TyI}"
PROJECT_ID="${2:-z6h2ocz20i17ts9jrkzhd0ml}"
LIMIT="${3:-5}"

echo "🔄 Copying devices from remote to local..."
echo "   Organization: $ORG_ID"
echo "   Project: $PROJECT_ID"
echo "   Limit: $LIMIT devices"
echo ""

# Step 1: Export devices from remote
echo "📤 Exporting devices from remote..."
DEVICES=$(pnpm wrangler d1 execute sec-db --remote --json --command \
  "SELECT * FROM devices
   WHERE organization_id = '$ORG_ID'
   AND project_id = '$PROJECT_ID'
   AND is_scanned = 1
   LIMIT $LIMIT")

DEVICE_IDS=$(echo "$DEVICES" | jq -r '.[0].results[].id' | tr '\n' ',' | sed 's/,$//')

if [ -z "$DEVICE_IDS" ]; then
  echo "❌ No devices found in remote database"
  exit 1
fi

echo "   Found devices: $DEVICE_IDS"
echo ""

# Step 2: Export deviceSnapshots (contains portSnapshots with enrichment)
echo "📤 Exporting device snapshots from remote..."
SNAPSHOTS=$(pnpm wrangler d1 execute sec-db --remote --json --command \
  "SELECT * FROM deviceSnapshots
   WHERE deviceId IN ('$(echo $DEVICE_IDS | sed "s/,/','/g")')")

echo "   Found $(echo "$SNAPSHOTS" | jq '.[0].results | length') snapshots"
echo ""

# Step 3: Export scanRuns
echo "📤 Exporting scan runs from remote..."
SCAN_RUNS=$(pnpm wrangler d1 execute sec-db --remote --json --command \
  "SELECT * FROM scanRuns
   WHERE deviceId IN ('$(echo $DEVICE_IDS | sed "s/,/','/g")')")

echo "   Found $(echo "$SCAN_RUNS" | jq '.[0].results | length') scan runs"
echo ""

# Step 4: Generate SQL INSERT statements
echo "🔨 Generating INSERT statements..."

# Create temp SQL file
SQL_FILE="/tmp/copy-devices-$(date +%s).sql"

# Insert devices
echo "$DEVICES" | jq -r '
  .[0].results[] |
  "INSERT OR REPLACE INTO devices (
    id, organization_id, project_id, source, name, scope, risk_level,
    is_billable, state, is_scanned, responds_to_ping, verification_status,
    verified_at, verified_by, verification_note, notes, last_seen_at,
    created_at, updated_at
  ) VALUES (
    '\''\(.id)'\'', '\''\(.organization_id)'\'', '\''\(.project_id // "")'\'',
    '\''\(.source)'\'', '\''\(.name)'\'', '\''\(.scope)'\'', '\''\(.risk_level)'\'',
    \(.is_billable), '\''\(.state)'\'', \(.is_scanned), \(.responds_to_ping),
    '\''\(.verification_status)'\'', \(.verified_at // "NULL"),
    \(if .verified_by then "'\''"+.verified_by+"'\''" else "NULL" end),
    \(if .verification_note then "'\''"+.verification_note+"'\''" else "NULL" end),
    \(if .notes then "'\''"+.notes+"'\''" else "NULL" end),
    \(.last_seen_at // "NULL"), \(.created_at), \(.updated_at)
  );"
' > "$SQL_FILE"

# Insert deviceSnapshots
echo "$SNAPSHOTS" | jq -r '
  .[0].results[] |
  "INSERT OR REPLACE INTO deviceSnapshots (
    id, deviceId, snapshotData, scanStats, createdAt
  ) VALUES (
    '\''\(.id)'\'', '\''\(.deviceId)'\'',
    '\''\(.snapshotData | @json | gsub("'\''"; "'\'\''"))'\'',
    '\''\(.scanStats | @json | gsub("'\''"; "'\'\''"))'\'',
    \(.createdAt)
  );"
' >> "$SQL_FILE"

# Insert scanRuns
echo "$SCAN_RUNS" | jq -r '
  .[0].results[] |
  "INSERT OR REPLACE INTO scanRuns (
    id, deviceId, scanId, status, scheduledBy, requestedAt, startedAt,
    completedAt, failedAt, resultSummary, errorDetails
  ) VALUES (
    '\''\(.id)'\'', '\''\(.deviceId)'\'', '\''\(.scanId)'\'', '\''\(.status)'\'',
    '\''\(.scheduledBy)'\'', \(.requestedAt),
    \(.startedAt // "NULL"), \(.completedAt // "NULL"), \(.failedAt // "NULL"),
    \(if .resultSummary then "'\''"+(.resultSummary | @json | gsub("'\''"; "'\'\''"))+"'\''" else "NULL" end),
    \(if .errorDetails then "'\''"+.errorDetails+"'\''" else "NULL" end)
  );"
' >> "$SQL_FILE"

echo "   SQL file created: $SQL_FILE"
echo ""

# Step 5: Import into local database
echo "📥 Importing into local database..."
pnpm wrangler d1 execute sec-db --local --file="$SQL_FILE"

echo ""
echo "✅ Successfully copied $LIMIT devices to local database!"
echo ""
echo "📊 Imported data:"
echo "   - Devices: $(echo "$DEVICES" | jq '.[0].results | length')"
echo "   - Snapshots: $(echo "$SNAPSHOTS" | jq '.[0].results | length')"
echo "   - Scan runs: $(echo "$SCAN_RUNS" | jq '.[0].results | length')"
echo ""
echo "🔍 To verify, run:"
echo "   pnpm wrangler d1 execute sec-db --local --command \"SELECT id, name, is_scanned FROM devices WHERE organization_id = '$ORG_ID'\""
