# AGENTS.md - Screenshot Worker

This file provides guidance to AI agents when working with the screenshot worker.

## Overview

This is a **Cloudflare Worker** that captures screenshots of web services using Browser Rendering API. It is part of the screenshot capture feature (see `../../docs/features/assets/screenshots.md`).

**Architecture**: Lightweight HTTP worker - does ONE thing well (capture + store screenshots)

## Critical Design Principles

### 1. This Worker Does NOT Touch Database
- ❌ **No D1 binding** - Never access database directly
- ✅ **Postback pattern** - Post results to user-application
- ✅ **User-application updates database** - Single source of truth

### 2. This Worker Does NOT Manage State
- ❌ **No job tracking** - `screenshot_jobs` table managed by user-application
- ❌ **No retry logic** - Cloudflare Queue handles retries
- ✅ **Stateless operation** - Receive request → capture → upload → postback → done

### 3. Bindings
```typescript
interface Env {
  BROWSER: BrowserBinding;           // ✅ Browser Rendering API
  SCREENSHOTS: R2Bucket;              // ✅ R2 bucket for storage
  // NO D1 binding!

  // Secrets (set via wrangler secret put)
  WORKER_API_KEY: string;             // Validates incoming requests
  USER_APP_API_KEY: string;           // Authenticates postback
}
```

## Implementation Guidelines

### Service Architecture

**`src/services/browser-rendering.ts`** - Browser Rendering API wrapper
```typescript
export async function captureScreenshot(
  browser: BrowserBinding,
  url: string,
  options?: { timeout?: number; viewport?: { width: number; height: number } }
): Promise<{ buffer: ArrayBuffer; width: number; height: number }> {
  // 1. Call Browser Rendering API
  // 2. Set timeout (default 30 seconds)
  // 3. Return screenshot buffer + dimensions
  // 4. Handle errors (timeout, invalid URL, etc.)
}
```

**`src/services/storage.ts`** - R2 storage operations
```typescript
export function generateR2Key(
  organizationId: string,
  deviceId: string,
  scanId: string,
  port: number
): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `screenshots/${organizationId}/${deviceId}/${scanId}/${port}-${timestamp}.png`;
}

export async function uploadScreenshot(
  r2: R2Bucket,
  key: string,
  buffer: ArrayBuffer,
  metadata: Record<string, string>
): Promise<void> {
  // 1. Upload to R2 with metadata
  // 2. Handle errors
}
```

**`src/services/postback.ts`** - Post results to user-application
```typescript
export async function postResults(
  callbackUrl: string,
  payload: ScreenshotPostback,
  apiKey: string
): Promise<void> {
  // 1. POST to callbackUrl
  // 2. Include Authorization header
  // 3. Handle errors (1 retry attempt)
}
```

### Handler Pattern

**`src/handlers/capture.ts`** - Main screenshot capture handler
```typescript
export async function handleCapture(
  request: Request,
  env: Env
): Promise<Response> {
  // 1. Validate authentication
  const authHeader = request.headers.get('Authorization');
  if (authHeader !== `Bearer ${env.WORKER_API_KEY}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  // 2. Parse and validate request body
  const body = await request.json();
  const input = CaptureRequestSchema.parse(body);

  // 3. Capture screenshots (parallel, max 5 concurrent)
  const results = await Promise.allSettled(
    input.ports.map(port => capturePort(port, env, input))
  );

  // 4. Postback results to user-application
  await postResults(input.callbackUrl, {
    type: 'SCREENSHOT',
    jobId: input.jobId,
    screenshots: results,
  }, env.USER_APP_API_KEY);

  return Response.json({
    jobId: input.jobId,
    status: 'processing',
    portsQueued: input.ports.length,
  });
}
```

### Error Handling

**Always log errors with context**:
```typescript
try {
  const screenshot = await captureScreenshot(env.BROWSER, url);
} catch (error) {
  logger.error('Screenshot capture failed', {
    jobId,
    port,
    url,
    error: error.message,
    stack: error.stack,
  });

  // Return error in postback (don't throw)
  return {
    port,
    url,
    status: 'FAILED',
    error: error.message,
  };
}
```

**Timeout handling**:
```typescript
const captureWithTimeout = Promise.race([
  captureScreenshot(env.BROWSER, url),
  new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Timeout')), 30000)
  ),
]);
```

### Testing

**Unit tests** (mock Browser Rendering API):
```typescript
import { describe, test, expect, vi } from 'vitest';

describe('captureScreenshot', () => {
  test('captures screenshot successfully', async () => {
    const mockBrowser = {
      fetch: vi.fn().mockResolvedValue({
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(1024)),
      }),
    };

    const result = await captureScreenshot(mockBrowser, 'https://example.com');
    expect(result.buffer).toBeInstanceOf(ArrayBuffer);
  });
});
```

**Integration tests** (use wrangler dev):
```bash
# Terminal 1: Start worker
cd apps/screenshot-worker
pnpm dev

# Terminal 2: Test endpoint
curl -X POST http://localhost:8787/screenshots/capture \
  -H "Authorization: Bearer test-key" \
  -d @test-payload.json
```

## Deployment Checklist

Before deploying:
- [ ] Set secrets: `wrangler secret put WORKER_API_KEY`
- [ ] Set secrets: `wrangler secret put USER_APP_API_KEY`
- [ ] Verify R2 bucket exists: `openscan-screenshots`
- [ ] Test with staging environment first
- [ ] Verify Browser Rendering API access (requires Paid plan)

Deploy:
```bash
pnpm build
wrangler deploy
```

Verify:
```bash
# Test health endpoint
curl https://screenshot-worker.account.workers.dev/health

# Check logs
wrangler tail screenshot-worker
```

## Common Issues

### Issue: "Browser Rendering API not available"
**Cause**: Requires Cloudflare Workers Paid plan
**Fix**: Upgrade to Paid plan ($5/mo minimum)

### Issue: "R2 bucket not found"
**Cause**: Bucket not created or wrong name in wrangler.jsonc
**Fix**: Create bucket via dashboard or check binding name

### Issue: "Postback fails with 401"
**Cause**: Wrong USER_APP_API_KEY
**Fix**: Verify secret matches user-application's WORKER_API_KEY

### Issue: "Screenshots timeout"
**Cause**: Target website is slow or unresponsive
**Fix**: Increase timeout (max 30s) or mark as TIMEOUT in results

## Performance Optimization

### Parallel Capture
Capture up to 5 screenshots concurrently:
```typescript
const batchSize = 5;
for (let i = 0; i < ports.length; i += batchSize) {
  const batch = ports.slice(i, i + batchSize);
  await Promise.allSettled(batch.map(capturePort));
}
```

### R2 Upload Optimization
Upload immediately after capture (don't wait for all):
```typescript
const screenshot = await captureScreenshot(...);
// Upload immediately (don't wait)
uploadScreenshot(r2, key, screenshot.buffer).catch(logger.error);
```

### Memory Management
Clear buffers after upload:
```typescript
const screenshot = await captureScreenshot(...);
await uploadScreenshot(r2, key, screenshot.buffer);
screenshot.buffer = null; // Allow GC
```

## Related Files

- Feature spec: `../../docs/features/assets/screenshots.md`
- User application: `../user-application/`
- Queue consumer: `../user-application/src/queue-handlers/screenshot-queue.ts`
- Postback handler: `../user-application/src/server/postback/handlers/screenshot.ts`

## Development Workflow

1. **Make changes** - Edit files in `src/`
2. **Test locally** - `pnpm dev` (uses wrangler dev)
3. **Run tests** - `pnpm test`
4. **Deploy staging** - `wrangler deploy --env staging`
5. **Test staging** - Trigger test screenshot job
6. **Deploy production** - `wrangler deploy`
7. **Monitor logs** - `wrangler tail screenshot-worker`

## Next Steps

See README.md for implementation steps and project structure.
