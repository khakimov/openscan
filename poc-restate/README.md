# Restate PoC - Port Scanner

Proof of concept to evaluate Restate as a replacement for Temporal in the security scanning platform.

## Features Being Tested

- ✅ **Durable execution** - Multi-step workflows that survive failures
- ✅ **State management** - Track scan progress during execution
- ✅ **Long-running workflows** - Simulated delays with `ctx.sleep()`
- 🔄 **Cancellation** - Equivalent to Temporal signals
- 🔄 **State queries** - Check progress while scan is running
- ⏳ **Scheduled scans** - Recurring workflows (to be tested)

## Quick Start

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Start Local Development Server

```bash
pnpm dev
```

This starts Wrangler on port 9080.

### 3. Register Service with Restate

In a separate terminal:

```bash
# Option A: Use local Restate server (if running)
pnpm register

# Option B: Use Restate Cloud (free tier)
# Sign up at https://cloud.restate.dev
# Then register with cloud endpoint
npx @restatedev/restate deployments register \
  --admin-url <YOUR_RESTATE_CLOUD_ADMIN_URL> \
  http://localhost:9080
```

### 4. Test the Service

#### Start a port scan:

```bash
curl -X POST http://localhost:8080/PortScanner/scan \
  -H "Content-Type: application/json" \
  -d '{
    "target": "example.com",
    "protocol": "tcp",
    "aggressive": false
  }'
```

#### Check scan progress:

```bash
curl -X POST http://localhost:8080/PortScanner/getState \
  -H "Content-Type: application/json" \
  -d '{"scanId": "<SCAN_ID_FROM_ABOVE>"}'
```

#### Cancel a running scan:

```bash
curl -X POST http://localhost:8080/PortScanner/cancel \
  -H "Content-Type: application/json" \
  -d '{
    "scanId": "<SCAN_ID>",
    "reason": "Testing cancellation"
  }'
```

## Deploy to Cloudflare Workers

```bash
pnpm deploy
```

After deployment, register with Restate Cloud:

```bash
npx @restatedev/restate deployments register \
  --admin-url <YOUR_RESTATE_CLOUD_ADMIN_URL> \
  https://<VERSION>-restate-poc-port-scanner.<SUBDOMAIN>.workers.dev
```

## Key Observations

### Advantages over Temporal

1. **Native Cloudflare Workers support** - No HTTP wrapper needed
2. **Simpler code** - Services instead of separate workflows/activities
3. **Built-in state** - Less DB code for tracking progress
4. **Lighter runtime** - No heavy gRPC dependencies

### Questions to Answer

1. **Cancellation** - How to properly cancel running workflows?
2. **Scheduled scans** - Does Restate support cron/recurring workflows?
3. **State queries** - Can we query state while workflow is running?
4. **Migration effort** - How much code needs rewriting?

## Next Steps

- [ ] Test on Restate Cloud (free tier)
- [ ] Verify all features work
- [ ] Performance comparison with Temporal
- [ ] Estimate migration effort
- [ ] Decision: Migrate or stay with Temporal?
