# End-to-End Test Checklist: Universal Postback Architecture

**Version**: 1.0
**Date**: 2025-10-18
**Test Scope**: sec-60 - Universal Postback System

## Test Environment

- **Local Development**: http://localhost:3000
- **Restate Worker**: http://localhost:9080
- **Database**: Local D1 via Drizzle Studio
- **Analytics**: Cloudflare Workers Analytics Engine

## Prerequisites

- [ ] User application running (`pnpm dev`)
- [ ] Restate worker running (`pnpm dev`)
- [ ] Database accessible (Drizzle Studio)
- [ ] Valid test targets available
- [ ] WORKER_API_KEY configured in both apps
- [ ] APP_URL or BETTER_AUTH_URL configured

## Test Plan

### 1. Port Scan Workflow (PORT_SCAN Postback)

#### 1.1 Setup
- [ ] Identify test device in database
- [ ] Note device ID and organization ID
- [ ] Verify device not yet scanned (`isScanned = false`)

#### 1.2 Trigger Scan
- [ ] Start port scan from UI
- [ ] Verify scan_workflow created with status PENDING/RUNNING
- [ ] Verify scan_run created
- [ ] Note scanId (Restate workflow key)

#### 1.3 Monitor Execution
- [ ] Check Restate worker logs for scan start
- [ ] Verify scan executes (nmap/rustscan/masscan)
- [ ] Wait for completion (30-60 seconds)

#### 1.4 Verify Postback
- [ ] Check user-app logs for postback received
- [ ] Verify router logs show:
  - Authentication successful
  - Type = PORT_SCAN
  - Handler found
  - Payload validated
  - Handler completed successfully

#### 1.5 Verify Database Updates
- [ ] `scan_workflow.status` = SUCCEEDED
- [ ] `scan_run.status` = SUCCEEDED
- [ ] `scan_run.resultSummary` contains:
  - `target`
  - `openPortCount`
  - `ports` array with port details
  - `timing` metadata
  - `scanMetadata`
- [ ] `devices.isScanned` = true

#### 1.6 Verify Analytics
```bash
curl -s "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT/analytics_engine/sql" \
  -H "Authorization: Bearer $API_KEY" \
  -d "SELECT * FROM postback_events WHERE blob1 = '$SCAN_ID' ORDER BY timestamp DESC LIMIT 1"
```

Expected:
- [ ] `indexes[0]` = 'postback_portscan_success'
- [ ] `blobs[0]` = scanId
- [ ] `blobs[1]` = deviceId
- [ ] `blobs[2]` = organizationId
- [ ] `doubles[0]` = latency (ms)
- [ ] `doubles[1]` = port count

#### 1.7 Verify UI
- [ ] UI shows scan completed
- [ ] Port results displayed correctly
- [ ] Device marked as scanned

---

### 2. Discovery Workflow (DISCOVERY Postback)

#### 2.1 Setup
- [ ] Choose test domain (e.g., `example.com`)
- [ ] Verify domain passes validation
- [ ] Note organization ID

#### 2.2 Trigger Discovery
- [ ] Start discovery from UI (AddDiscovery modal)
- [ ] Enter target domain
- [ ] Click "Start Discovery"
- [ ] Verify scan_workflow created with kind=DISCOVERY
- [ ] Verify scan_run created
- [ ] Note scanId

#### 2.3 Monitor Execution
- [ ] Check Restate worker logs for discovery start
- [ ] Verify subfinder execution
- [ ] Check for discovered subdomains in logs
- [ ] Wait for completion (60-120 seconds)

#### 2.4 Verify Postback
- [ ] Check user-app logs for postback received
- [ ] Verify router logs show:
  - Authentication successful
  - Type = DISCOVERY
  - Handler found
  - Payload validated
  - Handler completed successfully
  - Device creation logs

#### 2.5 Verify Database Updates
- [ ] `scan_workflow.status` = SUCCEEDED
- [ ] `scan_run.status` = SUCCEEDED
- [ ] `scan_run.resultSummary` contains:
  - `target`
  - `totalSubdomains`
  - `discoveredDevices`
  - `createdDevices`
  - `skippedDevices`
  - `executionTime`
  - `tools` array
  - `errors` array
- [ ] New devices created in `devices` table
- [ ] Devices have:
  - Correct hostname
  - IP address (if resolved)
  - Tags: "discovery", "subdomain"
  - `source` = DISCOVERY
  - `scope` = EXTERNAL

#### 2.6 Verify Analytics
```bash
curl -s "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT/analytics_engine/sql" \
  -H "Authorization: Bearer $API_KEY" \
  -d "SELECT * FROM postback_events WHERE blob1 = '$SCAN_ID' ORDER BY timestamp DESC LIMIT 1"
```

Expected:
- [ ] `indexes[0]` = 'postback_discovery_success'
- [ ] `blobs[0]` = scanId
- [ ] `blobs[1]` = organizationId
- [ ] `blobs[2]` = organizationId
- [ ] `doubles[0]` = latency (ms)
- [ ] `doubles[1]` = device count

#### 2.7 Verify UI
- [ ] UI shows discovery completed
- [ ] Subdomain results displayed in table
- [ ] Can select subdomains
- [ ] "Add to Inventory" button enabled
- [ ] Clicking button creates devices
- [ ] Modal closes after successful creation

#### 2.8 Verify Database Polling
- [ ] UI polls every 3 seconds (check network tab)
- [ ] Polling stops when workflow completes
- [ ] Results fetched from database (not Restate)
- [ ] Results match discovery output

---

### 3. Error Handling Tests

#### 3.1 Authentication Failure
- [ ] Send postback with invalid WORKER_API_KEY
- [ ] Verify 401 Unauthorized response
- [ ] Verify analytics event: `postback_auth_failed`
- [ ] Verify error logged

#### 3.2 Invalid Type Field
- [ ] Send postback with missing `type` field
- [ ] Verify 400 Bad Request response
- [ ] Verify analytics event: `postback_validation_failed`
- [ ] Verify helpful error message

#### 3.3 Unsupported Type
- [ ] Send postback with `type: 'UNKNOWN'`
- [ ] Verify 400 Bad Request response
- [ ] Verify response includes `availableTypes` array
- [ ] Verify analytics event: `postback_validation_failed`

#### 3.4 Schema Validation Failure
- [ ] Send PORT_SCAN postback with missing `deviceId`
- [ ] Verify 400 Bad Request response
- [ ] Verify error message shows field path
- [ ] Verify analytics event: `postback_validation_failed`

#### 3.5 Port Scan Failure
- [ ] Trigger port scan that fails (unreachable host)
- [ ] Verify postback with `status: 'FAILURE'`
- [ ] Verify `scan_workflow.status` = FAILED
- [ ] Verify `scan_run.status` = FAILED
- [ ] Verify analytics event: `postback_portscan_failure`

#### 3.6 Discovery Failure
- [ ] Trigger discovery that fails (invalid domain)
- [ ] Verify postback with `status: 'FAILURE'`
- [ ] Verify `scan_workflow.status` = FAILED
- [ ] Verify `scan_run.status` = FAILED
- [ ] Verify analytics event: `postback_discovery_failure`

---

### 4. Performance Tests

#### 4.1 Postback Latency
- [ ] Measure time from postback received to response sent
- [ ] Target: < 500ms for success case
- [ ] Target: < 100ms for validation failures

#### 4.2 Database Query Performance
- [ ] Verify `getScanWorkflowByScanId` uses index
- [ ] Verify scan run lookup is efficient
- [ ] Check query execution time in logs

#### 4.3 Concurrent Postbacks
- [ ] Send 5 port scan postbacks simultaneously
- [ ] Verify all processed successfully
- [ ] Verify no race conditions
- [ ] Verify analytics recorded for all

---

### 5. Integration Tests

#### 5.1 Handler Registry
- [ ] Verify PORT_SCAN handler registered
- [ ] Verify DISCOVERY handler registered
- [ ] Verify `getAllTypes()` returns both
- [ ] Verify handler lookup by type works

#### 5.2 Analytics Helper
- [ ] Verify `buildSuccessAnalytics` format
- [ ] Verify `buildFailureAnalytics` format
- [ ] Verify event types are correct
- [ ] Verify data passed to Analytics Engine

#### 5.3 Authentication Helper
- [ ] Test with valid Bearer token
- [ ] Test with invalid token
- [ ] Test with missing Authorization header
- [ ] Test with malformed header

---

### 6. Backward Compatibility Tests

#### 6.1 Legacy Port Scan Postback
- [ ] Send old-format port scan postback
- [ ] Verify converted to universal format
- [ ] Verify processed successfully
- [ ] Verify database updated correctly

---

## Test Results

### Port Scan Workflow
- **Status**: ✅ Passed (with fixes)
- **Tested On**: 2025-10-18
- **Result**: Universal postback working correctly after fixes
- **Issues Found**:
  - Missing `organizationId` in port-scan-service.ts → Fixed
  - TypeScript error in discovery-service.ts → Fixed
- **Notes**:
  - Authentication working perfectly
  - Type discrimination working (PORT_SCAN correctly routed)
  - Handler found and payload validated
  - Database lookup failed because organizationId was "UNKNOWN"
  - Fixed by passing `organizationId: tenantId` to Restate

### Discovery Workflow
- **Status**: ⏳ Pending
- **Tested On**:
- **Result**:
- **Issues Found**:
- **Notes**:

### Error Handling
- **Status**: ⏳ Pending
- **Tested On**:
- **Result**:
- **Issues Found**:
- **Notes**:

### Performance
- **Status**: ⏳ Pending
- **Tested On**:
- **Result**:
- **Issues Found**:
- **Notes**:

---

## Issues Found

| ID | Severity | Description | Status | Fix |
|----|----------|-------------|--------|-----|
| 1  | P0       | Port scan service not passing organizationId to Restate | ✅ Fixed | Added `organizationId: tenantId` in port-scan-service.ts:96 |
| 2  | P1       | TypeScript error: Missing type annotation in discovery-service.ts | ✅ Fixed | Added `(d: any)` type annotation on line 249 |

---

## Sign-Off

- [ ] All critical tests passed
- [ ] No P0/P1 issues remaining
- [ ] Documentation updated
- [ ] Ready for production

**Tested By**: Claude Code
**Date**: 2025-10-18
**Sign-Off**:
