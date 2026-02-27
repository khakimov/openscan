# Necto API Test Fixtures

Mock API responses for testing CVE enrichment integration without requiring a live Necto API.

## Files

### `necto-api-linux-response.json`
Mock response for Ubuntu 24.04 LTS with:
- **OS**: 8 CVEs (2 critical, 3 high, 2 medium, 1 low)
- **Applications**:
  - openssh-server 9.6p1 (port 22): 2 CVEs including CVE-2024-6387 (CVSS 9.8)
  - nginx 1.24.0 (port 80): 2 CVEs
  - apache-httpd 2.4.58 (port 443): 3 CVEs
- **Summary**: 13 total CVEs, max CVSS 9.8

### `necto-api-windows-response.json`
Mock response for Windows Server 2019 with:
- **OS**: 6 CVEs (2 critical, 2 high, 2 medium)
- **Applications**:
  - microsoft-iis 10.0 (port 80): 1 CVE
  - mssql-server 15.0.2000 (port 1433): 2 CVEs
  - microsoft-rdp 10.0.17763 (port 3389): 2 CVEs
- **Summary**: 12 total CVEs, max CVSS 9.8

### `necto-api-macos-response.json`
Mock response for macOS 14.2 (Sonoma) with:
- **OS**: 4 CVEs (1 high, 3 medium)
- **Applications**:
  - openssh-server 9.4p1 (port 22): 2 CVEs
  - apache-httpd 2.4.57 (port 80): 2 CVEs
- **Summary**: 8 total CVEs, max CVSS 9.8

### `necto-api-error-response.json`
Mock error response for API unavailability:
- Status: 503 Service Unavailable
- Reason: CVE database initialization in progress
- Retry-After: 3600 seconds

## Usage in Tests

```typescript
import linuxResponse from './__fixtures__/necto-api-linux-response.json';
import windowsResponse from './__fixtures__/necto-api-windows-response.json';
import macosResponse from './__fixtures__/necto-api-macos-response.json';
import errorResponse from './__fixtures__/necto-api-error-response.json';

// Mock successful response
fetchMock.mockResolvedValueOnce({
  ok: true,
  json: async () => linuxResponse,
});

// Mock error response
fetchMock.mockResolvedValueOnce({
  ok: false,
  status: 503,
  json: async () => errorResponse,
});
```

## Data Sources

These fixtures are based on:
1. **CVE enrichment types**: `packages/data-ops/src/types/cve-enrichment.ts`
2. **Transformation test cases**: `cve-payload-transformation.test.ts`
3. **Real CVE data**: National Vulnerability Database (NVD) CVE records
4. **Necto API schema**: Expected API response format

## Maintenance

When the real Necto API becomes available:
1. Fetch actual responses for each OS type
2. Compare with these fixtures for schema compatibility
3. Update fixtures if API response format changes
4. Add new fixtures for edge cases discovered in production

## Related Issues

- **sec-67**: CVE enrichment types and schema analysis
- **sec-68**: Necto API HTTP client implementation (uses these fixtures)
- **sec-69**: CVE enrichment service orchestration
