# Testing

### Integration Tests

**File**: `apps/user-application/src/server/__tests__/notifications-integration.test.ts`

```typescript
describe('Notification System Integration', () => {
  it('should create notification for new port', async () => {
    const notification = await createNotification({
      organizationId: 'org_test',
      deviceId: 'dev_test',
      type: 'NEW_PORT',
      severity: 'HIGH',
      title: 'New RDP port 3389 discovered',
      fingerprint: 'new_port:dev_test:3389:tcp',
      suppressUntil: new Date(Date.now() + 6 * 60 * 60 * 1000),
    });

    expect(notification.id).toBeDefined();
    expect(notification.severity).toBe('HIGH');
  });

  it('should suppress duplicate notifications', async () => {
    const fingerprint = 'test_duplicate';

    // Create first notification
    await createNotification({
      organizationId: 'org_test',
      type: 'NEW_PORT',
      severity: 'MEDIUM',
      title: 'Test',
      fingerprint,
      suppressUntil: new Date(Date.now() + 60000), // 1 minute
    });

    // Check if suppressed
    const suppressed = await checkDuplicateNotification({
      organizationId: 'org_test',
      fingerprint,
    });

    expect(suppressed).toBe(true);
  });

  it('should detect port changes', async () => {
    // Setup baseline scan
    const baseline = await createScanRun({
      deviceId: 'dev_test',
      organizationId: 'org_test',
      resultSummary: {
        ports: [{ port: 22, protocol: 'tcp', state: 'open', service: { name: 'ssh' } }],
      },
    });

    // New scan with port 3389
    const newScan = await createScanRun({
      deviceId: 'dev_test',
      organizationId: 'org_test',
      resultSummary: {
        ports: [
          { port: 22, protocol: 'tcp', state: 'open', service: { name: 'ssh' } },
          { port: 3389, protocol: 'tcp', state: 'open', service: { name: 'ms-wbt-server' } },
        ],
      },
    });

    // Detect changes
    const changes = await detectScanChanges({
      deviceId: 'dev_test',
      currentScan: newScan,
      organizationId: 'org_test',
    });

    expect(changes).toHaveLength(1);
    expect(changes[0].type).toBe('NEW_PORT');
    expect(changes[0].data.port).toBe(3389);
  });
});
```

### Unit Tests

**File**: `apps/user-application/src/server/notifications/__tests__/change-detector.test.ts`

```typescript
describe('Change Detector', () => {
  describe('diffPorts', () => {
    it('should detect new open port', () => {
      const previous = {
        ports: [{ port: 80, protocol: 'tcp', state: 'open', service: { name: 'http' } }],
      };

      const current = {
        ports: [
          { port: 80, protocol: 'tcp', state: 'open', service: { name: 'http' } },
          { port: 22, protocol: 'tcp', state: 'open', service: { name: 'ssh' } },
        ],
      };

      const changes = diffPorts(current, previous, 'dev_123', 'org_123', 'run_123');

      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('NEW_PORT');
      expect(changes[0].data.port).toBe(22);
      expect(changes[0].fingerprint).toBe('new_port:dev_123:22:tcp');
    });

    it('should assign HIGH severity to RDP port', () => {
      const previous = { ports: [] };
      const current = {
        ports: [{ port: 3389, protocol: 'tcp', state: 'open', service: { name: 'ms-wbt-server' } }],
      };

      const changes = diffPorts(current, previous, 'dev_123', 'org_123', 'run_123');

      expect(changes[0].severity).toBe('HIGH');
    });
  });

  describe('diffCVEs', () => {
    it('should detect new critical CVE', () => {
      const previous = {
        cveEnrichment: {
          os: { cves: [{ cveId: 'CVE-2023-1234', severity: 'MEDIUM', cvssScore: 5.5 }] },
        },
      };

      const current = {
        cveEnrichment: {
          os: {
            cves: [
              { cveId: 'CVE-2023-1234', severity: 'MEDIUM', cvssScore: 5.5 },
              { cveId: 'CVE-2024-5678', severity: 'CRITICAL', cvssScore: 9.8, description: 'RCE vulnerability' },
            ],
          },
        },
      };

      const changes = diffCVEs(current, previous, 'dev_123', 'org_123', 'run_123');

      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('NEW_CVE');
      expect(changes[0].severity).toBe('CRITICAL');
      expect(changes[0].data.cveId).toBe('CVE-2024-5678');
    });
  });
});
```

---
