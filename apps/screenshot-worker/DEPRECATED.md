# DEPRECATED: Screenshot Worker

**Status**: This worker is no longer in use as of 2025-11-01.

## Why Deprecated?

The screenshot-worker was originally created to capture screenshots using Cloudflare's Browser Rendering API. However, we discovered that the `httpx` CLI tool (used by restate-worker) already has built-in screenshot capability using headless Chrome.

**New Architecture:**
1. **restate-worker** captures screenshots via `httpx --screenshot` (local filesystem)
2. Screenshots are read and base64-encoded in postback payload
3. **user-application** receives payload, uploads to R2, stores R2 key in database
4. UI fetches screenshots via proxy endpoint `/api/screenshots`

This approach:
- ✅ Eliminates redundant screenshot capture infrastructure
- ✅ Centralizes R2 binding in user-application
- ✅ Leverages existing httpx tool capabilities
- ✅ Reduces deployment complexity (one less worker to manage)

## Migration Complete

All screenshot functionality has been migrated to the new architecture:
- ✅ R2 binding added to user-application
- ✅ R2 storage service implemented
- ✅ HttpxPostbackHandler updated to upload screenshots
- ✅ Screenshot proxy endpoint created
- ✅ UI updated to display screenshots from R2

## Files to Remove (Future Cleanup)

When ready to completely remove this worker:
```bash
# Remove the entire directory
rm -rf apps/screenshot-worker

# Update root package.json workspace config if needed
# Remove any references in CI/CD pipelines
```

## Alternative Use Cases

If screenshot capture from a Cloudflare Worker is needed in the future (e.g., for on-demand screenshot API), this code can serve as a reference implementation for:
- Browser Rendering API usage
- R2 upload patterns
- Screenshot metadata handling

## References

- New implementation: `apps/user-application/src/server/services/r2-storage.ts`
- Postback handler: `apps/user-application/src/server/postback/handlers/httpx.ts`
- Screenshot endpoint: `apps/user-application/src/routes/api/screenshots.tsx`
- Httpx service: `apps/restate-worker/src/httpx-service.ts`
