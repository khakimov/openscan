# Discovery Workflow Integration

## Overview

The discovery workflow is integrated into the onboarding process (Steps 2-3). When users provide a domain in Step 2 (Create Project), they proceed to Step 3 (Discovery) which uses TanStack Query for smart polling and result fetching.

## Current Implementation

### Architecture

```
Step 2: Create Project (2-create-project.tsx)
  → User enters domain (optional)
  → Navigate to Step 3 with domain

Step 3: Discovery (3-discovery.tsx)
  → Start Discovery Workflow (HTTP API)
  → TanStack Query auto-polls status (every 1s)
  → Auto-fetches results when complete
  → User selects discovered subdomains
  → Saves selected assets to inventory
```

### File Structure

```
apps/user-application/src/
├── features/onboarding/
│   ├── components/
│   │   ├── 2-create-project.tsx           # Organization + Project setup
│   │   ├── 3-discovery.tsx                # Discovery UI with TanStack Query
│   │   └── DiscoveryStatusCard.tsx        # Displays results + selection
│   ├── hooks/
│   │   └── use-organization-lifecycle.ts  # Org/project creation logic
│   ├── types/
│   │   └── discovery-status.ts            # Typed discovery result structures
│   └── utils/
│       └── validators.ts                  # Domain validation
├── server/
│   ├── discovery.ts                       # Server functions for workflows
│   ├── devices.ts                         # Device creation from discovery
│   └── utils/
│       └── temporal-http-client.ts        # HTTP-based Temporal client
└── routes/
    └── onboarding/
        ├── project.tsx                    # Step 2 route
        └── $projectId.discovery.tsx       # Step 3 route

packages/temporal/src/contracts/
└── discovery.ts                           # Shared workflow contracts
```

## Implementation Details

### Step 2: Create Project (`2-create-project.tsx`)

Users enter organization details, project name, and optionally a domain:

```typescript
import { useOrganizationLifecycle } from "../hooks/use-organization-lifecycle";
import { validateDomain } from "../utils/validators";

export function OnboardingCreateProject({
  hasOrganization,
  organizationId,
  deviceId,
  initialValues,
}: OnboardingCreateProjectProps) {
  const { setupOrganizationAndProject, error, setError } = useOrganizationLifecycle({
    hasOrganization,
    persistedOrganizationId: organizationId,
    deviceId,
  });

  const form = useForm({
    defaultValues: {
      organizationName: initialValues.organizationName ?? "",
      timezone: defaultTimezone,
      projectName: initialValues.projectName ?? "",
      domain: initialValues.domain ?? "",
    },
    onSubmit: async ({ value }) => {
      const setupResult = await setupOrganizationAndProject(value);

      if (setupResult.success && setupResult.deviceId) {
        // Navigate to discovery if domain provided
        if (value.domain) {
          navigate({
            to: "/onboarding/$projectId/discovery",
            params: { projectId: setupResult.deviceId },
            search: { domain: value.domain },
          });
        } else {
          // Skip to next step
          navigate({
            to: "/onboarding/$projectId/connect",
            params: { projectId: setupResult.deviceId },
          });
        }
      }
    },
  });
}
```

**Domain Validation:**

```typescript
// apps/user-application/src/features/onboarding/utils/validators.ts
export function validateDomain(domain: string): string | undefined {
  if (!domain) return undefined;

  const domainRegex = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$/i;
  if (!domainRegex.test(domain)) {
    return "Please enter a valid domain (e.g., example.com)";
  }

  return undefined;
}
```

### Step 3: Discovery UI (`3-discovery.tsx`)

Uses TanStack Query for declarative polling and result fetching:

```typescript
import { useQuery, useMutation } from "@tanstack/react-query";
import { startDiscoveryWorkflow, getWorkflowStatus, getWorkflowResult } from "@/server/discovery";

export function OnboardingDiscovery({ projectId, organizationId, domain }) {
  const [workflowId, setWorkflowId] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [selectedSubdomains, setSelectedSubdomains] = useState<Set<string>>(new Set());

  // Smart polling for workflow status - stops when complete/failed
  const { data: workflowStatus } = useQuery({
    queryKey: ["workflow-status", workflowId, runId],
    queryFn: () => getWorkflowStatus({
      data: { workflowId: workflowId!, runId: runId || undefined },
    }),
    enabled: !!workflowId,
    refetchInterval: (query) => {
      const data = query.state.data;
      // Stop polling when workflow completes or fails
      if (data?.isCompleted || data?.isFailed) {
        return false;
      }
      return 1000; // Poll every 1 second while running
    },
  });

  // Automatically fetch results when workflow completes
  const { data: workflowResults } = useQuery({
    queryKey: ["workflow-results", workflowId, runId],
    queryFn: () => getWorkflowResult({
      data: { workflowId: workflowId!, runId: runId || undefined },
    }),
    enabled: workflowStatus?.isCompleted === true,
  });

  // Derive UI state from queries
  const isRunning = workflowStatus?.isRunning === true;
  const isCompleted = workflowStatus?.isCompleted === true;
  const results = workflowResults?.success ? workflowResults.result : null;

  const handleStartDiscovery = async () => {
    const discoveryResult = await startDiscoveryWorkflow({
      data: { target: domain },
    });

    if (discoveryResult.success && discoveryResult.workflowId) {
      // Set IDs - useQuery hooks handle polling automatically
      setWorkflowId(discoveryResult.workflowId);
      setRunId(discoveryResult.runId || null);
    }
  };

  // Save selected subdomains as devices
  const saveDevicesMutation = useMutation({
    mutationFn: async () => {
      // Extract from typed discovery results
      const targetsData = Array.from(selectedSubdomains).map((host) => {
        const subdomain = results?.uniqueSubdomains?.find((s) => s.subdomain === host);
        return {
          host,
          ip: subdomain?.ip,
        };
      });

      return createDevicesFromDiscovery({
        data: {
          targets: targetsData,
          organizationId: organizationId || undefined,
          options: {
            source: "DISCOVERY",
            scope: "EXTERNAL",
            verificationStatus: "VERIFIED",
          },
        },
      });
    },
    onSuccess: () => {
      navigate({ to: "/onboarding/$projectId/connect", params: { projectId } });
    },
  });
}
```

### Discovery Result Types (`types/discovery-status.ts`)

```typescript
export type DiscoveryStatus = {
  workflowId?: string;
  runId?: string;
  status?: "RUNNING" | "COMPLETED" | "FAILED" | "UNKNOWN";
  message?: string;
  error?: string;
  result?: DiscoveryResult;
};

export type DiscoveryResult = {
  totalSubdomains: number;
  uniqueSubdomains: Array<DiscoverySubdomain>;
};

export type DiscoverySubdomain = {
  subdomain: string;
  ip: string;
};
```

### Server Functions (`server/discovery.ts`)

```typescript
import { getTemporalHttpClient } from './utils/temporal-http-client';
import { createServerFn } from '@tanstack/react-start/server';

const temporalClient = getTemporalHttpClient();

export const startDiscoveryWorkflow = createServerFn({ method: 'POST' })
  .validator(z.object({ target: z.string() }))
  .handler(async ({ data }) => {
    try {
      const handle = await temporalClient.startDiscoveryWorkflow({
        target: data.target,
        tools: ['subfinder'],
      });

      return {
        success: true,
        workflowId: handle.workflowId,
        runId: handle.runId,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to start discovery',
      };
    }
  });

export const getWorkflowStatus = createServerFn({ method: 'POST' })
  .validator(z.object({ workflowId: z.string(), runId: z.string().optional() }))
  .handler(async ({ data }) => {
    const description = await temporalClient.describeWorkflow(
      data.workflowId,
      data.runId
    );

    return {
      isRunning: description.status === 'RUNNING',
      isCompleted: description.status === 'COMPLETED',
      isFailed: description.status === 'FAILED',
      error: description.status === 'FAILED' ? 'Workflow failed' : undefined,
    };
  });

export const getWorkflowResult = createServerFn({ method: 'POST' })
  .validator(z.object({ workflowId: z.string(), runId: z.string().optional() }))
  .handler(async ({ data }) => {
    try {
      const result = await temporalClient.getWorkflowResult(
        data.workflowId,
        data.runId
      );

      return {
        success: true,
        result: {
          totalSubdomains: result.devices.length,
          uniqueSubdomains: result.devices.map(d => ({
            subdomain: d.hostname,
            ip: d.ipAddress || '',
          })),
        },
      };
    } catch (error) {
      return { success: false, error: 'Failed to fetch results' };
    }
  });
```

### Temporal HTTP Client (`server/utils/temporal-http-client.ts`)

HTTP-based client compatible with Cloudflare Workers:

```typescript
import { temporalConfig } from '@repo/config/temporal';

export function getTemporalHttpClient() {
  const baseUrl = temporalConfig.httpApiUrl;
  const namespace = temporalConfig.namespace;

  return {
    async startDiscoveryWorkflow(input: { target: string; tools?: string[] }) {
      const workflowId = `discovery-${input.target.replace(/\./g, '-')}-${Date.now()}`;

      // Encode payload as base64 JSON
      const payload = Buffer.from(JSON.stringify(input)).toString('base64');

      const response = await fetch(
        `${baseUrl}/api/v1/namespaces/${namespace}/workflows/${workflowId}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer temporal-http-client', // CSRF bypass
          },
          body: JSON.stringify({
            workflowType: { name: 'discoveryWorkflow' },
            taskQueue: { name: temporalConfig.taskQueue },
            input: {
              payloads: [{
                metadata: { encoding: 'anNvbi9wbGFpbg==' }, // base64("json/plain")
                data: payload,
              }],
            },
          }),
        }
      );

      const data = await response.json();
      return { workflowId, runId: data.runId };
    },

    async describeWorkflow(workflowId: string, runId?: string) {
      const url = runId
        ? `${baseUrl}/api/v1/namespaces/${namespace}/workflows/${workflowId}/runs/${runId}`
        : `${baseUrl}/api/v1/namespaces/${namespace}/workflows/${workflowId}`;

      const response = await fetch(url, {
        headers: { 'Authorization': 'Bearer temporal-http-client' },
      });

      const data = await response.json();
      return {
        status: data.workflowExecutionInfo.status.replace('WORKFLOW_EXECUTION_STATUS_', ''),
      };
    },

    async getWorkflowResult(workflowId: string, runId?: string) {
      const response = await fetch(
        `${baseUrl}/api/v1/namespaces/${namespace}/workflows/${workflowId}/history`,
        { headers: { 'Authorization': 'Bearer temporal-http-client' } }
      );

      const data = await response.json();
      const completedEvent = data.history.events.find(
        (e: any) => e.eventType === 'EVENT_TYPE_WORKFLOW_EXECUTION_COMPLETED'
      );

      const resultPayload = completedEvent.workflowExecutionCompletedEventAttributes.result.payloads[0].data;
      return JSON.parse(Buffer.from(resultPayload, 'base64').toString());
    },
  };
}
```

## Testing

### Manual Test via curl

Start a discovery workflow:

```bash
export TEMPORAL_HTTP=http://localhost:8233
export TEMPORAL_NAMESPACE=default
export WORKFLOW_ID="discovery-example-$(date +%s)"

# Start workflow (workflowId in URL path)
curl -i -X POST "${TEMPORAL_HTTP}/api/v1/namespaces/${TEMPORAL_NAMESPACE}/workflows/${WORKFLOW_ID}" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer temporal-http-client" \
  -d "{
    \"workflowType\": {\"name\": \"discoveryWorkflow\"},
    \"taskQueue\": {\"name\": \"scanner-tasks\"},
    \"input\": {
      \"payloads\": [
        {
          \"metadata\": {\"encoding\": \"anNvbi9wbGFpbg==\"},
          \"data\": \"$(echo -n '{\"target\":\"example.com\"}' | base64)\"
        }
      ]
    }
  }"
```

Check status:

```bash
# Get workflow status
curl -sS "${TEMPORAL_HTTP}/api/v1/namespaces/${TEMPORAL_NAMESPACE}/workflows/${WORKFLOW_ID}" \
  -H "Authorization: Bearer temporal-http-client" | \
  jq '{status: .workflowExecutionInfo.status, runId: .workflowExecutionInfo.execution.runId}'

# Get results (after completion)
curl -sS "${TEMPORAL_HTTP}/api/v1/namespaces/${TEMPORAL_NAMESPACE}/workflows/${WORKFLOW_ID}/history" \
  -H "Authorization: Bearer temporal-http-client" | \
  jq '.history.events[] | select(.eventType == "EVENT_TYPE_WORKFLOW_EXECUTION_COMPLETED") |
      .workflowExecutionCompletedEventAttributes.result.payloads[0].data' -r | \
  base64 -d | jq .
```

## Key Design Decisions

1. **TanStack Query for Polling**: Declarative, auto-stops when complete, built-in caching
2. **Typed Discovery Results**: Uses `uniqueSubdomains` instead of raw Temporal payload
3. **HTTP Client with CSRF Bypass**: Works in Cloudflare Workers, uses Authorization header
4. **Lean Hook Design**: Removed unused `organizations` prop and `isProcessing` state
5. **Explicit Org ID Requirement**: Hook refuses to guess organization ID in multi-org scenarios

## Configuration

Environment variables needed:

```bash
# .env or wrangler.jsonc
TEMPORAL_HTTP_API_URL=http://localhost:8233
TEMPORAL_NAMESPACE=default
TEMPORAL_TASK_QUEUE=scanner-tasks
```

## Troubleshooting

### Discovery not starting
- Check Temporal worker is running
- Verify TEMPORAL_HTTP_API_URL is accessible
- Check browser console for errors

### Polling never stops
- TanStack Query auto-stops when `isCompleted` or `isFailed` is true
- Check network tab to verify status API returns correct flags

### Results not displaying
- Verify workflow completed successfully
- Check that `uniqueSubdomains` array is populated
- Look for errors in result fetching query

## Future Improvements

1. Add caching for discovery results (TanStack Query already provides this)
2. Implement retry logic for failed workflows
3. Add ability to re-run discovery from dashboard
4. Save discovery history to database
5. Support advanced discovery options (tools selection, depth)
