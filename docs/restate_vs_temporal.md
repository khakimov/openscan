# Restate vs Temporal: A Head of Engineering Perspective

**Last Updated:** January 2025
**Author:** Technical evaluation for security scanning platform
**Context:** Migrating from Temporal to evaluate alternatives

---

## Executive Summary

After building a working PoC with both systems, here's the unvarnished truth:

- **Temporal** is the safe, boring choice. It works, it scales, but it's operationally heavy and expensive.
- **Restate** is the exciting new option. Simpler, cheaper, better DX, but young and risky.

**TL;DR:** If you're Netflix, use Temporal. If you're a startup that values velocity over battle-testing, Restate is compelling.

---

## 1. Maturity & Production Risk

### Temporal
✅ **Pros:**
- Been in production since 2019 (evolved from Uber's Cadence)
- Powers **Netflix, Stripe, Snap, Datadog, Coinbase** at massive scale
- 8,000+ GitHub stars, large community
- Well-funded, sustainable business model
- Years of bug fixes and edge case handling

❌ **Cons:**
- Older architecture shows its age
- Some technical debt from Cadence heritage
- Enterprise pricing can be steep

**Production Risk:** ⭐⭐⭐⭐⭐ (Very Low)

### Restate
✅ **Pros:**
- v1.5.2 (Oct 2025) - actively developed
- Built by Apache Flink creators (proven track record)
- Used by **21bitcoin, KPMG UK, Dodo Payments** in production
- Modern architecture, no legacy baggage
- $7M seed funding, sustainable runway

❌ **Cons:**
- Only ~1 year in production (v1.0 likely late 2024)
- 3,000 GitHub stars (smaller community)
- Fewer battle scars = fewer edge cases discovered
- No public post-mortems (could mean no major incidents, or not enough transparency)
- Young enough that the company could pivot or fail

**Production Risk:** ⭐⭐⭐☆☆ (Medium)

**Verdict:** Temporal wins on maturity, but Restate isn't some side project—it's backed, has real customers, and the team knows what they're doing. For our scale (not Netflix), Restate's maturity is likely sufficient.

---

## 2. Feature Completeness

### Critical Features Comparison

| Feature | Temporal | Restate | Impact |
|---------|----------|---------|--------|
| **Durable Execution** | ✅ Excellent | ✅ Excellent | Both solve the core problem |
| **Workflow Versioning** | ✅ Native, sophisticated | ✅ Deployment-based | Temporal's is more mature |
| **Cron/Scheduling** | ✅ Native (`schedule.create()`) | ⚠️ Pattern-based with guide | Different approach, workable |
| **Signals** | ✅ Full support | ⚠️ Use regular handlers | Different model, workable |
| **Queries** | ✅ During execution | ✅ Via shared context | Both work |
| **Cancellation** | ✅ Signals + cancel API | ✅ TerminalError + Saga | Both support compensation |
| **Observability** | ✅ Temporal UI, strong | ✅ OpenTelemetry native | Restate's is more modern |
| **Testing** | ✅ Mature test framework | ✅ Basic unit testing | Temporal more complete |

### The Scheduling Story

Our platform needs:
- Recurring port scans (hourly, daily, weekly)
- Device-specific scan schedules
- Cron-like reliability

**Temporal:** Built-in `client.schedule.create()` with full cron support.
```typescript
// Temporal: Native scheduling
await client.schedule.create({
  scheduleId: 'hourly-scan',
  spec: { intervals: [{ every: '1h' }] },
  action: { type: 'startWorkflow', workflowType: 'portscan', args: [...] }
});
```

**Restate:** Pattern-based scheduling using durable timers + delayed messages (with [official guide](https://docs.restate.dev/guides/cron)).
```typescript
// Restate: Pattern-based scheduling
const scheduler = restate.object({
  name: "ScanScheduler",
  handlers: {
    schedule: async (ctx, { deviceId, interval }) => {
      // Run the scan
      await ctx.run('scan', () => runScan(deviceId));

      // Schedule next execution using delayed message
      ctx.objectSendClient(ScanScheduler, deviceId)
        .schedule({ deviceId, interval })
        .delay({ hours: interval });
    }
  }
});
```

**Key Differences:**

| Aspect | Temporal | Restate |
|--------|----------|---------|
| **API** | Declarative (schedule spec) | Imperative (loop + delay) |
| **Implementation** | Built-in server feature | User-space pattern |
| **Complexity** | 10 LOC | ~50 LOC with edge cases |
| **Flexibility** | Cron expressions | Full programmatic control |
| **Updates** | Update schedule spec | Cancel + reschedule |

**Analysis:**
- Restate's approach is more **flexible** (arbitrary logic in scheduler)
- Temporal's is more **convenient** (less code, cron syntax)
- Both are **durable** and **reliable** (survive failures)
- Restate requires ~50-100 LOC vs Temporal's 10 LOC
- **Development time:** ~1-3 days for Restate pattern vs immediate with Temporal

**Risk:** Low-Medium. Restate provides:
- ✅ Durable timers (sleep for months/years)
- ✅ Delayed messages (schedule future invocations)
- ✅ Official cron guide with patterns
- ✅ Virtual Objects (one scheduler per device)

The implementation is well-documented and tested by other users. It's not "DIY" in the scary sense—it's using provided primitives with a proven pattern.

**Verdict:** Temporal is more convenient, but Restate's pattern-based approach is **fully capable** and arguably more flexible. The extra dev time (1-3 days) is acceptable. **This is no longer a critical gap—just a different approach.**

---

## 3. Developer Experience

### Temporal
✅ **Pros:**
- Mature SDKs (TypeScript, Java, Python, Go)
- Extensive examples and tutorials
- Large community = easy to find answers
- Temporal UI is feature-rich

❌ **Cons:**
- **Steep learning curve:** Workflow/activity split, determinism constraints
- Doesn't work in Cloudflare Workers (needed HTTP wrapper hack)
- Heavy boilerplate (see 200+ LOC to start a workflow)
- Local dev requires Docker Compose with 5+ services

**Code Example (Temporal):**
```typescript
// Temporal: Workflow definition
export async function portscanWorkflow(input: ScannerInput) {
  // Must be deterministic, no Date.now(), no random IDs
  const scanId = uuid(); // Uses workflow.uuid4() internally

  // Activities must be declared separately
  const { nmapResult } = await proxyActivities<Activities>({
    startToCloseTimeout: '5m'
  }).runNmap(input);

  // More boilerplate...
}

// Temporal: Activity definition (separate file)
export async function runNmap(input: ScannerInput) {
  // Actual nmap execution here
}

// Temporal: Client to start workflow (200 LOC HTTP wrapper)
const client = await getTemporalClient();
const handle = await client.workflow.start('portscanWorkflow', {
  taskQueue: 'security-scans',
  workflowId: generateId(),
  args: [input],
  // 10 more config options...
});
```

### Restate
✅ **Pros:**
- **Simple mental model:** Just services and handlers
- Native Cloudflare Workers support (no HTTP wrapper)
- Local dev is a single binary (no Docker)
- Less boilerplate, more like regular async code
- Modern DX (OpenTelemetry, TypeScript-first)

❌ **Cons:**
- Smaller community = fewer Stack Overflow answers
- Less mature SDKs (missing some convenience methods)
- Fewer examples in the wild
- CLI is simpler but less feature-rich

**Code Example (Restate):**
```typescript
// Restate: Everything in one place
export const portScanner = restate.service({
  name: 'PortScanner',
  handlers: {
    scan: async (ctx, input: ScanInput) => {
      const scanId = ctx.rand.uuidv4(); // Built-in deterministic random

      // Just use ctx.run() for durability - no separate "activities"
      const nmapResult = await ctx.run('nmap', () => runNmap(input));
      const parsed = await ctx.run('parse', () => parseXml(nmapResult));

      return { scanId, ports: parsed };
    }
  }
});

// That's it. No separate activity definitions.
// No complex client setup. Just works.
```

**Verdict:** Restate has significantly better DX. The code is cleaner, easier to understand, and faster to iterate on. For a team that values velocity, this is a big win.

---

## 4. Operational Burden

### Temporal
❌ **Infrastructure Requirements:**
- PostgreSQL or Cassandra (for workflow state)
- Elasticsearch (for visibility/search)
- Temporal server (multiple services)
- Worker nodes (your code)
- Load balancer

**Operational Complexity:** High
- Need a DBA for database tuning
- Elasticsearch cluster management
- Version upgrades are risky (database migrations)
- Monitoring multiple services
- Complex disaster recovery

**Cloud Option:** Temporal Cloud exists but is expensive ($thousands/month for non-trivial usage).

### Restate
✅ **Infrastructure Requirements:**
- Restate server (single binary, no external DB initially)
- Worker nodes (your code)
- That's it.

**Operational Complexity:** Low
- Single binary with embedded storage
- For HA: add more nodes (simple clustering)
- Kubernetes operator available
- Upgrades are straightforward (semantic versioning)
- Snapshots to S3/object storage

**Cloud Option:** Restate Cloud has a generous free tier, then reasonable pricing.

**Verdict:** Restate is dramatically simpler to operate. If you're a small team (< 5 engineers), this is a massive win. Temporal's operational burden will consume 20-30% of one engineer's time.

---

## 5. Cost Analysis

### Temporal
**Self-Hosted:**
- Database: $200-500/mo (RDS PostgreSQL)
- Elasticsearch: $300-600/mo
- Temporal Server: $100-200/mo (compute)
- Worker nodes: $200-400/mo
- **Total: ~$800-1,700/month** (assuming moderate scale)

**Temporal Cloud:**
- Starts at $200/mo for basic tier
- Scales to $2,000-10,000/mo for production workloads
- Expensive but fully managed

### Restate
**Self-Hosted:**
- Restate server: $100-200/mo (single node, or 2-3 for HA)
- Worker nodes: $200-400/mo
- **Total: ~$300-600/month**

**Restate Cloud:**
- Free tier: 1M executions/month, 10GB storage
- Paid: $25/mo per 1M additional executions
- Way cheaper than Temporal Cloud

**Verdict:** Restate is 50-70% cheaper. For a bootstrapped startup, this matters.

---

## 6. Ecosystem & Community

### Temporal
✅ **Strengths:**
- 8,000+ GitHub stars
- Large Slack/Discord community
- Tons of blog posts, talks, examples
- Integrations with everything (AWS, GCP, k8s, etc.)
- Third-party tools (UI extensions, monitoring plugins)

### Restate
⚠️ **Strengths:**
- 3,000 GitHub stars (growing fast)
- Active Discord/Slack
- Good official docs (overhauled in v1.5)
- Team is responsive

❌ **Weaknesses:**
- Fewer examples in the wild
- Smaller integration ecosystem
- Fewer third-party tools
- Stack Overflow has way fewer Restate questions

**Verdict:** Temporal's ecosystem is 3-4x larger. When you hit a weird bug, you're more likely to find the answer with Temporal. This is real developer productivity loss with Restate.

---

## 7. Vendor Lock-In & Exit Strategy

### Temporal
✅ **Low Lock-In:**
- Can self-host forever (open source)
- Temporal Cloud uses standard protocol
- Migration to self-hosted is documented
- Could theoretically fork if company fails

❌ **But:**
- Migrating away from Temporal (to another system) is still hard
- Workflows are tightly coupled to Temporal SDK

### Restate
⚠️ **Medium Lock-In:**
- Can self-host (open source)
- But VC-backed means risk if company pivots/fails
- Smaller company = higher existential risk
- Migration path to Temporal or others would be manual

**Verdict:** Both have some lock-in (workflow orchestration is inherently sticky). Temporal feels safer because it's more established, but Restate being open source mitigates most of the risk.

---

## 8. Real-World Constraints

### Our Security Scanning Platform

**Current State:**
- TanStack Start on Cloudflare Workers
- Port scanning with nmap/masscan/rustscan
- Discovery workflows
- Device scanning schedules
- ~1,000 scans/day initially, growing to 100K+/day

**Temporal Fit:**
✅ Scheduling built-in (critical for recurring scans)
✅ Battle-tested at scale
❌ Cloudflare Workers incompatibility (had to build HTTP wrapper)
❌ Heavy operational burden for small team
❌ Expensive at scale

**Restate Fit:**
✅ Native Cloudflare Workers support (no HTTP wrapper!)
✅ Simpler ops (single binary)
✅ Cheaper
✅ Better DX (faster iteration)
⚠️ Pattern-based scheduling (vs native, ~1-3 days extra dev)
❌ Less mature (higher risk)

---

## 9. Decision Framework

### Choose Temporal If:
- You're at **massive scale** (1M+ workflows/day) and need battle-tested performance
- You have **dedicated ops capacity** (full-time DevOps engineer)
- You're **extremely risk-averse** (enterprise, can't tolerate any instability)
- You're in a **highly regulated industry** (finance, healthcare) requiring maximum stability
- You prefer **declarative cron** over pattern-based scheduling (10 LOC vs 50 LOC)
- **Budget isn't a concern** ($2K-10K/mo is fine)
- You need **extensive ecosystem** (integrations, third-party tools)

### Choose Restate If:
- You value **developer velocity** and fast iteration
- You're a **small/medium team** (< 10 engineers, no dedicated ops)
- **Cost matters significantly** (bootstrapped, limited runway)
- You want **modern DX** (better TypeScript, less boilerplate, simpler ops)
- You're comfortable with **pattern-based scheduling** (durable timers + delayed messages)
- You're willing to **accept medium risk** for significant upside
- You need **Cloudflare Workers** compatibility (no HTTP wrapper hacks)
- You prefer **simpler operations** (single binary vs 5+ services)

---

## 10. Our Recommendation

### For This Project: **Restate** (with caveats)

**Why Restate:**
1. **Native Cloudflare Workers support** eliminates our HTTP wrapper hack
2. **Simpler operations** for our 2-person team
3. **50-70% cost savings** matters at our stage
4. **Better DX** = faster iteration on features
5. **Pattern-based scheduling** is fully capable (durable timers + official guide)

**Risk Mitigation:**
1. **Keep Temporal knowledge** (don't burn bridges)
2. **Abstract the orchestration layer** (dependency injection, easy to swap)
3. **Monitor Restate closely** (set up alerts, have rollback plan)
4. **Implement scheduler using official patterns** (follow Restate's cron guide)
5. **Revisit in 12 months** (if Restate shows instability, migrate back to Temporal)

**When We'd Switch to Temporal:**
- Restate has multiple outages (instability)
- Pattern-based scheduling proves inadequate (edge cases, maintenance burden)
- We scale to 1M+ workflows/day (need proven performance)
- We raise funding (budget no longer tight)
- Team grows to 10+ engineers (can afford ops burden)

---

## 11. Migration Path

### Temporal → Restate (Current Plan)
**Effort:** ~2-3 weeks for 2 engineers

**Steps:**
1. ✅ Set up Restate Cloud + tunnel
2. ✅ Build PoC port scanner service
3. ⏳ Migrate XML parser from Temporal worker
4. ⏳ Add discovery workflow
5. ⏳ Update TanStack Start to call Restate (remove HTTP wrapper)
6. ⏳ Implement pattern-based scheduler (following official guide, ~1-3 days)
7. ⏳ Run both in parallel for 1 week (gradual cutover)
8. ⏳ Deprecate Temporal

**Rollback Plan:**
- Keep Temporal infra running for 1 month
- Abstract orchestrator interface (easy to swap back)
- If critical issues, route traffic back to Temporal

### Restate → Temporal (If Needed)
**Effort:** ~3 weeks (harder direction)

Would require:
- Rewrite services as workflows + activities
- Set up Temporal infra (DB, Elasticsearch, etc.)
- Migrate in-flight workflows (painful)
- Test extensively

---

## 12. Conclusion

**The honest truth:**

- **Temporal is the "right" choice** if you want to sleep at night and have infinite budget.
- **Restate is the "smart" choice** for a startup that values velocity, simplicity, and cost.

We're choosing Restate because:
1. Our team is small (ops burden matters)
2. Our budget is limited (50% cost savings is real)
3. We value fast iteration (better DX wins)
4. We can tolerate some risk (we're not Netflix)
5. Cloudflare Workers compatibility is a big win

**But:** We're not burning bridges. If Restate doesn't work out in 6-12 months, we can migrate to Temporal. The abstraction layer makes this feasible.

**Final Take:** For most **startups building in 2025**, Restate is the better choice. For **enterprises with deep pockets and low risk tolerance**, stick with Temporal.

---

## Appendix: Quick Metrics

| Metric | Temporal | Restate | Winner |
|--------|----------|---------|--------|
| **GitHub Stars** | 8,000+ | 3,000+ | Temporal |
| **Years in Production** | 6+ years | 1 year | Temporal |
| **Community Size** | Large | Small | Temporal |
| **Operational Complexity** | High | Low | Restate |
| **Cost (Self-Hosted)** | $800-1,700/mo | $300-600/mo | Restate |
| **Developer Experience** | Complex | Simple | Restate |
| **Native Scheduling** | ✅ Yes | ⚠️ Pattern-based | Temporal |
| **Cloudflare Workers** | ❌ No | ✅ Yes | Restate |
| **Production Risk** | Very Low | Medium | Temporal |
| **Team Experience** | Uber alumni | Apache Flink creators | Tie |

**Overall Score:** Temporal 6/10 metrics, Restate 4/10 metrics. But the metrics that matter most for us (cost, DX, ops burden) favor Restate.

---

**Document Version:** 1.0
**Last Review:** January 2025
**Next Review:** July 2025 (after 6 months of Restate in production)
