# Restate Worker

Durable security scanning workflows powered by Restate - replaces Temporal worker.

## Overview

This Node.js service runs security scanning workflows (port scanning, discovery) with built-in durability, retries, and state management powered by Restate.

### Why Restate over Temporal?

- ✅ **Simpler**: No separate workflow/activity split, just services
- ✅ **Lighter**: No heavy gRPC dependencies
- ✅ **Cloudflare-friendly**: TanStack Start can call Restate HTTP API directly
- ✅ **Free tier**: Restate Cloud free tier for getting started
- ✅ **Built-in state**: No extra DB for workflow state

## Architecture

```
┌─────────────────────┐
│ TanStack Start      │  User makes scan request
│ (Cloudflare)        │
└──────────┬──────────┘
           │ POST /PortScanner/scan
           ↓
┌─────────────────────┐
│ Restate Cloud       │  Orchestrates workflow
│ (Free Tier)         │  - Durability
└──────────┬──────────┘  - Retries
           │ Invokes     - State
           ↓
┌─────────────────────┐
│ This Worker         │  Executes actual scan
│ (Self-hosted)       │  - Runs nmap
│ Node.js + Restate   │  - Parses results
└─────────────────────┘  - Returns data
```

## Quick Start

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Start Worker Locally

```bash
pnpm dev
```

Worker starts on port 9080 (or `RESTATE_PORT` from .env).

### 3. Register with Restate

#### Option A: Restate Cloud (Recommended)

1. Sign up for free: https://cloud.restate.dev
2. Get your Admin URL from the dashboard
3. Register this worker:

```bash
npx @restatedev/restate deployments register \
  --admin-url https://<YOUR-ENV>.api.restate.cloud \
  http://localhost:9080
```

#### Option B: Local Restate Server

```bash
# Start local Restate server
docker run -d --name restate_dev -p 8080:8080 -p 9070:9070 \
  docker.io/restatedev/restate:latest

# Register worker
npx @restatedev/restate deployments register \
  --admin-url http://localhost:9070 \
  http://localhost:9080
```

### 4. Test Port Scanner

Get your ingress URL from Restate Cloud dashboard (or `http://localhost:8080` for local).

```bash
# Start a scan
curl -X POST https://<YOUR-ENV>.restate.cloud/PortScanner/scan \
  -H "Content-Type: application/json" \
  -d '{
    "target": "scanme.nmap.org",
    "ports": "1-1000",
    "protocol": "tcp",
    "aggressive": false
  }'

# Response:
# {
#   "scanId": "550e8400-e29b-41d4-a716-446655440000",
#   "target": "scanme.nmap.org",
#   "ports": [...],
#   "totalPorts": 3,
#   "scanDuration": 2543,
#   "completedAt": "2025-01-15T10:30:00.000Z"
# }
```

## Available Services

### Httpx

#### `probe(input)`

Probes HTTP/HTTPS services using httpx CLI tool. Captures screenshots, HTTP metadata, and technology detection.

**Input:**
```typescript
{
  target: string;             // IP or domain
  ports: number[];            // List of ports to probe (e.g., [80, 443, 8080])
  scanRunId: string;          // Scan run ID for linking results
  deviceId: string;           // Device ID
  organizationId: string;     // Tenant ID
  callbackUrl: string;        // Where to POST results
  screenshotsEnabled?: boolean; // Enable screenshot capture (default: true)
  timeout?: number;           // Per-request timeout in seconds (default: 10)
}
```

**Output:**
```typescript
{
  scanId: string;
  target: string;
  probes: Array<{
    port: number;
    url: string;
    status: 'SUCCESS' | 'FAILED';
    // On SUCCESS:
    scheme?: string;
    statusCode?: number;
    title?: string;
    screenshot?: string;      // Local file path
    webServer?: string;
    responseTime?: number;
    technologies?: Array<{name: string, confidence: string}>;
    // On FAILED:
    error?: string;
    errorType?: 'CONNECTION_REFUSED' | 'TIMEOUT' | 'DNS_ERROR' | 'SSL_ERROR' | 'UNKNOWN';
  }>;
  totalProbes: number;
  successCount: number;
  failedCount: number;
  duration: number;
  completedAt: string;
}
```

**Screenshot Storage:**
- Screenshots are saved locally by httpx to `~/.config/httpx/screenshot/`
- File paths are stored in the database
- Future: Upload to R2 for persistent storage

#### `getState(input)`

Get probe state/progress (for polling).

**Input:**
```typescript
{
  scanId: string;
}
```

---

### PortScanner

#### `scan(input)`

Runs nmap scan with durable execution.

**Input:**
```typescript
{
  target: string;        // IP or domain
  ports?: string;        // Port range (e.g., "1-1000")
  protocol?: 'tcp' | 'udp';
  aggressive?: boolean;  // Enable -A flag
  timeout?: number;      // Host timeout in ms
}
```

**Output:**
```typescript
{
  scanId: string;
  target: string;
  ports: Array<{
    port: number;
    protocol: string;
    state: string;
    service?: string;
    version?: string;
  }>;
  totalPorts: number;
  scanDuration: number;
  completedAt: string;
}
```

#### `cancel(input)`

Cancel a running scan.

**Input:**
```typescript
{
  scanId: string;
  reason?: string;
}
```

#### `getState(input)`

Get scan state/progress.

**Input:**
```typescript
{
  scanId: string;
}
```

## Development

### Project Structure

```
apps/restate-worker/
├── src/
│   ├── index.ts           # Entry point, server setup
│   ├── port-scanner.ts    # Port scanning service
│   └── discovery.ts       # TODO: Discovery service
├── package.json
├── tsconfig.json
└── README.md
```

### Building

```bash
pnpm build         # Compile TypeScript
pnpm typecheck     # Type check only
```

### Environment Variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

**Available variables:**

- `RESTATE_PORT` - Port to listen on (default: 9080)
- `RESTATE_IDENTITY_KEYS` - Comma-separated public keys from Restate Cloud (for security)

## Remote Deployment with Tunnel

For deploying the worker on a private server connected to Restate Cloud via tunnel:

### 1. Setup Tunnel (Docker)

```bash
# Create env file
cat > tunnel.env << 'EOF'
RESTATE_ENVIRONMENT_ID=env_YOUR_ENV_ID
RESTATE_BEARER_TOKEN=key_YOUR_API_KEY
RESTATE_TUNNEL_NAME=prod-tunnel
RESTATE_SIGNING_PUBLIC_KEY=publickeyv1_YOUR_PUBLIC_KEY
RESTATE_CLOUD_REGION=us
EOF

# Start tunnel with host networking
docker run --network host --env-file tunnel.env -d --restart unless-stopped \
  ghcr.io/restatedev/restate-cloud-tunnel-client:latest
```

### 2. Configure Worker

Create `.env`:

```bash
RESTATE_PORT=9080
RESTATE_IDENTITY_KEYS=publickeyv1_YOUR_PUBLIC_KEY
WORKER_API_KEY=your-secret-key
POSTBACK_URL=https://your-app.workers.dev/api/internal/scan-results
```

### 3. Start Worker & Register

```bash
# Start worker
pnpm dev

# Register via tunnel (from local machine with restate CLI)
restate deployments register https://tunnel.us.restate.cloud:9080/YOUR_ENV_ID/prod-tunnel/http/localhost/9080
```

Get credentials from: https://cloud.restate.dev → Your Environment → Settings

---

## Production Deployment

### Prerequisites

- Node.js 18+
- nmap installed (`apt-get install nmap` or `brew install nmap`)
- httpx installed (`go install -v github.com/projectdiscovery/httpx-toolkit/cmd/httpx@latest`)
- Google Chrome (required for httpx screenshots):
  ```bash
  # Ubuntu/Debian
  echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" | sudo tee /etc/apt/sources.list.d/google-chrome.list
  wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | sudo apt-key add -
  sudo apt-get update
  sudo apt-get install -y google-chrome-stable

  # Verify installation
  google-chrome --version
  ```
- Network access to scan targets

### Deploy Steps

1. **Build the worker:**
   ```bash
   pnpm build
   ```

2. **Start in production:**
   ```bash
   NODE_ENV=production pnpm start
   ```

3. **Register with Restate Cloud:**
   ```bash
   npx @restatedev/restate deployments register \
     --admin-url https://<YOUR-ENV>.api.restate.cloud \
     https://your-worker-domain.com:9080
   ```

4. **Configure identity keys** (recommended for security):
   - Get keys from Restate Cloud dashboard
   - Set `RESTATE_IDENTITY_KEYS` environment variable
   - Restart worker

### Docker Deployment

```dockerfile
FROM node:18-slim

# Install nmap
RUN apt-get update && apt-get install -y nmap && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm ci --production

COPY dist ./dist

EXPOSE 9080
CMD ["node", "dist/index.js"]
```

## Migrating from Temporal

### What Changes

| Aspect | Temporal | Restate |
|--------|----------|---------|
| **Worker Code** | Workflows + Activities | Just Services |
| **Client Code** | `workflowOrchestratorHttp` | Direct HTTP to Restate |
| **Deployment** | Temporal server + workers | Restate Cloud + this worker |
| **State** | External DB | Built-in |
| **Signals** | `handle.signal()` | Service methods |
| **Queries** | `handle.query()` | Service methods |

### Migration Checklist

- [ ] Port scanner workflow → `portScanner.scan()`
- [ ] Discovery workflow → `discovery.discover()`
- [ ] Update TanStack Start to call Restate HTTP API
- [ ] Remove `workflow-orchestrator-http.ts`
- [ ] Remove Temporal dependencies
- [ ] Update tests

## Troubleshooting

**Worker won't start:**
- Check port 9080 is available
- Verify Node.js version (18+)

**Can't register with Restate:**
- Ensure worker is running
- Check network connectivity
- Verify admin URL is correct

**nmap not found:**
- Install: `apt-get install nmap` or `brew install nmap`
- Check PATH includes nmap

**Scans timing out:**
- Increase `timeout` in scan input
- Check network access to target
- Verify nmap is working: `nmap -V`

**httpx screenshots not working:**
- Install Chrome: See Prerequisites section above
- Verify Chrome: `google-chrome --version`
- Test httpx: `httpx -json -ss -system-chrome http://example.com`
- Check Chrome dependencies are installed (see httpx service section)

**httpx not found:**
- Install: `go install -v github.com/projectdiscovery/httpx-toolkit/cmd/httpx@latest`
- Check PATH: `echo $PATH | grep go/bin`
- Verify: `httpx -version`

## Next Steps

- [ ] Add discovery workflow service
- [ ] Integrate existing XML parser from temporal-worker
- [ ] Add scheduled scans support
- [ ] Update TanStack Start to call Restate instead of Temporal
- [ ] Performance testing
- [ ] Production deployment

## Resources

- [Restate Docs](https://docs.restate.dev)
- [Restate Cloud](https://cloud.restate.dev)
- [Node.js SDK Reference](https://docs.restate.dev/develop/ts/overview)
- [Examples](https://github.com/restatedev/examples)
