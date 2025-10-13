# Discovery Workflow Integration

## Overview

The discovery workflow has been integrated into the onboarding process (Step 2). When users provide a domain, the system attempts to start a Temporal discovery workflow to find subdomains.

## Current Status

### ✅ Completed

1. **UI Integration** (`apps/user-application/src/features/onboarding/components/2-project.tsx`)
   - Domain input field added to step 2
   - Discovery workflow trigger on form submission
   - Status polling (checks every 1 second, max 60 attempts)
   - Results display with subdomain list
   - Error handling with skip option

2. **HTTP Client Implementation** (`apps/user-application/src/server/utils/temporal-http-client.ts`)
   - HTTP-based Temporal client for Cloudflare Workers
   - Uses Temporal UI server HTTP API (port 8233)
   - CSRF bypass using Authorization header
   - Workflow start, describe, and result fetching methods

3. **Configuration** (`packages/config/src/temporal.ts`)
   - Added `TEMPORAL_HTTP_API_URL` environment variable
   - Defaults to `http://localhost:8233`

4. **Bug Fixes**
   - Fixed Temporal client imports (changed from default to named imports)
   - Fixed 3 files with incorrect import patterns

### ⚠️ Known Issues

1. **Cloudflare Workers Compatibility**
   - The Temporal Node.js gRPC client doesn't work in Cloudflare Workers runtime
   - Workers environment blocks dynamic code generation (required by gRPC)
   - Error: "Code generation from strings disallowed for this context"

2. **HTTP API Format** ✅ FULLY RESOLVED
   - ✅ Correct endpoint: `POST /api/v1/namespaces/{namespace}/workflows/{workflowId}` (workflowId in URL path)
   - ✅ Authorization header bypass works (`Authorization: Bearer ...`)
   - ✅ Workflow start request returns 200 with runId
   - ✅ Correct format: `input.payloads[].data` with base64-encoded JSON
   - ✅ Worker successfully receives and decodes `DiscoveryRequest`
   - ✅ HTTP client updated to use proper endpoint and payload encoding
   - ✅ WorkflowId and runId handling implemented in all UI components
   - ✅ End-to-end workflow discovery tested and working

## Architecture

### Discovery Flow

```
User Input (domain)
  → Form Submit
  → Start Discovery Workflow (HTTP API)
  → Poll Status (every 1s, max 60s)
  → Fetch Results
  → Display Subdomains
  → Continue to Step 3
```

### File Structure

```
apps/user-application/
├── src/
│   ├── features/onboarding/components/
│   │   └── 2-project.tsx                    # UI with discovery integration
│   ├── server/
│   │   ├── utils/
│   │   │   └── temporal-http-client.ts      # HTTP-based Temporal client
│   │   └── discovery/
│   │       ├── services/
│   │       │   ├── workflow-orchestrator.ts        # gRPC client (Node.js only)
│   │       │   └── workflow-orchestrator-http.ts   # HTTP client (Workers compatible)
│   │       └── workflows/
│   │           └── discovery-handler.ts     # Server functions
│   └── wrangler.jsonc                        # Added TEMPORAL_HTTP_API_URL
└── package.json                              # Added typecheck script

packages/config/
└── src/
    └── temporal.ts                           # Added httpApiUrl config
```

## Implementation Details

### 1. Domain Input & Validation

**File:** `2-project.tsx`

```typescript
<form.Field
  name="domain"
  validators={{
    onChange: ({ value }) => {
      if (!value) return undefined;
      const domainRegex = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$/i;
      if (!domainRegex.test(value)) {
        return "Please enter a valid domain (e.g., example.com)";
      }
      return undefined;
    },
  }}
>
```

### 2. Discovery Workflow Trigger

```typescript
if (value.domain) {
  setIsDiscovering(true);

  const discoveryResult = await startDiscoveryWorkflow({
    data: { target: value.domain },
  });

  if (discoveryResult.success && discoveryResult.workflowId) {
    // Poll status every 1 second
    const pollStatus = async () => {
      const statusResult = await getWorkflowStatus({
        data: { workflowId: discoveryResult.workflowId },
      });

      if (statusResult.status === "COMPLETED") {
        const resultData = await getWorkflowResult({
          data: { workflowId: discoveryResult.workflowId },
        });
        // Display results
      }
    };
  }
}
```

### 3. HTTP Client Configuration

**Environment Variables:**

```bash
# .env or wrangler.jsonc
TEMPORAL_HTTP_API_URL=http://localhost:8233
TEMPORAL_NAMESPACE=default
TEMPORAL_TASK_QUEUE=scanner-tasks
```

**HTTP Client Usage:**

```typescript
import { getTemporalHttpClient } from '@/server/utils/temporal-http-client';

const client = getTemporalHttpClient();

// Start workflow
const handle = await client.startDiscoveryWorkflow({
  target: 'example.com',
});

// Check status
const description = await client.describeWorkflow(
  handle.workflowId,
  handle.runId
);

// Get result (fetches from workflow history)
if (description.status === 'COMPLETED') {
  const result = await client.getWorkflowResult(
    handle.workflowId,
    handle.runId
  );
  // Returns the decoded workflow result: { scanId, devices, subdomains, etc. }
}
```

### 4. CSRF Bypass

The Temporal UI server skips CSRF validation when an `Authorization` header is present:

```typescript
// From ui-server/server/csrf/skipper.go
func SkipOnAuthorizationHeader(c echo.Context) bool {
  return c.Request().Header.Get(echo.HeaderAuthorization) != ""
}
```

Our implementation:

```typescript
const headers: Record<string, string> = {
  'Content-Type': 'application/json',
  'Authorization': 'Bearer temporal-http-client', // Any value works
};
```

## Alternative Solutions

### Option 1: Use Temporal gRPC API Directly

**Pros:**
- Official supported method
- Well-documented
- Type-safe with protobuf

**Cons:**
- Doesn't work in Cloudflare Workers
- Requires Node.js runtime
- Would need separate API service

**Implementation:**

```typescript
// Only works in Node.js
import { Client } from '@temporalio/client';

const client = new Client({
  connection: Connection.lazy({
    address: 'localhost:7233',
  }),
});

const handle = await client.workflow.start('discoveryWorkflow', {
  taskQueue: 'scanner-tasks',
  args: [{ target: 'example.com' }],
});
```

### Option 2: Create Node.js Proxy Service

Create a separate Express/Fastify service that proxies Temporal operations:

```
Frontend (Workers) → Node.js API → Temporal gRPC
                     ↓
                    POST /api/temporal/discovery/start
                    POST /api/temporal/discovery/{id}/status
                    GET  /api/temporal/discovery/{id}/result
```

**Pros:**
- Works with Cloudflare Workers
- Clean separation of concerns
- Can add caching/rate limiting

**Cons:**
- Additional service to maintain
- More infrastructure complexity

### Option 3: Use Temporal HTTP API (In Progress)

**Status:** Partially implemented, endpoint structure unclear

**Pros:**
- Works in Cloudflare Workers
- No additional services needed
- Direct communication with Temporal

**Cons:**
- Less documentation
- Endpoint structure not fully clear
- UI server may change/deprecate API

### Option 4: Disable Discovery in Workers Mode

**Temporary solution** - Show helpful error and allow skip:

```typescript
if (errorMessage.includes('Code generation from strings disallowed')) {
  return {
    success: false,
    error: 'Discovery workflows require Node.js runtime. Skip for now.',
    errorType: 'RUNTIME_NOT_SUPPORTED',
  };
}
```

## 🔧 Workaround: Run in Node.js Mode (Development)

Since the HTTP API has a payload encoding issue, the quickest fix for development is to run in Node.js mode:

### Step 1: Disable Cloudflare Plugin

**File:** `vite.config.ts`

```typescript
import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import viteTsConfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
// import { cloudflare } from "@cloudflare/vite-plugin"; // Comment this out

const config = defineConfig({
  plugins: [
    viteTsConfigPaths({
      projects: ["./tsconfig.json"],
    }),
    tailwindcss(),
    tanstackStart({
      srcDirectory: "src",
      start: { entry: "./start.tsx" },
      server: { entry: "./server.ts" },
    }),
    viteReact(),
    // cloudflare({  // Comment this out for dev
    //   viteEnvironment: {
    //     name: "ssr",
    //   },
    // }),
  ],
});

export default config;
```

### Step 2: Update Discovery Handler

**File:** `src/server/discovery/workflows/discovery-handler.ts`

```typescript
// Use gRPC client in Node.js mode
import { workflowOrchestrator } from '../services/workflow-orchestrator';

// Instead of:
// import { workflowOrchestratorHttp } from '../services/workflow-orchestrator-http';
```

### Step 3: Run Development Server

```bash
pnpm dev
```

This will use the gRPC Temporal client which works perfectly in Node.js!

## Recommended Next Steps

1. **Fix HTTP API Payload Format** (Priority)
   - Debug the exact payload structure Temporal HTTP API expects
   - The workflow is triggering but input is undefined
   - Test with different payload encodings

2. **Complete HTTP Client Implementation**
   - Once payload format is fixed, test end-to-end
   - Add proper error handling for all edge cases
   - Add request/response logging

3. **OR: Create Node.js Proxy Service**
   - Set up Express/Fastify server
   - Implement proxy endpoints
   - Deploy alongside Temporal worker

4. **Production Deployment**
   - Use Node.js runtime for server-side rendering
   - Or fix HTTP client and use Workers mode

## Testing

### Manual Test via curl

**IMPORTANT:** The Temporal HTTP API requires:
1. **workflowId in the URL path** (not in the request body)
2. Payloads to be base64-encoded in the `input.payloads` array format
3. The `args` field is NOT supported by the HTTP API (it only works with the gRPC client)

```bash
export TEMPORAL_HTTP=http://localhost:8233
export TEMPORAL_NAMESPACE=default
export TEMPORAL_AUTH="Authorization: Bearer temporal-http-client"
export WORKFLOW_ID="discovery-manual-$(date +%s)"

echo "Starting workflow with ID: $WORKFLOW_ID"

# IMPORTANT: workflowId goes in the URL path, NOT in the request body
curl -i -X POST "${TEMPORAL_HTTP}/api/v1/namespaces/${TEMPORAL_NAMESPACE}/workflows/${WORKFLOW_ID}" \
  -H "Content-Type: application/json" \
  -H "$TEMPORAL_AUTH" \
  -d "{
    \"workflowType\": {\"name\": \"discoveryWorkflow\"},
    \"taskQueue\": {\"name\": \"scanner-tasks\"},
    \"input\": {
      \"payloads\": [
        {
          \"metadata\": {
            \"encoding\": \"anNvbi9wbGFpbg==\"
          },
          \"data\": \"$(echo -n '{\"target\":\"example.com\",\"scanType\":\"basic\",\"tools\":[\"subfinder\"]}' | base64)\"
        }
      ]
    }
  }"
```

**Payload Format Explanation:**
- `metadata.encoding`: Base64-encoded string "json/plain" (`anNvbi9wbGFpbg==`)
- `data`: Base64-encoded JSON object containing the `DiscoveryRequest`
- The worker's `discoveryWorkflow` expects: `{ target: string, scanType?: 'basic'|'advanced', tools?: string[] }`

**Available Tools:**
- `subfinder` (fast, default)
- `amass` (slower, more thorough)
- `assetfinder` (alternative)

### Check Workflow Status

**Understanding Workflow IDs:**
- **workflowId**: The custom ID you provide when starting the workflow (e.g., `discovery-openpanel-1760324704`)
- **runId**: A unique UUID returned by Temporal for this specific execution (e.g., `bf93d262-9986-4492-9a05-ff32113cd17c`)
- You can query workflows using just the `workflowId` (returns latest run) or `workflowId + runId` (specific run)

```bash
# List recent workflows
curl -sS "http://localhost:8233/api/v1/namespaces/default/workflows" \
  -H "Authorization: Bearer temporal-http-client" | \
  jq '.executions[0:5] | .[] | {workflowId: .execution.workflowId, runId: .execution.runId, status: .status, type: .type.name}'

# Describe workflow using workflowId (gets latest run):
curl -sS "http://localhost:8233/api/v1/namespaces/default/workflows/${WORKFLOW_ID}" \
  -H "Authorization: Bearer temporal-http-client" | \
  jq '{status: .workflowExecutionInfo.status, execution: .workflowExecutionInfo.execution}'

# Get workflow results from history (after completion):
curl -sS "http://localhost:8233/api/v1/namespaces/default/workflows/${WORKFLOW_ID}/history" \
  -H "Authorization: Bearer temporal-http-client" | \
  jq '.history.events[] | select(.eventType == "EVENT_TYPE_WORKFLOW_EXECUTION_COMPLETED") | .workflowExecutionCompletedEventAttributes.result.payloads[0].data' -r | \
  base64 -d | jq .
```

## Resources

- [Temporal Server Frontend API](https://docs.temporal.io/references/server-apis#frontend-api)
- [Temporal UI Server GitHub](https://github.com/temporalio/ui-server)
- [Temporal gRPC API Docs](https://api-docs.temporal.io)
- [Cloudflare Workers Limitations](https://developers.cloudflare.com/workers/platform/limits/)

## Troubleshooting

### Error: "Code generation from strings disallowed"

**Cause:** Temporal gRPC client tries to use eval/Function() which is blocked in Workers

**Solution:** Use HTTP client or Node.js runtime

### Error: "missing csrf token in request header"

**Cause:** Temporal UI server requires CSRF for POST requests

**Solution:** Add `Authorization` header to bypass CSRF check

### Error: "Method Not Allowed"

**Cause:** Wrong HTTP endpoint or method

**Solution:** Verify endpoint structure from Temporal UI server documentation

## Changes Made

### Files Modified

1. `packages/config/src/temporal.ts` - Added httpApiUrl config
2. `apps/user-application/wrangler.jsonc` - Added TEMPORAL_HTTP_API_URL var
3. `apps/user-application/package.json` - Added typecheck script
4. `apps/user-application/src/features/onboarding/components/2-project.tsx` - Added discovery UI
5. `apps/user-application/src/server/discovery/workflows/discovery-handler.ts` - Updated to use HTTP orchestrator

### Files Created

1. `apps/user-application/src/server/utils/temporal-http-client.ts` - HTTP client
2. `apps/user-application/src/server/discovery/services/workflow-orchestrator-http.ts` - HTTP orchestrator

### Bug Fixes

1. `apps/user-application/src/server/discovery/services/workflow-orchestrator.ts:1` - Fixed import
2. `apps/user-application/src/server/discovery/workflows/port-scan/lifecycle.ts:3` - Fixed import
3. `apps/user-application/src/server/workflows/workflow-health-monitor.ts:23` - Fixed import

## Future Improvements

1. Add caching for discovery results
2. Implement retry logic for failed workflows
3. Add progress indicators for long-running discoveries
4. Save discovered subdomains to database
5. Add ability to re-run discovery later
6. Implement discovery scheduling
