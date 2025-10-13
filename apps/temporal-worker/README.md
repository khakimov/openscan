# Temporal Worker

Database-agnostic Temporal worker for executing discovery workflows.

## Architecture

This worker is **stateless and database-agnostic**:
- ✅ Executes workflows and activities
- ✅ Returns complete results through Temporal
- ❌ Does NOT persist to database
- ❌ Does NOT know about D1 or any database

The web app (`user-application`) is responsible for:
- Starting workflows via HTTP API
- Polling workflow status
- Fetching completed results
- Persisting selected data to D1 database

## Communication Flow

```
┌─────────────────┐          ┌──────────────────┐          ┌─────────────┐
│  Web App        │          │  Temporal Server │          │   Worker    │
│  (Cloudflare)   │          │  (necto.sec.rocks)│         │   (VPS)     │
└─────────────────┘          └──────────────────┘          └─────────────┘
        │                             │                            │
        │ 1. Start workflow (HTTP)    │                            │
        ├────────────────────────────>│                            │
        │                             │                            │
        │                             │ 2. Poll for tasks (gRPC)   │
        │                             │<───────────────────────────│
        │                             │                            │
        │                             │ 3. Execute workflow        │
        │                             │<──────────────────────────>│
        │                             │                            │
        │ 4. Get result (HTTP)        │                            │
        │<────────────────────────────│                            │
        │                             │                            │
        │ 5. Persist to D1            │                            │
        │                             │                            │
```

## Running the Worker

### Development Mode (with mock data)

```bash
# From monorepo root
pnpm dev:worker

# Or from worker directory
cd apps/temporal-worker
pnpm dev
```

**Environment variables for dev mode:**
```bash
# Enable mock mode (returns fake data without running tools)
SCANNER_DEV_MODE=true

# Mock sleep duration in seconds (default: 5)
SCANNER_DEV_SLEEP_SECONDS=3

# Temporal connection
TEMPORAL_SERVER_ADDRESS=localhost:7233
TEMPORAL_NAMESPACE=default
TEMPORAL_TASK_QUEUE=scanner-tasks
```

### Production Mode

```bash
# Build the worker
pnpm build:worker

# Run the compiled worker
pnpm start:worker
```

**Environment variables for production:**
```bash
# Temporal connection
TEMPORAL_SERVER_ADDRESS=necto.sec.rocks:7233
TEMPORAL_NAMESPACE=default
TEMPORAL_TASK_QUEUE=scanner-tasks

# No SCANNER_DEV_MODE - will run actual tools (subfinder, amass, etc.)
```

## Discovery Tools Required (Production)

When running in production mode, these tools must be installed on the server:

- **subfinder** - Fast subdomain discovery
- **assetfinder** - Additional subdomain sources
- **amass** (optional) - Comprehensive subdomain enumeration

Install via Go:
```bash
go install -v github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest
go install github.com/tomnomnom/assetfinder@latest
go install github.com/owasp-amass/amass/v4/...@master
```

## Workflows

### Discovery Workflow

Discovers subdomains and hosts for a given domain.

**Input:**
```typescript
{
  target: "example.com",  // Simple format (backward compatible)
  tools: ["subfinder"]    // Optional
}

// OR advanced format:
{
  tenantId: "tenant-123",
  scanId: "scan-456",
  targets: [
    { type: "DOMAIN", value: "example.com", scope: "EXTERNAL" }
  ],
  discoverSubdomains: true,
  enablePingSweep: true,
  maxDepth: 1,
  tools: ["subfinder", "assetfinder"],
  createdAt: new Date()
}
```

**Output:**
```typescript
{
  scanId: "scan-456",
  devices: [
    {
      hostname: "api.example.com",
      ipAddress: "1.2.3.4",
      scope: "EXTERNAL",
      discoveredAt: "2025-01-15T10:00:00Z",
      discoveryMethod: "subfinder",
      confidence: 1.0
    }
  ],
  pingSweepResults: { "1.2.3.4": true },
  startedAt: "2025-01-15T10:00:00Z",
  completedAt: "2025-01-15T10:02:00Z",
  totalTargetsProcessed: 1,
  errors: [],
  performance: {
    executionTimeMs: 120000,
    devicesPerSecond: 0.5
  }
}
```

## Deployment

### VPS Deployment

1. **Clone the repository**
```bash
git clone <repo-url>
cd sec
```

2. **Install dependencies**
```bash
pnpm install
```

3. **Build the worker**
```bash
pnpm build:worker
```

4. **Create systemd service** (`/etc/systemd/system/temporal-worker.service`):
```ini
[Unit]
Description=Temporal Worker
After=network.target

[Service]
Type=simple
User=temporal
WorkingDirectory=/opt/sec/apps/temporal-worker
Environment="NODE_ENV=production"
Environment="TEMPORAL_SERVER_ADDRESS=necto.sec.rocks:7233"
Environment="TEMPORAL_NAMESPACE=default"
Environment="TEMPORAL_TASK_QUEUE=scanner-tasks"
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

5. **Enable and start**
```bash
sudo systemctl enable temporal-worker
sudo systemctl start temporal-worker
sudo systemctl status temporal-worker
```

### Docker Deployment

```dockerfile
FROM node:22-alpine

WORKDIR /app

# Copy monorepo
COPY . .

# Install dependencies
RUN npm install -g pnpm@10.14.0
RUN pnpm install --frozen-lockfile

# Build worker
RUN pnpm build:worker

# Install discovery tools
RUN apk add --no-cache go git
RUN go install -v github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest
RUN go install github.com/tomnomnom/assetfinder@latest

WORKDIR /app/apps/temporal-worker

CMD ["node", "dist/index.js"]
```

## Monitoring

The worker logs to stdout with structured JSON logs:

```json
{
  "level": "info",
  "message": "Worker created successfully, polling for tasks...",
  "timestamp": "2025-01-15T10:00:00Z"
}
```

Monitor logs:
```bash
# Systemd
sudo journalctl -u temporal-worker -f

# Docker
docker logs -f temporal-worker
```

## Troubleshooting

### Worker not picking up tasks

1. Check Temporal server connection:
```bash
# Test gRPC connection
telnet necto.sec.rocks 7233
```

2. Verify task queue matches web app:
```typescript
// Web app: temporal-http-client.ts
taskQueue: config.taskQueue  // Should match worker

// Worker: index.ts
taskQueue: config.taskQueue
```

3. Check worker logs for connection errors

### Workflow fails immediately

1. Check if tools are installed (production mode):
```bash
which subfinder
which assetfinder
```

2. Enable dev mode to test without tools:
```bash
SCANNER_DEV_MODE=true pnpm dev:worker
```

3. Check activity timeout policies in `config/activity-policies.ts`

## Development

### Adding New Workflows

1. Create workflow in `src/workflows/<workflow-name>/`
2. Define contracts in `packages/temporal/src/contracts/<workflow-name>.ts`
3. Export workflow from `src/workflows/index.ts`
4. Export activities from `src/activities.ts`

### Testing

```bash
# Run worker in dev mode with mock data
SCANNER_DEV_MODE=true SCANNER_DEV_SLEEP_SECONDS=2 pnpm dev:worker

# In another terminal, trigger workflow from web app
curl -X POST http://localhost:3000/api/discovery \
  -H "Content-Type: application/json" \
  -d '{"target": "example.com"}'
```
