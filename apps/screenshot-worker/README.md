# Screenshot Worker

**Type**: Cloudflare Worker
**Purpose**: Capture screenshots of web services using Browser Rendering API
**Architecture**: Lightweight HTTP worker with R2 storage integration

## Overview

This worker receives screenshot requests via HTTP (triggered by Cloudflare Queue), captures screenshots using the Browser Rendering API, stores them in R2, and posts results back to the user-application.

## Architecture Principles

### Single Responsibility
This worker does ONE thing: capture screenshots and store them. It does NOT:
- ❌ Update databases (user-application handles all D1 writes)
- ❌ Manage job state (user-application owns `screenshot_jobs` table)
- ❌ Implement retry logic (Cloudflare Queue handles retries)

### Bindings
- ✅ **Browser Rendering API** - Native Cloudflare browser automation
- ✅ **R2** - Screenshot storage (`SCREENSHOTS` binding)
- ❌ **No D1** - Database writes happen in user-application only

### Data Flow
```
Queue Consumer → POST /screenshots/capture → Capture → Upload R2 → Postback → user-app
```

## Project Structure

```
apps/screenshot-worker/
├── src/
│   ├── index.ts                    # Worker entry point, request router
│   ├── handlers/
│   │   ├── capture.ts              # Main screenshot capture handler
│   │   └── health.ts               # Health check endpoint
│   ├── services/
│   │   ├── browser-rendering.ts    # Browser Rendering API client
│   │   ├── storage.ts              # R2 upload/storage operations
│   │   └── postback.ts             # Post results to user-application
│   ├── types/
│   │   ├── index.ts                # Request/response types
│   │   └── env.ts                  # Worker environment bindings
│   └── utils/
│       ├── validation.ts           # Input validation
│       ├── logger.ts               # Structured logging
│       └── errors.ts               # Error handling utilities
├── wrangler.jsonc                  # Cloudflare Worker configuration
├── package.json                    # Dependencies
├── tsconfig.json                   # TypeScript config
├── README.md                       # This file
└── CLAUDE.md                       # Claude Code instructions
```

## API

### POST /screenshots/capture

**Purpose**: Capture screenshots for multiple HTTP ports

**Request**:
```typescript
{
  jobId: string;              // Job ID from screenshot_jobs table
  deviceId: string;           // Device being scanned
  scanId: string;             // Scan run ID
  organizationId: string;     // Tenant ID
  ports: Array<{
    port: number;
    protocol: 'http' | 'https';
    httpDetection: {
      status: 'HTTP_DETECTED';
      url: string;
      title?: string;
      statusCode?: number;
    };
  }>;
  callbackUrl: string;        // Where to post results
}
```

**Response**:
```typescript
{
  jobId: string;
  status: 'processing';
  portsQueued: number;
}
```

**Postback to callbackUrl**:
```typescript
{
  type: 'SCREENSHOT';
  jobId: string;
  deviceId: string;
  scanId: string;
  organizationId: string;
  screenshots: Array<{
    port: number;
    url: string;
    status: 'SUCCESS' | 'FAILED' | 'TIMEOUT';
    r2Key?: string;           // R2 object key
    dimensions?: { width: number; height: number };
    fileSize?: number;        // Bytes
    duration?: number;        // Milliseconds
    error?: string;
  }>;
}
```

### GET /health

**Purpose**: Health check for monitoring

**Response**:
```typescript
{
  status: 'ok';
  version: string;
  bindings: {
    browser: boolean;
    r2: boolean;
  };
}
```

## Implementation Steps

### 1. Basic Setup
- [ ] Create `package.json` with dependencies
- [ ] Create `wrangler.jsonc` with Browser Rendering + R2 bindings
- [ ] Create `tsconfig.json`
- [ ] Implement basic request router in `index.ts`

### 2. Core Services
- [ ] `browser-rendering.ts` - Wrapper for Browser Rendering API
  - Timeout handling (30 seconds)
  - Error handling
  - Screenshot capture
- [ ] `storage.ts` - R2 upload logic
  - Generate R2 keys (pattern: `screenshots/{orgId}/{deviceId}/{scanId}/{port}-{timestamp}.png`)
  - Upload with metadata
  - Error handling
- [ ] `postback.ts` - Post results back to user-application
  - HTTP POST with retry (1 attempt)
  - Authentication header

### 3. Request Handler
- [ ] `capture.ts` - Main screenshot capture handler
  - Validate request payload
  - Loop through ports
  - Capture each screenshot (parallel, max 5 concurrent)
  - Upload to R2
  - Collect results
  - Postback to user-application

### 4. Supporting Utilities
- [ ] `validation.ts` - Input validation using Zod
- [ ] `logger.ts` - Structured logging for debugging
- [ ] `errors.ts` - Error classes and handling

### 5. Testing & Deployment
- [ ] Unit tests for services
- [ ] Integration tests (mock Browser Rendering API)
- [ ] Deploy to Cloudflare
- [ ] Test with real requests

## Configuration

### wrangler.jsonc

```jsonc
{
  "name": "screenshot-worker",
  "main": "src/index.ts",
  "compatibility_date": "2024-10-01",
  "node_compat": true,

  "browser": {
    "binding": "BROWSER"
  },

  "r2_buckets": [
    {
      "binding": "SCREENSHOTS",
      "bucket_name": "openscan-screenshots",
      "preview_bucket_name": "openscan-screenshots-dev"
    }
  ],

  "vars": {
    "ENVIRONMENT": "production",
    "VERSION": "1.0.0"
  }
}
```

### Environment Variables (Secrets)

Set via `wrangler secret put`:
```bash
WORKER_API_KEY         # Shared secret for authentication (validates incoming requests)
USER_APP_API_KEY       # API key for posting back to user-application
```

## Security

### Input Validation
- Validate all request fields with Zod
- Ensure URLs are from HTTP detection (not user-provided)
- Validate jobId format (CUID)

### Authentication
- Incoming requests: Verify `Authorization: Bearer ${WORKER_API_KEY}`
- Postback requests: Include `Authorization: Bearer ${USER_APP_API_KEY}`

### Resource Limits
- Max 30 seconds per screenshot
- Max 5 concurrent screenshots
- Max 10MB response size

## Monitoring

### Structured Logs
```typescript
logger.info('Screenshot capture started', { jobId, deviceId, portCount });
logger.info('Screenshot captured', { jobId, port, duration, fileSize });
logger.error('Screenshot failed', { jobId, port, error });
```

### Metrics to Track
- Screenshots captured per minute
- Success rate per port
- Average capture duration
- R2 upload success rate
- Postback delivery rate

## Development

### Local Development
```bash
cd apps/screenshot-worker
pnpm install
pnpm dev              # Start with wrangler dev
```

### Testing
```bash
# Direct HTTP test
curl -X POST http://localhost:8787/screenshots/capture \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test-key" \
  -d '{
    "jobId": "test-123",
    "deviceId": "dev-456",
    "scanId": "scan-789",
    "organizationId": "org-abc",
    "ports": [{
      "port": 443,
      "protocol": "https",
      "httpDetection": {
        "status": "HTTP_DETECTED",
        "url": "https://example.com:443"
      }
    }],
    "callbackUrl": "http://localhost:3000/api/internal/screenshot-results"
  }'
```

### Deployment
```bash
pnpm build
wrangler deploy
```

## Related Documentation

- [Feature Spec](../../docs/features/screenshot-capture.md)
- [Cloudflare Browser Rendering API](https://developers.cloudflare.com/browser-rendering/)
- [Cloudflare R2](https://developers.cloudflare.com/r2/)
- [User Application Postback Architecture](../user-application/docs/postback-architecture.md)

## Dependencies

```json
{
  "dependencies": {
    "@cloudflare/workers-types": "^4.20241022.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "wrangler": "^3.80.0",
    "typescript": "^5.6.3",
    "vitest": "^2.1.4"
  }
}
```

## Next Steps

1. **Now**: Set up basic project files (package.json, wrangler.jsonc, tsconfig.json)
2. **Next**: Implement browser-rendering.ts service
3. **Then**: Implement storage.ts service
4. **Then**: Wire up capture.ts handler
5. **Finally**: Test and deploy

See `CLAUDE.md` for detailed implementation guidance.
