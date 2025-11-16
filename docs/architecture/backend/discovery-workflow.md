# Discovery Workflow

Comprehensive reference for the discovery orchestration: the original Temporal
worker architecture and the current onboarding integration inside the user
application. Use this document when migrating workflows or diagnosing the
discovery flow end-to-end.

---

## Temporal Worker Architecture

> Source: consolidated from the prior *Discovery Workflow Analysis* document.

### Task
- **sec-19** – understand the Temporal discovery workflow before porting to Restate.

### File Structure
```
apps/temporal-worker/src/workflows/discovery/
├── workflow.ts                   # Main orchestrator
├── activities/
│   ├── subdomain-discovery.ts    # Tool execution (subfinder, amass, assetfinder)
│   ├── ping-sweep.ts             # Network reachability check
│   └── index.ts                  # Activity exports
└── mock-data/
    └── discovery.ts              # Dev mode mock data
```

### Workflow Flow
```
┌─────────────────────────────────────────────────┐
│ discoveryWorkflow(input)                         │
├─────────────────────────────────────────────────┤
│ Phase 1: VALIDATING                              │
│   → validateScanTargets(targets)                 │
│   → Filter valid/invalid targets                 │
│                                                  │
│ Phase 2: DISCOVERING                             │
│   → For each valid target:                       │
│       if DOMAIN: runSubdomainDiscovery(target)   │
│       else: create device directly               │
│   → Deduplicate devices                          │
│                                                  │
│ Phase 3: PING_SWEEP (optional)                   │
│   → runPingSweep(ipAddresses)                    │
│   → Update device confidence scores              │
│                                                  │
│ Phase 4: COMPLETED                               │
│   → Return DiscoveryOutput with all devices      │
└─────────────────────────────────────────────────┘
```

### Main Workflow (`workflow.ts`)
- Orchestrates phase progression: `VALIDATING → DISCOVERING → PING_SWEEP → COMPLETED`.
- Maintains Temporal worklow state and supports queries.
- Continues on individual target failures while aggregating errors.
- Deduplicates devices by hostname + IP combination.

**State Shape**
```ts
{
  phase: 'VALIDATING' | 'DISCOVERING' | 'PING_SWEEP' | 'COMPLETED' | 'FAILED',
  totalTargets: number,
  processedTargets: number,
  devicesFound: number,
  errors: string[],
  startedAt: Date,
  completedAt?: Date,
}
```

**Input / Output**
```ts
type DiscoveryInput = {
  targets: DiscoveryTarget[];
};

type DiscoveryOutput = {
  scanId: string;
  startedAt: Date;
  completedAt: Date;
  devices: DiscoveredDevice[];
  pingSweepResults?: Record<string, boolean>;
  subdomains: string[];
  totalTargetsProcessed: number;
  errors: string[];
  performance: {
    executionTimeMs: number;
    devicesPerSecond: number;
  };
};
```

### Activities

#### Subdomain Discovery (`subdomain-discovery.ts`)
- Executes `subfinder`, `amass`, and `assetfinder` with secure `execFile` calls.
- Validates domain input using strict regex.
- Supports dev mode via `SCANNER_DEV_MODE` and mock data.

#### Ping Sweep (`ping-sweep.ts`)
- ICMP/ARP check to confirm host reachability.
- Updates confidence score for each device.

---

## Onboarding Integration (User Application)

> Source: consolidated from the prior *Discovery Workflow Integration* document.

### Overview
- Discovery runs during onboarding steps 2–3.
- Step 2 (Create Project) captures optional domain.
- Step 3 (Discovery) triggers the workflow and polls for completion using TanStack
  Query.

### Flow
```
Step 2: Create Project (2-create-project.tsx)
  → User enters domain (optional)
  → Navigate to Step 3 with domain

Step 3: Discovery (3-discovery.tsx)
  → Start Discovery Workflow (HTTP API)
  → TanStack Query auto-polls status (every 1s)
  → Auto-fetches results when complete
  → User selects discovered subdomains
  → Selected devices saved to inventory
```

### Important Files
```
apps/user-application/src/
├── features/onboarding/
│   ├── components/
│   │   ├── 2-create-project.tsx         # Org + project setup
│   │   ├── 3-discovery.tsx              # Discovery UI with TanStack Query
│   │   └── DiscoveryStatusCard.tsx      # Results + selection
│   ├── hooks/
│   │   └── use-organization-lifecycle.ts# Org/project creation
│   ├── types/
│   │   └── discovery-status.ts          # Typed discovery result structures
│   └── utils/
│       └── validators.ts                # Domain validation
├── server/
│   ├── discovery.ts                     # Workflow API wrappers (legacy)
│   ├── devices.ts                       # Device creation helpers
│   └── utils/
│       └── temporal-http-client.ts      # HTTP Transport for Temporal
└── routes/
    └── onboarding/
        ├── project.tsx                  # Step 2 route
        └── $projectId.discovery.tsx     # Step 3 route

packages/temporal/src/contracts/discovery.ts
```

### Step 2 Highlights – `2-create-project.tsx`
- Handles organization + project creation.
- Validates domains via `validateDomain`.
- Navigates to discovery step when domain provided.

```ts
const form = useForm({
  defaultValues: {
    organizationName: initialValues.organizationName ?? '',
    timezone: defaultTimezone,
    projectName: initialValues.projectName ?? '',
    domain: initialValues.domain ?? '',
  },
  onSubmit: async ({ value }) => {
    const setupResult = await setupOrganizationAndProject(value);

    if (setupResult.success && setupResult.deviceId) {
      if (value.domain) {
        navigate({
          to: '/onboarding/$projectId/discovery',
          params: { projectId: setupResult.deviceId },
          search: { domain: value.domain },
        });
      } else {
        navigate({
          to: '/onboarding/$projectId/connect',
          params: { projectId: setupResult.deviceId },
        });
      }
    }
  },
});
```

### Step 3 Highlights – `3-discovery.tsx`
- Starts the workflow via API call.
- Uses TanStack Query polling with 1s interval.
- Presents `DiscoveryStatusCard` summarising results and providing selection UI.

---

## Key Takeaways

- **Two touchpoints:** Temporal worker orchestration and onboarding UI both need
  alignment during the Restate migration.
- **Inputs/outputs stay consistent:** Both layers rely on the same contracts to
  avoid data-shape drift.
- **Polling strategy:** TanStack Query handles polling, so SSR migrations must
  preserve query keys and error semantics.

For Restate porting, use this document as the master reference and update
sections as the workflow evolves.
