# AGENTS.md - Restate Worker

This file provides guidance to AI agents when working with the Restate worker for durable security workflows.

## Overview

This is a **Restate worker** that replaces our previous Temporal implementation. It handles long-running security scanning tasks:
- **Port scanning** (nmap/masscan/rustscan)
- **Discovery workflows** (subdomain/host discovery via subfinder, amass, assetfinder)
- **Durable execution** of security tools with automatic retries

## Architecture

```
TanStack Start App (Cloudflare/Node.js)
    ↓ HTTP POST
Restate Cloud Ingress (https://xxx.env.us.restate.cloud)
    ↓ Routes to registered worker
Restate Worker (this app, Node.js on server)
    ↓ Executes durable workflows
Security Tools (nmap, subfinder, etc.)
    ↓ Results
Worker POSTs back to app
    ↓ Persisted to database
```

## Key Restate Concepts

### 1. Services vs Virtual Objects

We use **services** (not virtual objects) because:
- Each scan is independent (no shared state between scans)
- Simple request/response pattern
- State is temporary (just for polling during execution)

```typescript
export const discoveryService = restate.service({
  name: 'Discovery',
  handlers: {
    discover: async (ctx, input) => { /* ... */ },
    getState: async (ctx, input) => { /* ... */ },
  },
});
```

### 2. Durable Execution with `ctx.run()`

**Critical Pattern**: Every step that calls external tools MUST use `ctx.run()` for durability:

```typescript
// ✅ CORRECT - Durable, will retry on failure
const devices = await ctx.run('discover-domain', async () => {
  return await runDiscoveryTool('subfinder', domain, scope);
});

// ❌ WRONG - Not durable, will fail permanently on errors
const devices = await runDiscoveryTool('subfinder', domain, scope);
```

**Rule**: Wrap any non-deterministic operation (I/O, external calls, tool execution) in `ctx.run()`.

### 3. State Management Pattern

For workflows that need progress polling, use in-memory state store:

```typescript
// In-memory state (simple, works for single-worker deployments)
const stateStore = new Map<string, DiscoveryState>();

// Store state during execution
interface DiscoveryState {
  phase: 'VALIDATING' | 'DISCOVERING' | 'COMPLETED' | 'FAILED';
  processedTargets: number;
  devicesFound: number;
  devices?: any[]; // ⚠️ IMPORTANT: Include full results, not just counts!
  errors: string[];
  startedAt: string;
  completedAt?: string;
}

// Update state as workflow progresses
state.phase = 'DISCOVERING';
stateStore.set(scanId, state);

// Provide getState handler for polling
getState: async (_ctx, input: { scanId: string }) => {
  return stateStore.get(input.scanId);
}
```

**Key Lesson**: Store the FULL results in state, not just counts. Clients will poll `getState` to retrieve results after completion.

### 4. Service Registration

Services are discovered automatically when you register the worker endpoint:

```bash
# Register with local Restate (development)
npx @restatedev/restate deployments register http://localhost:9080

# Register with Restate Cloud (production via tunnel)
npx @restatedev/restate deployments register \
  https://tunnel.us.restate.cloud:9080/YOUR_ENV_ID/worker-tunnel/http/localhost/9080 \
  --force
```

**Important**: All service files MUST be committed to git before deployment. Untracked files won't exist on the server!

## Development Workflow

### Local Development

1. **Start Restate locally** (Docker):
   ```bash
   docker run -d --name restate -p 8080:8080 -p 9070:9070 restatedev/restate:latest
   ```

2. **Start worker in watch mode**:
   ```bash
   pnpm dev  # Uses tsx watch for hot reload
   ```

3. **Register worker** (only needed once, or after adding new services):
   ```bash
   npx @restatedev/restate deployments register http://localhost:9080
   ```

4. **Verify registration**:
   ```bash
   npx @restatedev/restate services list
   # Should show: PortScanner, Discovery, Httpx, DeviceScanner, HostingEnrichment
   ```

### Production Deployment (Restate Cloud with Tunnel)

**IMPORTANT**: We use Restate Cloud with a secure tunnel. Never expose worker directly to internet.

**CRITICAL**: The server must always run the `main` branch. Feature branches get merged to main first, then deployed.

#### Step-by-step deployment:

1. **Ensure changes are on `main`**:
   ```bash
   # On your local machine - merge/PR feature branch into main first
   git checkout main
   git pull origin main
   ```

2. **SSH to server and update**:
   ```bash
   ssh your-server
   cd ~/openscan

   # Switch to main (server may be on an old feature branch)
   git checkout main
   git pull origin main
   ```

3. **Build workspace dependencies** (required after pulling new code):
   ```bash
   # From monorepo root ~/openscan (NOT from apps/restate-worker)
   cd ~/openscan
   pnpm install
   pnpm run build:data-ops
   ```

   **Why**: The worker imports `@repo/data-ops`, `@repo/contracts`, and `@repo/logger` as workspace packages. `data-ops` must be compiled (TypeScript → JavaScript) before the worker can start. Without this step, you'll get `ERR_MODULE_NOT_FOUND: Cannot find package '@repo/data-ops'`.

4. **Start or restart the worker**:
   ```bash
   # Using monorepo script (preferred)
   cd ~/openscan
   pnpm run dev:worker

   # OR with pm2
   pm2 restart restate-worker

   # OR directly from worker dir
   cd ~/openscan/apps/restate-worker
   pnpm dev
   ```

   **Verify worker started**: Look for log output showing all services:
   ```
   {"services": ["PortScanner", "Discovery", "Httpx", "DeviceScanner", "HostingEnrichment"]}
   ```

5. **Restart tunnel** (if not already running):
   ```bash
   # Check if tunnel is running
   docker ps | grep restate-tunnel

   # If not running, start it:
   cd ~/openscan/apps/restate-worker
   docker run \
     --env-file tunnel.env \
     --network=host \
     --restart unless-stopped \
     -d \
     --name restate-tunnel \
     ghcr.io/restatedev/restate-cloud-tunnel-client:latest

   # Verify tunnel is connected
   docker logs -f restate-tunnel
   ```

6. **Re-register with Restate Cloud** (required when services change):

   **CRITICAL**: The worker must be running and reachable on port 9080 before registering.

   ```bash
   # Get tunnel name from tunnel.env
   cat ~/openscan/apps/restate-worker/tunnel.env | grep TUNNEL_NAME

   # Register (replace tunnel name if different from prod-tunnel)
   npx @restatedev/restate deployments register \
     https://tunnel.us.restate.cloud:9080/201k7hktgm99xk9cb3f5btv7x9w/prod-tunnel/http/localhost/9080 \
     --force
   ```

   **URL Format Breakdown**:
   - `tunnel.us.restate.cloud:9080` - Tunnel endpoint (region from tunnel.env)
   - `201k7hktgm99xk9cb3f5btv7x9w` - Environment ID without `env_` prefix
   - `prod-tunnel` - Tunnel name from `RESTATE_TUNNEL_NAME` in tunnel.env
   - `http://localhost/9080` - Worker endpoint (as seen from tunnel container)

7. **Verify registration**:
   ```bash
   npx @restatedev/restate services list
   # Should show: PortScanner, Discovery, Httpx, DeviceScanner, HostingEnrichment
   ```

#### Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `ERR_MODULE_NOT_FOUND: @repo/data-ops` | Workspace deps not built | Run `pnpm run build:data-ops` from monorepo root |
| `502 Bad Gateway` during registration | Worker not running on port 9080 | Start worker first, verify with `ss -tlnp \| grep 9080` |
| `Tunnel not found` | Wrong tunnel name | Check `RESTATE_TUNNEL_NAME` in tunnel.env |
| `Connection refused` | Worker crashed | Check `pm2 logs` or terminal output for errors |
| `Service mismatch` in deployment-checker | Registered services don't match code | Re-register with `--force` |
| `Bad status code 403` | Wrong environment ID | Check env ID doesn't have `env_` prefix |

#### Quick Reference (copy-paste for common redeploy)

```bash
# Full redeploy from scratch on server:
cd ~/openscan
git checkout main && git pull origin main
pnpm install
pnpm run build:data-ops
pnpm run dev:worker &
# Wait for "Restate worker started" log, then:
npx @restatedev/restate deployments register \
  https://tunnel.us.restate.cloud:9080/201k7hktgm99xk9cb3f5btv7x9w/prod-tunnel/http/localhost/9080 \
  --force
npx @restatedev/restate services list
```

## Common Gotchas & Fixes

### 1. Service Not Found (403/404 errors)

**Symptom**: `{"message":"service 'Discovery' not found"}`

**Causes**:
- Service files not committed to git (untracked)
- Worker not restarted after code changes
- Deployment not re-registered with Restate

**Fix**:
```bash
# Check for untracked files
git status

# Commit everything
git add apps/restate-worker/src/*.ts
git commit -m "fix: add missing service files"

# Pull and restart on server
git pull && pkill -f "tsx watch" && pnpm dev

# Re-register
npx @restatedev/restate deployments register <URL> --force
```

### 2. Tools Not Found / Unknown Tool Errors

**Symptom**: `"Unknown discovery tool: assetfinder"`

**Cause**: Default tools array doesn't match what's enabled in the tool runner.

**Fix**: Keep tool arrays in sync across these files:
- `apps/restate-worker/src/discovery-service.ts` (line ~81)
- `apps/user-application/src/server/discovery/services/workflow-orchestrator-restate.ts` (line ~38)

```typescript
// Both should have identical arrays
const tools = input.tools || ['subfinder']; // Only what's actually installed
```

### 3. Results Show 0 Items Despite Successful Discovery

**Symptom**: State shows `devicesFound: 41` but UI shows 0 subdomains.

**Cause**: `getState` returns only counts/metadata, not the actual devices array.

**Fix**: Store full results in state:
```typescript
// ✅ CORRECT - Store devices in state
state.devices = serializedDevices;
stateStore.set(scanId, state);

// ❌ WRONG - Only store count
state.devicesFound = devices.length;
```

### 4. Hardcoded Service Names in Logs

**Symptom**: Logs always show same services even when some fail to load.

**Fix**: Dynamically check which services actually loaded:
```typescript
// ✅ CORRECT
const registeredServices = [];
if (portScanner) registeredServices.push('PortScanner');
if (discoveryService) registeredServices.push('Discovery');
logger.info('Started', { services: registeredServices });

// ❌ WRONG
logger.info('Started', { services: ['PortScanner', 'Discovery'] });
```

### 5. Authentication Issues with Restate Cloud

**Symptom**: `401 Unauthenticated`

**Fix**: Restate Cloud uses Bearer token authentication:
```typescript
const headers: HeadersInit = {
  'Content-Type': 'application/json',
};

if (this.apiKey) {
  headers['Authorization'] = `Bearer ${this.apiKey}`;
  headers['x-restate-server-key'] = this.apiKey; // Fallback
}
```

Set `RESTATE_API_KEY` environment variable (get from Restate Cloud dashboard).

## Environment Variables

Required environment variables (see `.env.example`):

```bash
# Server Configuration
RESTATE_PORT=9080                    # Port worker listens on
RESTATE_IDENTITY_KEYS=publickeyv1_...  # Optional: Restate Cloud identity verification

# Postback Authentication
WORKER_API_KEY=<secret>              # Shared secret for postback auth (user-app validates this)

# Optional: Restate Cloud
RESTATE_INGRESS_URL=https://xxx.env.us.restate.cloud  # Cloud ingress (no :8080 port!)
RESTATE_API_KEY=<api-key>            # API key from Restate Cloud dashboard
```

**Security Notes**:
- `WORKER_API_KEY` must match between worker and user-application
- Generate with: `openssl rand -base64 32`
- Rotate every 90 days
- Use secrets manager in production (AWS Secrets Manager, HashiCorp Vault, etc.)

## Tool Installation

Required security tools on the server:

### Subfinder (required)
```bash
go install -v github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest
```

### Assetfinder (optional)
```bash
go install github.com/tomnomnom/assetfinder@latest
```

### Amass (optional, slow but thorough)
```bash
go install -v github.com/owasp-amass/amass/v4/...@master
```

### Nmap (required for port scanning)
```bash
# Ubuntu/Debian
sudo apt install nmap

# macOS
brew install nmap
```

**Tool Path Resolution**: The worker checks:
1. `$PATH` environment variable
2. `$HOME/go/bin/` (standard Go install location)
3. `/usr/local/go/bin/`

## Testing

### Test Discovery Service Directly

```bash
# Test with curl
curl -X POST http://localhost:8080/Discovery/discover \
  -H "Content-Type: application/json" \
  -d '{
    "targets": [
      {
        "type": "DOMAIN",
        "value": "example.com",
        "scope": "EXTERNAL"
      }
    ],
    "tools": ["subfinder"],
    "scanId": "test-scan-1"
  }'

# Check state
curl -X POST http://localhost:8080/Discovery/getState \
  -H "Content-Type: application/json" \
  -d '{"scanId": "test-scan-1"}'
```

### Test Port Scanner

```bash
curl -X POST http://localhost:8080/PortScanner/scan \
  -H "Content-Type: application/json" \
  -d '{
    "target": "scanme.nmap.org",
    "ports": "80,443,22",
    "protocol": "tcp"
  }'
```

## Security Considerations

### 1. Input Validation

**Always validate inputs** before passing to shell commands:

```typescript
// ✅ CORRECT - Validate before execution
validateDiscoveryTarget(target.value, target.type);
const devices = await runDiscoveryTool(tool, target.value, scope);

// validation.ts blocks:
// - Shell metacharacters: ; & | $ ` \ ! # * ? ' "
// - Path traversal: ../ ../
// - Invalid formats: malformed domains/IPs
```

### 2. Command Execution

**Always use `execFile`**, never `exec` or `spawn` with shell:

```typescript
// ✅ CORRECT - No shell, arguments as array
import { execFile } from 'child_process';
const { stdout } = await execFileAsync('subfinder', ['-d', domain, '-oJ']);

// ❌ WRONG - Shell injection risk
const { stdout } = await execAsync(`subfinder -d ${domain} -oJ`);
```

### 3. Timeouts

**Always set timeouts** for external tool execution:

```typescript
await execFileAsync(tool, args, {
  maxBuffer: 10 * 1024 * 1024,  // 10MB output limit
  timeout: 300000,               // 5 minute timeout
});
```

## Debugging Tips

### 1. Check Restate Logs

```bash
# View worker logs
tail -f /path/to/worker/logs

# View Restate Cloud logs
# Go to: https://cloud.restate.dev → Your Environment → Logs
```

### 2. Verify Service Registration

```bash
# List all registered services
npx @restatedev/restate services list

# Get service details
npx @restatedev/restate services get Discovery
```

### 3. Test Connectivity

```bash
# Test worker is accessible
curl http://localhost:9080

# Test Restate ingress
curl https://xxx.env.us.restate.cloud/Discovery/getState \
  -H "Authorization: Bearer $RESTATE_API_KEY" \
  -d '{"scanId":"test"}'
```

### 4. Common Error Messages

| Error | Meaning | Fix |
|-------|---------|-----|
| `Service not found` | Service not registered | Re-register deployment |
| `Unauthenticated` | Missing/invalid API key | Check `RESTATE_API_KEY` |
| `Unknown discovery tool` | Tool not enabled | Update tools array |
| `Command failed` | Security tool missing | Install tool on server |
| `Timeout` | Tool took too long | Increase timeout or optimize |

## Performance Optimization

### 1. Parallel Tool Execution

For discovery, tools run **sequentially** by default (safer):

```typescript
// Current: Sequential (safer, easier to debug)
for (const tool of tools) {
  const devices = await runDiscoveryTool(tool, domain, scope);
  allDevices.push(...devices);
}

// Future optimization: Parallel (faster but harder to debug)
const toolPromises = tools.map(tool =>
  ctx.run(`${tool}-${domain}`, () => runDiscoveryTool(tool, domain, scope))
);
const results = await Promise.all(toolPromises);
```

### 2. Deduplication

Use hostname + IP as dedup key (not just hostname):

```typescript
const key = `${device.hostname}:${device.ipAddress || 'no-ip'}`;
```

### 3. State Store Cleanup

In-memory state grows over time. Consider cleanup:

```typescript
// TODO: Implement state cleanup (sec-xx)
// Option 1: TTL-based expiration (1 hour)
// Option 2: LRU cache with max size
// Option 3: Persist to database for long-term storage
```

## Future Improvements

- [ ] **Scheduled Scans**: Use Restate durable timers for recurring scans
- [ ] **Parallel Tool Execution**: Run multiple discovery tools concurrently
- [ ] **State Persistence**: Store state in database instead of memory
- [ ] **Streaming Results**: Send results as they're discovered (not just at end)
- [ ] **Tool Configuration**: Make tools configurable per-tenant
- [ ] **Rate Limiting**: Prevent abuse of expensive scanning operations
- [ ] **Metrics**: Track success rate, performance, errors per tool

## Related Documentation

- [Restate Docs](https://docs.restate.dev)
- [Restate Cloud Dashboard](https://cloud.restate.dev)
- [Restate TypeScript SDK](https://github.com/restatedev/sdk-typescript)
- [Subfinder](https://github.com/projectdiscovery/subfinder)
- [Nmap](https://nmap.org/book/man.html)

## Commands Quick Reference

```bash
# Development
pnpm dev                          # Start worker with hot reload
pnpm build                        # Build for production
pnpm typecheck                    # Type check without building

# Testing
pnpm test                         # Run tests (if any)
curl -X POST http://localhost:8080/Discovery/discover ...  # Test directly

# Deployment
git status                        # Check for untracked files!
git push origin feature/branch
ssh server "cd /path/to/worker && git pull && pm2 restart restate-worker"

# Registration
npx @restatedev/restate deployments register http://localhost:9080
npx @restatedev/restate deployments register <TUNNEL_URL> --force
npx @restatedev/restate services list

# Debugging
tail -f logs/worker.log          # View worker logs
npx @restatedev/restate services get Discovery  # Check service config
```
