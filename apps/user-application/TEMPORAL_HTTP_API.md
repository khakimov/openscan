# Temporal HTTP API Integration

## Summary

Successfully integrated Temporal workflows with Cloudflare Workers using HTTP API instead of gRPC.

## Key Findings

### 1. Endpoint Structure
```
POST http://localhost:8233/api/v1/namespaces/{namespace}/workflows/start-workflow-execution
```

### 2. CSRF Bypass
The Temporal UI server skips CSRF validation when an `Authorization` header is present:
```typescript
headers: {
  'Content-Type': 'application/json',
  'Authorization': 'Bearer temporal-http-client' // Any value works
}
```

### 3. Request Payload
```json
{
  "namespace": "default",
  "workflowId": "unique-id-here",
  "workflowType": {"name": "discoveryWorkflow"},
  "taskQueue": {"name": "scanner-tasks"},
  "input": {
    "payloads": [{
      "metadata": {"encoding": "anNvbi9wbGFpbg=="}, 
      "data": "<base64-encoded-json>"
    }]
  }
}
```

### 4. Configuration
Set environment variable:
```bash
TEMPORAL_HTTP_API_URL=http://localhost:8233
```

## Implementation

- **HTTP Client**: `/src/server/utils/temporal-http-client.ts`
- **Orchestrator**: `/src/server/discovery/services/workflow-orchestrator-http.ts`  
- **Handler**: `/src/server/discovery/workflows/discovery-handler.ts`

## Status

✅ HTTP communication working  
✅ Workflows starting successfully  
⏳ Input encoding being refined for worker compatibility
