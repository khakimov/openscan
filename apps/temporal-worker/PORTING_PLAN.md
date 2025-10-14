# Porting Plan: Missing Components from Old Worker

## Investigation Summary

Investigated `/Users/nailert/Projects/current/automate/ui/my-app/apps/worker` to identify what needs to be ported to complete the database-free worker.

## Current Status

### ✅ Already Implemented (Database-Free)
- **Nmap Activity** (`src/workflows/portscan/activities.ts`) - Full complexity preserved:
  - Execution plans (DISCOVERY/EXTEND/UPTIME)
  - Retry logic for filtered ports
  - SNMP probing for authenticated scans
  - Result merging across attempts
  - Port argument building & compression
  - Dev mode support
- **XML Parser** (`src/workflows/portscan/xml-parser/`) - 19 passing tests
- **Basic Workflow** (`src/workflows/portscan/workflow.ts`) - Database-free orchestration
- **Security Fix** - Uses `execFile` (not `exec`) to prevent command injection

### ❌ Not Yet Implemented (Needs Porting)

#### 1. **Masscan Activity**
**File:** `activities/masscan.ts` (~440 lines)

**Purpose:** Fast TCP port scanning (pre-scan before nmap)

**Key Features:**
- Outputs JSON format
- Configurable scan rate (default 1000, 5x for aggressive)
- Feature flag controlled (`SCANNER_ENABLE_MASSCAN`)
- Policy-based execution (skips for UPTIME mode by default)
- Dev mode support (mock results)
- DNS resolution
- Port expression building from hints/seeds/historic

**Dependencies:**
- `masscan` binary
- `execFileWithHeartbeat` (needs porting from old worker)

**Output:** `PortScanResult[]` with `discoveredBy: ['masscan']`

---

#### 2. **Rustscan Activity**
**File:** `activities/rustscan.ts` (~534 lines)

**Purpose:** Fast port discovery using rustscan (alternative/supplement to masscan)

**Key Features:**
- Runs nmap internally with XML output (we can parse it!)
- Circuit breaker pattern (auto-disables after repeated failures)
- Concurrency limiter (max concurrent scans)
- Feature flag controlled (`SCANNER_ENABLE_RUSTSCAN`)
- Parses both XML and greppable output formats
- Can use masscan results as hints
- Dev mode support (uses fixture XML)

**Advanced Features:**
- **Circuit Breaker:** Tracks failures per target, opens circuit after threshold
- **Concurrency Control:** Limits parallel rustscan executions
- **Graceful Degradation:** Falls back to greppable output if XML fails

**Dependencies:**
- `rustscan` binary
- Circuit breaker class (needs porting)
- Concurrency limiter (needs porting)

**Output:** `PortScanResult[]` with `discoveredBy: ['rustscan', 'nmap']`

---

#### 3. **Prescan Stage Orchestration**
**File:** `stages/prescan-stage.ts` (~147 lines)

**Purpose:** Pure orchestration wrapper for running masscan + rustscan

**Key Design:**
- No Temporal runtime APIs (pure function)
- No state mutations (workflow manages state)
- Structured error handling (typed error codes)
- Sequential execution: masscan → rustscan (rustscan uses masscan results as hints)

**Interface:**
```typescript
interface PrescanStageInput {
  target: string;
  masscanConfig: PortScanConfig;
  rustscanConfigBuilder: (masscanPorts: PortScanResult[]) => PortScanConfig;
  shouldRunMasscan: boolean;
  shouldRunRustscan: boolean;
}

interface PrescanStageResult {
  masscanPorts: PortScanResult[];
  rustscanPorts: PortScanResult[];
  masscanError?: PrescanError;  // Typed errors, not strings
  rustscanError?: PrescanError;
}
```

**Error Handling:**
- Failures don't throw - returns typed errors
- Workflow decides how to handle failures
- Rethrows cancellations immediately

---

#### 4. **Port Merger Module**
**File:** `merge/port-merger.ts` (~209 lines)

**Purpose:** Combines prescan discoveries with nmap results

**Key Functions:**

**`combinePreScanPorts(...sources)`**
- Merges masscan + rustscan results
- Deduplicates by `protocol:port` key
- Combines `discoveredBy` arrays
- Preserves earliest `firstSeen`, latest `lastSeen`

**`deriveAdditionalPortsForNmap(prescanPorts, hints)`**
- Extracts port numbers from prescan results
- Adds explicit hints from input
- Returns sorted unique list for nmap to scan

**`mergePreScanDiscoveries(nmapResult, prescanPorts)`**
- Enriches nmap results with prescan attribution
- For ports found by both: combines `discoveredBy`, preserves nmap service details
- For ports only in prescan: adds supplemental entries to nmap result
- Ensures all discovered ports appear in final result

**`annotateNmapPorts(nmapResult)`**
- Adds `discoveredBy: ['nmap']` to all ports
- Sets `firstSeen` and `lastSeen` timestamps

---

#### 5. **Prescan Policy Module**
**File:** `prescan/policy.ts` (~157 lines)

**Purpose:** Determines when to run prescans based on mode and input

**Already Exists** in new worker but needs integration

**Key Logic:**
- `EXTEND` mode: Always run prescans
- `UPTIME` mode: Run if explicit port hints OR env flag set
- `DISCOVERY` mode: Run if explicit port hints OR env flag set
- Force flag: Always run if `SCANNER_FORCE_PRESCANS=true`

**Functions:**
- `shouldRunPrescan(input, tool)` - Policy decision
- `createMasscanConfig(input)` - Build masscan config from input
- `createRustscanConfig(input, masscanPorts)` - Build rustscan config (can use masscan results)
- `gatherHintPorts(input, masscanPorts, rustscanPorts)` - Collect all port hints

---

#### 6. **Input Normalizer**
**File:** `input/normalizer.ts` (~54 lines)

**Already Exists** in new worker (`src/workflows/portscan/input/normalizer.ts`) but NOT used by workflow

**Purpose:** Normalizes `PortScanInput` to `NormalizedPortScanInput`
- Handles both simple and rich input formats
- Sanitizes port lists
- Applies defaults for missing fields
- Validates and trims target

---

#### 7. **Supporting Utilities**

**Circuit Breaker** (`activities/guardrails.ts`)
- Tracks failures per key (e.g., `rustscan:target`)
- Opens circuit after threshold failures
- Auto-resets after cooldown period
- Used by rustscan to prevent repeated failures

**Concurrency Limiter** (`activities/guardrails.ts`)
- Limits concurrent executions (queue pattern)
- Used by rustscan to prevent resource exhaustion

**Heartbeat Helper** (`shared/activities/heartbeat-helpers.ts`)
- Wraps `execFile` with periodic heartbeats
- Prevents Temporal activity timeout during long scans
- Used by masscan, rustscan, nmap

---

## Workflow Integration Pattern (Old Worker)

```
1. Normalize input
   ↓
2. Determine mode (DISCOVERY/EXTEND/UPTIME)
   ↓
3. Build prescan configs
   ↓
4. Execute prescan stage:
   - Run masscan (if policy allows)
   - Run rustscan (if policy allows, uses masscan results as hints)
   - Collect errors (don't throw)
   ↓
5. Combine prescan results:
   - combinePreScanPorts(masscanPorts, rustscanPorts)
   - deriveAdditionalPortsForNmap(combinedPorts, hints)
   ↓
6. Execute nmap stage:
   - Pass additional ports from prescans
   - Nmap does detailed scanning on those ports
   ↓
7. Merge discoveries:
   - mergePreScanDiscoveries(nmapResult, prescanPorts)
   - Enriches nmap with prescan attribution
   ↓
8. Return results (database-free)
```

---

## Database-Free Adaptation Strategy

### What to Keep
✅ All scanning complexity (masscan, rustscan, nmap)
✅ Port merging logic
✅ Prescan policy
✅ Circuit breaker & concurrency control
✅ Heartbeat helper

### What to Remove
❌ `persistPortScanArtifact` calls
❌ `updateScanStatus`, `completeScan`, `failScan` calls
❌ Database imports
❌ `scanRunId`, `tenantId` requirements

### What to Adapt
🔄 **Activities:** Keep all scanning logic, remove database integration
🔄 **Workflow:** Return `PortScanResult` directly (not `PortScanState` with DB IDs)
🔄 **Error Handling:** Log errors but continue (graceful degradation)
🔄 **Observability:** Use logger (not database metrics)

---

## Implementation Priority

### Phase 1: Core Prescan Support (Minimal Viable)
1. Port heartbeat helper (`execFileWithHeartbeat`)
2. Port masscan activity (database-free)
3. Port prescan stage orchestration
4. Port port-merger module
5. Wire into workflow

**Result:** Basic prescan support (masscan → nmap)

### Phase 2: Advanced Features
6. Port rustscan activity
7. Port circuit breaker & concurrency limiter
8. Integrate rustscan into prescan stage

**Result:** Full prescan support (masscan + rustscan → nmap)

### Phase 3: Polish
9. Use input normalizer in workflow
10. Add comprehensive prescan tests
11. Update documentation

**Result:** Production-ready prescan workflow

---

## Estimated Complexity

**Lines of Code to Port:** ~1400 lines
- Masscan: 440 lines
- Rustscan: 534 lines
- Prescan stage: 147 lines
- Port merger: 209 lines
- Guardrails (circuit breaker + limiter): ~150 lines
- Heartbeat helper: ~100 lines

**Test Coverage Needed:**
- Masscan activity tests (policy, parsing, dev mode)
- Rustscan activity tests (circuit breaker, fallback parsing)
- Prescan stage tests (error handling, sequential execution)
- Port merger tests (deduplication, attribution)
- Integration tests (full workflow with prescans)

**Dependencies:**
- `masscan` binary (production)
- `rustscan` binary (production)
- No new npm packages needed

---

## Risk Assessment

**Low Risk:**
- Port merger (pure functions, no I/O)
- Prescan stage (pure orchestration)
- Circuit breaker (in-memory state)

**Medium Risk:**
- Masscan activity (binary execution, JSON parsing)
- Heartbeat helper (Temporal integration)

**Higher Risk:**
- Rustscan activity (complex: circuit breaker + XML/greppable parsing + concurrency control)

**Mitigation:**
- Incremental porting with tests at each step
- Dev mode support from day one (mock data)
- Feature flags for gradual rollout
- Preserve old worker for comparison testing

---

## Next Steps

1. **Decision:** Do we want full prescan support, or is nmap-only sufficient?
2. **If yes to prescans:** Start with Phase 1 (masscan + basic integration)
3. **Testing strategy:** Use old worker fixtures for comparison
4. **Documentation:** Update architecture docs to match implementation

---

## Questions for User

1. Is masscan/rustscan support required, or is nmap-only acceptable for your use case?
2. If prescans are needed, should we implement masscan first (simpler) or rustscan (more complex but more useful)?
3. Do we need circuit breaker/concurrency control, or can we simplify?
4. Should we maintain feature flag compatibility with old worker?
