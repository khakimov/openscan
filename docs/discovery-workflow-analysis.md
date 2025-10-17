# Discovery Workflow Analysis

**Task:** sec-19
**Purpose:** Understand current Temporal discovery workflow before porting to Restate

---

## Current Architecture (Temporal)

### File Structure
```
apps/temporal-worker/src/workflows/discovery/
├── workflow.ts                    # Main orchestrator
├── activities/
│   ├── subdomain-discovery.ts    # Tool execution (subfinder, amass, assetfinder)
│   ├── ping-sweep.ts              # Network reachability check
│   └── index.ts                   # Activity exports
└── mock-data/
    └── discovery.ts               # Dev mode mock data
```

### Workflow Flow

```
┌─────────────────────────────────────────────────┐
│ discoveryWorkflow(input)                         │
├─────────────────────────────────────────────────┤
│ Phase 1: VALIDATING                              │
│   → validateScanTargets(targets)                 │
│   → Filter valid/invalid targets                 │
│                                                   │
│ Phase 2: DISCOVERING                             │
│   → For each valid target:                       │
│       if DOMAIN: runSubdomainDiscovery(target)   │
│       else: create device directly               │
│   → Deduplicate devices                          │
│                                                   │
│ Phase 3: PING_SWEEP (optional)                   │
│   → runPingSweep(ipAddresses)                    │
│   → Update device confidence scores              │
│                                                   │
│ Phase 4: COMPLETED                               │
│   → Return DiscoveryOutput with all devices      │
└─────────────────────────────────────────────────┘
```

### Key Components

#### 1. **Main Workflow** (`workflow.ts`)

**Responsibilities:**
- Phase orchestration (VALIDATING → DISCOVERING → PING_SWEEP → COMPLETED)
- State management (via Temporal queries)
- Error handling (continues on target failures)
- Deduplication (hostname+IP combination)

**State Tracking:**
```typescript
{
  phase: 'VALIDATING' | 'DISCOVERING' | 'PING_SWEEP' | 'COMPLETED' | 'FAILED',
  totalTargets: number,
  processedTargets: number,
  devicesFound: number,
  errors: string[],
  startedAt: Date,
  completedAt?: Date
}
```

**Input Format:**
- New format: `DiscoveryInput` with targets array
- Old format: `DiscoveryRequest` with single target (backward compatible)

**Output Format:**
```typescript
{
  scanId: string,
  startedAt: Date,
  completedAt: Date,
  devices: DiscoveredDevice[],
  pingSweepResults?: Record<string, boolean>,
  subdomains: string[], // Backward compatibility
  totalTargetsProcessed: number,
  errors: string[],
  performance: {
    executionTimeMs: number,
    devicesPerSecond: number
  }
}
```

#### 2. **Subdomain Discovery** (`subdomain-discovery.ts`)

**Tools Supported:**
- `subfinder` - Fast, reliable (2min timeout)
- `amass` - Comprehensive (10min timeout)
- `assetfinder` - Quick alternative (5min timeout)

**Security:** ✅ **Already secure!**
```typescript
// Uses execFile (not exec) - no shell injection
await execFileAsync(findTool('subfinder'), ['-d', domain, '-active', '-ip', '-oJ'])

// Input validation
const domainRegex = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;
if (!domainRegex.test(domain)) {
  throw new Error('Invalid domain format');
}
```

**Dev Mode:**
- `SCANNER_DEV_MODE=true` returns mock data
- `SCANNER_DEV_SLEEP_SECONDS` configures delay
- No real tool execution in dev mode

**Tool Outputs:**
- **subfinder**: JSON lines with `{host, ip, source}`
- **amass**: Plain text, one hostname per line
- **assetfinder**: Plain text, one hostname per line

**Discovery Flow:**
```
1. Run each tool sequentially (subfinder, amass, assetfinder)
2. Parse tool-specific output format
3. Create DiscoveredDevice objects
4. Deduplicate by hostname+IP
5. Return unique devices
```

**DiscoveredDevice Structure:**
```typescript
{
  scope: 'EXTERNAL' | 'INTERNAL',
  hostname: string,
  ipAddress?: string,
  discoveredAt: Date,
  discoveryMethod: 'subfinder' | 'amass' | 'assetfinder' | 'direct',
  confidence: number, // 0.0-1.0
  metadata: {
    originalDomain: string,
    source?: string
  }
}
```

#### 3. **Ping Sweep** (`ping-sweep.ts`)

**Purpose:** Verify network reachability of discovered IPs

**Output:**
```typescript
Record<string, boolean> // IP → isAlive
```

**Integration:**
- Updates device confidence scores
- `1.0` if ping succeeds
- `0.5` if ping fails

---

## Migration to Restate: Key Mappings

### 1. **Temporal → Restate Concepts**

| Temporal Concept | Restate Equivalent | Notes |
|------------------|-------------------|-------|
| `workflow` | `service handler` | Top-level orchestrator |
| `activity` | `ctx.run()` | Durable execution step |
| `proxyActivities` | Direct function calls | No proxy needed |
| `defineQuery` + `setHandler` | Service method | State queries via handler |
| `sleep('100ms')` | `ctx.sleep({milliseconds: 100})` | Durable timer |
| `workflowInfo()` | `ctx.rand.uuidv4()` | Deterministic IDs |
| `log.info()` | `logger.info()` | Standard logging |

### 2. **Security: Already Compliant!**

✅ The Temporal worker **already uses secure patterns**:
- ✅ `execFile` instead of `exec`
- ✅ Domain validation regex
- ✅ Arguments passed as array
- ✅ No shell interpolation

**We can port the security logic as-is!**

### 3. **Code Reuse Opportunities**

**Can be reused with minimal changes:**
- ✅ Tool execution logic (`runDiscoveryTool`)
- ✅ Output parsers (`parseSubfinderOutput`, `parseAmassOutput`, etc.)
- ✅ Deduplication logic (`deduplicateByHostname`)
- ✅ Domain validation regex
- ✅ Dev mode mock data

**Needs adaptation:**
- ⚠️ Workflow orchestration (Temporal → Restate ctx)
- ⚠️ State queries (Temporal queries → Restate service method)
- ⚠️ Activity timeouts (Temporal policies → Restate ctx.run options)

---

## Restate Implementation Plan

### Phase 1: Service Skeleton
```typescript
export const discoveryService = restate.service({
  name: 'Discovery',
  handlers: {
    discover: async (ctx, input: DiscoveryInput) => {
      // Main workflow logic here
    },
    getState: async (ctx, {scanId}: {scanId: string}) => {
      // Query state during execution
    },
    cancel: async (ctx, {scanId}: {scanId: string}) => {
      // Cancel running discovery
    }
  }
});
```

### Phase 2: Port Tool Execution

**Key Change: Wrap in `ctx.run()`**

Before (Temporal activity):
```typescript
const devices = await runDiscoveryTool('subfinder', domain, 'EXTERNAL');
```

After (Restate durable step):
```typescript
const devices = await ctx.run('subfinder', () =>
  runDiscoveryTool('subfinder', domain, 'EXTERNAL')
);
```

**Security remains unchanged!**
```typescript
// Still using execFileAsync - no changes needed
await execFileAsync(findTool('subfinder'), ['-d', domain, '-active', '-ip', '-oJ']);
```

### Phase 3: State Management

**Option A: Virtual Object (per-scan state)**
```typescript
export const discoveryObject = restate.object({
  name: 'DiscoveryState',
  handlers: {
    discover: async (ctx, input) => {
      // State automatically persisted per object key (scanId)
      await ctx.set('phase', 'DISCOVERING');
      await ctx.set('devicesFound', devices.length);
    },
    getState: async (ctx) => {
      return {
        phase: await ctx.get('phase'),
        devicesFound: await ctx.get('devicesFound'),
        // ...
      };
    }
  }
});
```

**Option B: Service with external DB**
- Store state in your existing scan-recorder DB
- Simpler, consistent with current architecture

### Phase 4: Tool Configuration

**Timeouts:**
```typescript
// Temporal approach (activity policies)
const { runSubdomainDiscovery } = proxyActivities({
  startToCloseTimeout: '10 minutes'
});

// Restate approach (per-step timeout)
await ctx.run('subfinder', () => runDiscoveryTool(...))
  .orTimeout({ minutes: 2 });
```

---

## Testing Strategy

### Unit Tests (TDD)

**sec-27: Input Validation**
```typescript
describe('validateDiscoveryTarget', () => {
  it('should accept valid domains', () => {
    expect(validateDomain('example.com')).toBe(true);
    expect(validateDomain('sub.example.com')).toBe(true);
  });

  it('should reject shell metacharacters', () => {
    expect(() => validateDomain('ex;rm -rf /')).toThrow();
    expect(() => validateDomain('ex$(whoami)')).toThrow();
  });

  it('should reject invalid formats', () => {
    expect(() => validateDomain('')).toThrow();
    expect(() => validateDomain('a'.repeat(300))).toThrow();
  });
});
```

**sec-28: Tool Execution**
```typescript
describe('runDiscoveryTool', () => {
  it('should call execFile with correct arguments', async () => {
    const spy = vi.spyOn(childProcess, 'execFile');
    await runDiscoveryTool('subfinder', 'example.com', 'EXTERNAL');

    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('subfinder'),
      ['-d', 'example.com', '-active', '-ip', '-oJ'],
      expect.any(Object)
    );
  });

  it('should parse subfinder JSON output', async () => {
    const mockOutput = '{"host":"sub.example.com","ip":"1.2.3.4"}\n';
    // Mock execFile to return this output
    const devices = await runDiscoveryTool('subfinder', 'example.com', 'EXTERNAL');

    expect(devices).toHaveLength(1);
    expect(devices[0].hostname).toBe('sub.example.com');
    expect(devices[0].ipAddress).toBe('1.2.3.4');
  });
});
```

**sec-29: Integration Test**
```typescript
describe('Discovery Workflow (Restate)', () => {
  let restateTestEnvironment: RestateTestEnvironment;

  beforeAll(async () => {
    restateTestEnvironment = await RestateTestEnvironment.start(
      (server) => server.bind(discoveryService)
    );
  });

  it('should complete discovery workflow end-to-end', async () => {
    const client = restateIngress.serviceClient(discoveryService);

    const result = await client.discover({
      targets: [{type: 'DOMAIN', value: 'example.com', scope: 'EXTERNAL'}],
      tools: ['subfinder'],
      discoverSubdomains: true
    });

    expect(result.devices.length).toBeGreaterThan(0);
    expect(result.errors).toHaveLength(0);
  });
});
```

---

## Migration Checklist

### Prerequisites
- [x] Analyze Temporal workflow (this document)
- [x] Security audit (execFile already used ✅)
- [x] Test framework setup (Vitest + testcontainers)

### Implementation (TDD)
- [ ] Write input validation tests (sec-27)
- [ ] Write tool execution tests (sec-28)
- [ ] Write integration tests (sec-29)
- [ ] Create service skeleton (sec-20)
- [ ] Port tool execution logic (sec-21)
- [ ] Add input validation (sec-22)
- [ ] Implement state queries
- [ ] Add cancellation support
- [ ] Test locally (sec-23)

### Integration
- [ ] Update TanStack Start to call Restate (sec-24)
- [ ] Deploy to remote server (sec-25)
- [ ] Verify end-to-end (sec-18)

---

## Risk Assessment

### Low Risk
✅ **Security:** Already using secure patterns
✅ **Code reuse:** Most logic can be ported as-is
✅ **Testing:** Clear test strategy with existing fixtures

### Medium Risk
⚠️ **State queries:** Different mechanism than Temporal queries
⚠️ **Timeouts:** Need to map Temporal policies to Restate timeouts
⚠️ **Dev mode:** Ensure mock data still works

### Mitigation
- Run Temporal and Restate in parallel during migration
- Keep Temporal worker running for 1 month as fallback
- Test with real domains (scanme.nmap.org) before production

---

## Estimated Effort

| Task | Effort | Dependencies |
|------|--------|--------------|
| Write tests | 1-2 days | Test framework (done) |
| Port tool execution | 1 day | Tests written |
| Implement orchestration | 1 day | Tool execution done |
| Integration + testing | 1 day | All code complete |
| **Total** | **4-5 days** | Sequential |

---

## Conclusion

The Temporal discovery workflow is **well-structured and secure**. The migration to Restate is straightforward because:

1. ✅ Security patterns already in place (execFile, validation)
2. ✅ Database-agnostic design (returns results, no persistence)
3. ✅ Clear separation of concerns (workflow, tools, parsing)
4. ✅ Good test coverage opportunity (fixtures exist)

**Key insight:** The hard work (secure command execution, output parsing) is already done. We're just wrapping it in Restate's `ctx.run()` instead of Temporal activities.

**Next step:** Start with **sec-27** (write input validation tests) following TDD principles.

---

**Related Tasks:**
- sec-19: Analyze current discovery workflow ✅ (this document)
- sec-27: Write unit tests for discovery input validation
- sec-28: Write unit tests for subfinder execution
- sec-29: Write integration test for discovery workflow
- sec-20: Create discovery service skeleton in Restate
- sec-21: Port subfinder execution logic
- sec-22: Add input validation for discovery
