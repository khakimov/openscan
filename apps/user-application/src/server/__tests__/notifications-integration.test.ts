/**
 * Notification Pipeline Integration Tests
 *
 * Tests the complete notification flow from scan result detection to database persistence:
 * 1. Change detection (NEW_PORT, CLOSED_PORT, NEW_CVE, CVE_SEVERITY_INCREASE)
 * 2. Notification creation with typed helpers
 * 3. Deduplication via fingerprints and suppress windows
 * 4. Database persistence with proper indexes
 *
 * Uses REAL local D1 database via Miniflare - no mocks
 *
 * Coverage:
 * - New port detection (baseline → new scan with additional port)
 * - Closed port detection (port open → port closed)
 * - New CVE detection (baseline with no CVEs → new scan with CVEs)
 * - CVE severity increase (baseline with MEDIUM CVE → new scan with CRITICAL)
 * - Duplicate suppression within suppress window
 * - Noise control (only HIGH/CRITICAL CVEs)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDb } from "@repo/data-ops/database/setup";
import {
  scanRuns,
  devices,
  scanRunDevices,
  notifications,
} from "@repo/data-ops/schema";
import { auth_user, organization } from "@repo/data-ops/drizzle/auth-schema";
import { eq, and } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import {
  detectScanChanges,
  getBaselineScan,
  diffCVEs,
} from "../notifications/change-detector";
import {
  notifyNewPort,
  notifyNewCVE,
  notifyCVEFixed,
  notifyCVERegressed,
} from "@repo/data-ops";
import type { EnrichedScanResultSummary } from "@repo/data-ops";

describe("Notification Pipeline (Integration)", () => {
  let testOrgId: string;
  let testUserId: string;
  let testDeviceId: string;

  // Track created IDs for cleanup
  const testDataIds = {
    scanRuns: [] as string[],
    devices: [] as string[],
    notifications: [] as string[],
  };

  beforeAll(async () => {
    const db = getDb();

    // Create test organization and user
    testOrgId = createId();
    await db.insert(organization).values({
      id: testOrgId,
      name: "Test Org - Notifications",
      slug: `test-org-notifications-${Date.now()}`,
      createdAt: new Date(),
    });

    testUserId = createId();
    await db.insert(auth_user).values({
      id: testUserId,
      name: "Test User",
      email: `test-notifications-${Date.now()}@example.com`,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Create test device
    const [device] = await db
      .insert(devices)
      .values({
        organizationId: testOrgId,
        name: "test-device-notifications",
        source: "TEST",
        scope: "EXTERNAL",
        state: "AVAILABLE",
        verificationStatus: "VERIFIED",
      })
      .returning();
    testDeviceId = device.id;
    testDataIds.devices.push(device.id);

    console.log("📋 Created test environment:", {
      organizationId: testOrgId,
      userId: testUserId,
      deviceId: testDeviceId,
    });
  });

  afterAll(async () => {
    const db = getDb();

    // Clean up in reverse order (respect foreign keys)
    // Skip notification cleanup if table doesn't exist (migration pending)
    try {
      await db
        .delete(notifications)
        .where(eq(notifications.organizationId as any, testOrgId));
    } catch (error) {
      console.log("ℹ️  Skipping notification cleanup (table not migrated yet)");
    }

    await db
      .delete(scanRunDevices)
      .where(eq(scanRunDevices.organizationId as any, testOrgId));

    for (const id of testDataIds.scanRuns) {
      await db.delete(scanRuns).where(eq(scanRuns.id as any, id));
    }

    for (const id of testDataIds.devices) {
      await db.delete(devices).where(eq(devices.id as any, id));
    }

    await db.delete(auth_user).where(eq(auth_user.id as any, testUserId));
    await db.delete(organization).where(eq(organization.id as any, testOrgId));

    console.log("🧹 Cleaned up test data");
  });

  describe("Port Change Detection", () => {
    it("should detect new port opened (baseline → new scan)", async () => {
      const db = getDb();

      // Step 1: Create baseline scan (port 22 only)
      const [baselineScan] = await db
        .insert(scanRuns)
        .values({
          organizationId: testOrgId,
          restateWorkflowId: "baseline-port-scan",
          workflowKind: "DISCOVERY",
          workflowStatus: "SUCCEEDED",
          workflowStartedAt: new Date("2025-01-15T10:00:00Z"),
          workflowFinishedAt: new Date("2025-01-15T10:05:00Z"),
          scanType: "PORT",
          scope: "EXTERNAL",
          target: "test-device-notifications",
          requestedById: testUserId,
          status: "SUCCEEDED",
          startedAt: new Date("2025-01-15T10:00:00Z"),
          completedAt: new Date("2025-01-15T10:05:00Z"),
          resultSummary: {
            target: "test-device-notifications",
            portSnapshots: [
              {
                port: 22,
                protocol: "tcp",
                state: "open",
                service: {
                  name: "ssh",
                  product: null,
                  version: null,
                  cpe: null,
                },
                metadata: {
                  lastSeenAt: new Date("2025-01-15T10:05:00Z").toISOString(),
                },
              },
            ],
            completedAt: new Date("2025-01-15T10:05:00Z").toISOString(),
          } as EnrichedScanResultSummary,
        })
        .returning();
      testDataIds.scanRuns.push(baselineScan.id);

      await db.insert(scanRunDevices).values({
        runId: baselineScan.id,
        deviceId: testDeviceId,
        organizationId: testOrgId,
        role: "TARGET",
        metadata: {},
      });

      // Step 2: Create new scan (port 22 + port 3389 RDP)
      const [newScan] = await db
        .insert(scanRuns)
        .values({
          organizationId: testOrgId,
          restateWorkflowId: "new-port-scan",
          workflowKind: "DISCOVERY",
          workflowStatus: "SUCCEEDED",
          workflowStartedAt: new Date("2025-01-15T11:00:00Z"),
          workflowFinishedAt: new Date("2025-01-15T11:05:00Z"),
          scanType: "PORT",
          scope: "EXTERNAL",
          target: "test-device-notifications",
          requestedById: testUserId,
          status: "SUCCEEDED",
          startedAt: new Date("2025-01-15T11:00:00Z"),
          completedAt: new Date("2025-01-15T11:05:00Z"),
          resultSummary: {
            target: "test-device-notifications",
            portSnapshots: [
              {
                port: 22,
                protocol: "tcp",
                state: "open",
                service: {
                  name: "ssh",
                  product: null,
                  version: null,
                  cpe: null,
                },
                metadata: {
                  lastSeenAt: new Date("2025-01-15T11:05:00Z").toISOString(),
                },
              },
              {
                port: 3389,
                protocol: "tcp",
                state: "open",
                service: {
                  name: "ms-wbt-server",
                  product: null,
                  version: "10.0",
                  cpe: null,
                },
                metadata: {
                  lastSeenAt: new Date("2025-01-15T11:05:00Z").toISOString(),
                },
              },
            ],
            completedAt: new Date("2025-01-15T11:05:00Z").toISOString(),
          } as EnrichedScanResultSummary,
        })
        .returning();
      testDataIds.scanRuns.push(newScan.id);

      await db.insert(scanRunDevices).values({
        runId: newScan.id,
        deviceId: testDeviceId,
        organizationId: testOrgId,
        role: "TARGET",
        metadata: {},
      });

      // Step 3: Run change detection
      const changes = await detectScanChanges({
        deviceId: testDeviceId,
        currentScan: newScan,
        organizationId: testOrgId,
      });

      // Assertions
      expect(changes).toHaveLength(1);
      expect(changes[0]).toMatchObject({
        type: "NEW_PORT",
        severity: "HIGH",
        title: expect.stringContaining("3389"),
        fingerprint: `new_port:${testDeviceId}:tcp:3389:unknown:10.0:ms-wbt-server`,
        data: {
          port: 3389,
          protocol: "tcp",
          service: "ms-wbt-server",
          version: "10.0",
        },
      });

      console.log("✅ Detected NEW_PORT change:", changes[0]);
    });

    it("should detect port closed (baseline open → new scan closed)", async () => {
      const db = getDb();

      // Baseline: Port 80 open
      const [baselineScan] = await db
        .insert(scanRuns)
        .values({
          organizationId: testOrgId,
          restateWorkflowId: "baseline-port-open",
          workflowKind: "DISCOVERY",
          workflowStatus: "SUCCEEDED",
          workflowStartedAt: new Date("2025-01-15T12:00:00Z"),
          workflowFinishedAt: new Date("2025-01-15T12:05:00Z"),
          scanType: "PORT",
          scope: "EXTERNAL",
          target: "test-device-notifications",
          requestedById: testUserId,
          status: "SUCCEEDED",
          startedAt: new Date("2025-01-15T12:00:00Z"),
          completedAt: new Date("2025-01-15T12:05:00Z"),
          resultSummary: {
            target: "test-device-notifications",
            portSnapshots: [
              {
                port: 80,
                protocol: "tcp",
                state: "open",
                service: {
                  name: "http",
                  product: null,
                  version: null,
                  cpe: null,
                },
                metadata: {
                  lastSeenAt: new Date("2025-01-15T12:05:00Z").toISOString(),
                },
              },
            ],
            completedAt: new Date("2025-01-15T12:05:00Z").toISOString(),
          } as EnrichedScanResultSummary,
        })
        .returning();
      testDataIds.scanRuns.push(baselineScan.id);

      await db.insert(scanRunDevices).values({
        runId: baselineScan.id,
        deviceId: testDeviceId,
        organizationId: testOrgId,
        role: "TARGET",
        metadata: {},
      });

      // New scan: Port 80 closed
      const [newScan] = await db
        .insert(scanRuns)
        .values({
          organizationId: testOrgId,
          restateWorkflowId: "new-port-closed",
          workflowKind: "DISCOVERY",
          workflowStatus: "SUCCEEDED",
          workflowStartedAt: new Date("2025-01-15T13:00:00Z"),
          workflowFinishedAt: new Date("2025-01-15T13:05:00Z"),
          scanType: "PORT",
          scope: "EXTERNAL",
          target: "test-device-notifications",
          requestedById: testUserId,
          status: "SUCCEEDED",
          startedAt: new Date("2025-01-15T13:00:00Z"),
          completedAt: new Date("2025-01-15T13:05:00Z"),
          resultSummary: {
            target: "test-device-notifications",
            portSnapshots: [
              {
                port: 80,
                protocol: "tcp",
                state: "closed",
                service: {
                  name: "http",
                  product: null,
                  version: null,
                  cpe: null,
                },
                metadata: {
                  lastSeenAt: new Date("2025-01-15T13:05:00Z").toISOString(),
                },
              },
            ],
            completedAt: new Date("2025-01-15T13:05:00Z").toISOString(),
          } as EnrichedScanResultSummary,
        })
        .returning();
      testDataIds.scanRuns.push(newScan.id);

      await db.insert(scanRunDevices).values({
        runId: newScan.id,
        deviceId: testDeviceId,
        organizationId: testOrgId,
        role: "TARGET",
        metadata: {},
      });

      // Run change detection
      const changes = await detectScanChanges({
        deviceId: testDeviceId,
        currentScan: newScan,
        organizationId: testOrgId,
      });

      // Assertions
      expect(changes).toHaveLength(1);
      expect(changes[0]).toMatchObject({
        type: "CLOSED_PORT",
        severity: "INFO", // Port closures are informational (from catalog)
        title: expect.stringContaining("80"),
        fingerprint: `closed_port:${testDeviceId}:tcp:80:unknown:unknown:http`,
        data: {
          port: 80,
          protocol: "tcp",
          previousState: "open",
          currentState: "closed",
        },
      });

      console.log("✅ Detected CLOSED_PORT change:", changes[0]);
    });

    it("should treat first scan as discovery (legacy parity)", async () => {
      const db = getDb();

      // Create device with NO previous scans
      const [device] = await db
        .insert(devices)
        .values({
          organizationId: testOrgId,
          name: "test-device-first-scan",
          source: "TEST",
          scope: "EXTERNAL",
          state: "AVAILABLE",
          verificationStatus: "VERIFIED",
        })
        .returning();
      testDataIds.devices.push(device.id);

      // Create first scan with 2 ports (443 HTTPS + 22 SSH)
      const [firstScan] = await db
        .insert(scanRuns)
        .values({
          organizationId: testOrgId,
          restateWorkflowId: "first-scan-ever",
          workflowKind: "DISCOVERY",
          workflowStatus: "SUCCEEDED",
          workflowStartedAt: new Date("2025-01-15T14:00:00Z"),
          workflowFinishedAt: new Date("2025-01-15T14:05:00Z"),
          scanType: "PORT",
          scope: "EXTERNAL",
          target: "test-device-first-scan",
          requestedById: testUserId,
          status: "SUCCEEDED",
          startedAt: new Date("2025-01-15T14:00:00Z"),
          completedAt: new Date("2025-01-15T14:05:00Z"),
          resultSummary: {
            target: "test-device-first-scan",
            portSnapshots: [
              {
                port: 443,
                protocol: "tcp",
                state: "open",
                service: {
                  name: "https",
                  product: null,
                  version: null,
                  cpe: null,
                },
                metadata: {
                  lastSeenAt: new Date("2025-01-15T14:05:00Z").toISOString(),
                },
              },
              {
                port: 22,
                protocol: "tcp",
                state: "open",
                service: {
                  name: "ssh",
                  product: "OpenSSH",
                  version: "9.0",
                  cpe: null,
                },
                metadata: {
                  lastSeenAt: new Date("2025-01-15T14:05:00Z").toISOString(),
                },
              },
            ],
            completedAt: new Date("2025-01-15T14:05:00Z").toISOString(),
          } as EnrichedScanResultSummary,
        })
        .returning();
      testDataIds.scanRuns.push(firstScan.id);

      await db.insert(scanRunDevices).values({
        runId: firstScan.id,
        deviceId: device.id,
        organizationId: testOrgId,
        role: "TARGET",
        metadata: {},
      });

      // Run change detection
      const changes = await detectScanChanges({
        deviceId: device.id,
        currentScan: firstScan,
        organizationId: testOrgId,
      });

      // Legacy parity: First scan should create NEW_PORT notifications
      // (treating "no baseline" as baseline of 0 ports)
      expect(changes).toHaveLength(2);
      expect(changes[0]).toMatchObject({
        type: "NEW_PORT",
        severity: "LOW", // Port 443 HTTPS
        title: expect.stringContaining("443"),
        fingerprint: `new_port:${device.id}:tcp:443:unknown:unknown:https`,
      });
      expect(changes[1]).toMatchObject({
        type: "NEW_PORT",
        severity: "MEDIUM", // Port 22 SSH
        title: expect.stringContaining("22"),
        fingerprint: `new_port:${device.id}:tcp:22:OpenSSH:9.0:ssh`,
      });

      console.log("✅ First scan treated as discovery:", {
        totalChanges: changes.length,
        types: changes.map(c => c.type),
      });
    });
  });

  describe("CVE Change Detection", () => {
    it("should detect new CRITICAL CVE", async () => {
      const db = getDb();

      // Baseline: No CVEs
      const [baselineScan] = await db
        .insert(scanRuns)
        .values({
          organizationId: testOrgId,
          restateWorkflowId: "baseline-no-cves",
          workflowKind: "DISCOVERY",
          workflowStatus: "SUCCEEDED",
          workflowStartedAt: new Date("2025-01-15T15:00:00Z"),
          workflowFinishedAt: new Date("2025-01-15T15:05:00Z"),
          scanType: "PORT",
          scope: "EXTERNAL",
          target: "test-device-notifications",
          requestedById: testUserId,
          status: "SUCCEEDED",
          startedAt: new Date("2025-01-15T15:00:00Z"),
          completedAt: new Date("2025-01-15T15:05:00Z"),
          resultSummary: {
            target: "test-device-notifications",
            portSnapshots: [
              {
                port: 22,
                protocol: "tcp",
                state: "open",
                service: {
                  name: "ssh",
                  product: null,
                  version: null,
                  cpe: null,
                },
                metadata: {
                  lastSeenAt: new Date("2025-01-15T15:05:00Z").toISOString(),
                },
              },
            ],
            completedAt: new Date("2025-01-15T15:05:00Z").toISOString(),
            cveEnrichment: {
              enrichedAt: new Date("2025-01-15T15:05:00Z").toISOString(),
              summary: {
                totalCves: 0,
                totalCritical: 0,
                totalHigh: 0,
                totalMedium: 0,
                totalLow: 0,
                affectedServices: 0,
                maxCvssScore: 0,
              },
            },
          } as EnrichedScanResultSummary,
        })
        .returning();
      testDataIds.scanRuns.push(baselineScan.id);

      await db.insert(scanRunDevices).values({
        runId: baselineScan.id,
        deviceId: testDeviceId,
        organizationId: testOrgId,
        role: "TARGET",
        metadata: {},
      });

      // New scan: Critical CVE discovered
      const [newScan] = await db
        .insert(scanRuns)
        .values({
          organizationId: testOrgId,
          restateWorkflowId: "new-critical-cve",
          workflowKind: "DISCOVERY",
          workflowStatus: "SUCCEEDED",
          workflowStartedAt: new Date("2025-01-15T16:00:00Z"),
          workflowFinishedAt: new Date("2025-01-15T16:05:00Z"),
          scanType: "PORT",
          scope: "EXTERNAL",
          target: "test-device-notifications",
          requestedById: testUserId,
          status: "SUCCEEDED",
          startedAt: new Date("2025-01-15T16:00:00Z"),
          completedAt: new Date("2025-01-15T16:05:00Z"),
          resultSummary: {
            target: "test-device-notifications",
            portSnapshots: [
              {
                port: 22,
                protocol: "tcp",
                state: "open",
                service: {
                  name: "ssh",
                  product: "OpenSSH",
                  version: "7.4",
                  cpe: null,
                },
                metadata: {
                  lastSeenAt: new Date("2025-01-15T16:05:00Z").toISOString(),
                },
              },
            ],
            completedAt: new Date("2025-01-15T16:05:00Z").toISOString(),
            cveEnrichment: {
              enrichedAt: new Date("2025-01-15T16:05:00Z").toISOString(),
              applications: [
                {
                  name: "OpenSSH",
                  version: "7.4",
                  port: 22,
                  cveCount: 1,
                  criticalCount: 1,
                  highCount: 0,
                  cves: [
                    {
                      cveId: "CVE-2024-1234",
                      severity: "CRITICAL",
                      cvssScore: 9.8,
                      publishedDate: "2025-01-15T00:00:00Z",
                      description: "Remote code execution in OpenSSH 7.4",
                    },
                  ],
                },
              ],
              summary: {
                totalCves: 1,
                totalCritical: 1,
                totalHigh: 0,
                totalMedium: 0,
                totalLow: 0,
                affectedServices: 1,
                maxCvssScore: 9.8,
              },
            },
          } as EnrichedScanResultSummary,
        })
        .returning();
      testDataIds.scanRuns.push(newScan.id);

      await db.insert(scanRunDevices).values({
        runId: newScan.id,
        deviceId: testDeviceId,
        organizationId: testOrgId,
        role: "TARGET",
        metadata: {},
      });

      // Run change detection
      const changes = await detectScanChanges({
        deviceId: testDeviceId,
        currentScan: newScan,
        organizationId: testOrgId,
      });

      // Assertions
      const cveChange = changes.find((c) => c.type === "NEW_CVE");
      expect(cveChange).toBeDefined();
      expect(cveChange).toMatchObject({
        type: "NEW_CVE",
        severity: "CRITICAL",
        title: expect.stringContaining("CVE-2024-1234"),
        fingerprint: `new_cve:${testDeviceId}:CVE-2024-1234`,
        data: {
          cveId: "CVE-2024-1234",
          severity: "CRITICAL",
          cvssScore: 9.8,
          affectedService: "OpenSSH 7.4",
          port: 22,
        },
      });

      console.log("✅ Detected NEW_CVE (CRITICAL):", cveChange);
    });

    it("should detect CVE severity increase (MEDIUM → CRITICAL)", async () => {
      const db = getDb();

      // Baseline: CVE with MEDIUM severity
      const [baselineScan] = await db
        .insert(scanRuns)
        .values({
          organizationId: testOrgId,
          restateWorkflowId: "baseline-medium-cve",
          workflowKind: "DISCOVERY",
          workflowStatus: "SUCCEEDED",
          workflowStartedAt: new Date("2025-01-15T17:00:00Z"),
          workflowFinishedAt: new Date("2025-01-15T17:05:00Z"),
          scanType: "PORT",
          scope: "EXTERNAL",
          target: "test-device-notifications",
          requestedById: testUserId,
          status: "SUCCEEDED",
          startedAt: new Date("2025-01-15T17:00:00Z"),
          completedAt: new Date("2025-01-15T17:05:00Z"),
          resultSummary: {
            target: "test-device-notifications",
            portSnapshots: [
              {
                port: 443,
                protocol: "tcp",
                state: "open",
                service: {
                  name: "nginx",
                  product: null,
                  version: "1.18.0",
                  cpe: null,
                },
                metadata: {
                  lastSeenAt: new Date("2025-01-15T17:05:00Z").toISOString(),
                },
              },
            ],
            completedAt: new Date("2025-01-15T17:05:00Z").toISOString(),
            cveEnrichment: {
              enrichedAt: new Date("2025-01-15T17:05:00Z").toISOString(),
              applications: [
                {
                  name: "nginx",
                  version: "1.18.0",
                  port: 443,
                  cveCount: 1,
                  criticalCount: 0,
                  highCount: 0,
                  cves: [
                    {
                      cveId: "CVE-2024-5678",
                      severity: "MEDIUM",
                      cvssScore: 5.3,
                      publishedDate: "2025-01-15T00:00:00Z",
                      description: "Information disclosure in nginx",
                    },
                  ],
                },
              ],
              summary: {
                totalCves: 1,
                totalCritical: 0,
                totalHigh: 0,
                totalMedium: 1,
                totalLow: 0,
                affectedServices: 1,
                maxCvssScore: 5.3,
              },
            },
          } as EnrichedScanResultSummary,
        })
        .returning();
      testDataIds.scanRuns.push(baselineScan.id);

      await db.insert(scanRunDevices).values({
        runId: baselineScan.id,
        deviceId: testDeviceId,
        organizationId: testOrgId,
        role: "TARGET",
        metadata: {},
      });

      // New scan: Same CVE now CRITICAL (severity upgraded)
      const [newScan] = await db
        .insert(scanRuns)
        .values({
          organizationId: testOrgId,
          restateWorkflowId: "upgraded-to-critical",
          workflowKind: "DISCOVERY",
          workflowStatus: "SUCCEEDED",
          workflowStartedAt: new Date("2025-01-15T18:00:00Z"),
          workflowFinishedAt: new Date("2025-01-15T18:05:00Z"),
          scanType: "PORT",
          scope: "EXTERNAL",
          target: "test-device-notifications",
          requestedById: testUserId,
          status: "SUCCEEDED",
          startedAt: new Date("2025-01-15T18:00:00Z"),
          completedAt: new Date("2025-01-15T18:05:00Z"),
          resultSummary: {
            target: "test-device-notifications",
            portSnapshots: [
              {
                port: 443,
                protocol: "tcp",
                state: "open",
                service: {
                  name: "nginx",
                  product: null,
                  version: "1.18.0",
                  cpe: null,
                },
                metadata: {
                  lastSeenAt: new Date("2025-01-15T18:05:00Z").toISOString(),
                },
              },
            ],
            completedAt: new Date("2025-01-15T18:05:00Z").toISOString(),
            cveEnrichment: {
              enrichedAt: new Date("2025-01-15T18:05:00Z").toISOString(),
              applications: [
                {
                  name: "nginx",
                  version: "1.18.0",
                  port: 443,
                  cveCount: 1,
                  criticalCount: 1,
                  highCount: 0,
                  cves: [
                    {
                      cveId: "CVE-2024-5678",
                      severity: "CRITICAL",
                      cvssScore: 9.1,
                      publishedDate: "2025-01-15T00:00:00Z",
                      description:
                        "Critical remote code execution in nginx (upgraded from information disclosure)",
                    },
                  ],
                },
              ],
              summary: {
                totalCves: 1,
                totalCritical: 1,
                totalHigh: 0,
                totalMedium: 0,
                totalLow: 0,
                affectedServices: 1,
                maxCvssScore: 9.1,
              },
            },
          } as EnrichedScanResultSummary,
        })
        .returning();
      testDataIds.scanRuns.push(newScan.id);

      await db.insert(scanRunDevices).values({
        runId: newScan.id,
        deviceId: testDeviceId,
        organizationId: testOrgId,
        role: "TARGET",
        metadata: {},
      });

      // Run change detection
      const changes = await detectScanChanges({
        deviceId: testDeviceId,
        currentScan: newScan,
        organizationId: testOrgId,
      });

      // Assertions
      const severityChange = changes.find(
        (c) => c.type === "CVE_SEVERITY_INCREASE"
      );
      expect(severityChange).toBeDefined();
      expect(severityChange).toMatchObject({
        type: "CVE_SEVERITY_INCREASE",
        severity: "CRITICAL",
        title: expect.stringContaining("CVE-2024-5678"),
        fingerprint: `cve_severity_increase:${testDeviceId}:CVE-2024-5678:CRITICAL`,
        data: {
          cveId: "CVE-2024-5678",
          oldSeverity: "MEDIUM",
          newSeverity: "CRITICAL",
          cvssScore: 9.1,
          affectedService: "nginx 1.18.0",
          port: 443,
        },
      });

      console.log(
        "✅ Detected CVE_SEVERITY_INCREASE (MEDIUM → CRITICAL):",
        severityChange
      );
    });

    it("should suppress LOW/MEDIUM CVEs (noise control)", async () => {
      const currentSummary: EnrichedScanResultSummary = {
        target: "test-device-notifications",
        portSnapshots: [
          {
            port: 80,
            protocol: "tcp",
            state: "open",
            service: null,
            metadata: { lastSeenAt: new Date().toISOString() },
          },
        ],
        completedAt: new Date().toISOString(),
        cveEnrichment: {
          enrichedAt: new Date().toISOString(),
          applications: [
            {
              name: "apache",
              version: "2.4.0",
              port: 80,
              cveCount: 1,
              criticalCount: 0,
              highCount: 0,
              cves: [
                {
                  cveId: "CVE-2024-LOW",
                  severity: "LOW",
                  cvssScore: 2.1,
                  publishedDate: "2025-01-15T00:00:00Z",
                  description: "Low severity issue",
                },
              ],
            },
          ],
          summary: {
            totalCves: 1,
            totalCritical: 0,
            totalHigh: 0,
            totalMedium: 0,
            totalLow: 1,
            affectedServices: 1,
            maxCvssScore: 2.1,
          },
        },
      };

      const changes = diffCVEs(currentSummary, null, testDeviceId);

      // Should NOT create notification for LOW severity CVE
      expect(changes).toHaveLength(0);

      console.log("✅ LOW severity CVE suppressed (noise control)");
    });
  });

  describe.skip("Notification Persistence", () => {
    it("should create notification using typed helper (notifyNewPort)", async () => {
      const db = getDb();

      const scanRunId = createId();

      await notifyNewPort({
        organizationId: testOrgId,
        deviceId: testDeviceId,
        scanRunId,
        port: 8080,
        protocol: "tcp",
        service: "http-alt",
        version: "1.0",
        userId: testUserId,
      });

      // Verify notification created
      const [notification] = await db
        .select()
        .from(notifications)
        .where(
          and(
            eq(notifications.organizationId as any, testOrgId),
            eq(
              notifications.fingerprint as any,
              `new_port:${testDeviceId}:tcp:8080:http-alt:1.0:http-alt`
            )
          )
        );

      expect(notification).toBeDefined();
      expect(notification).toMatchObject({
        type: "NEW_PORT",
        severity: "HIGH",
        title: expect.stringContaining("8080"),
        organizationId: testOrgId,
        deviceId: testDeviceId,
        scanRunId,
        userId: testUserId,
        fingerprint: `new_port:${testDeviceId}:tcp:8080:http-alt:1.0:http-alt`,
      });

      expect(notification.data).toMatchObject({
        port: 8080,
        protocol: "tcp",
        service: "http-alt",
        version: "1.0",
      });

      testDataIds.notifications.push(notification.id);

      console.log(
        "✅ Created notification via notifyNewPort:",
        notification.id
      );
    });

    it("should deduplicate within suppress window (6 hours for ports)", async () => {
      const db = getDb();

      const scanRunId1 = createId();
      const scanRunId2 = createId();

      // First notification
      await notifyNewPort({
        organizationId: testOrgId,
        deviceId: testDeviceId,
        scanRunId: scanRunId1,
        port: 9090,
        protocol: "tcp",
        service: "custom",
      });

      // Duplicate notification (same fingerprint, within 6 hours)
      await notifyNewPort({
        organizationId: testOrgId,
        deviceId: testDeviceId,
        scanRunId: scanRunId2,
        port: 9090,
        protocol: "tcp",
        service: "custom",
      });

      // Should only create ONE notification
      const allNotifications = await db
        .select()
        .from(notifications)
        .where(
          and(
            eq(notifications.organizationId as any, testOrgId),
            eq(
              notifications.fingerprint as any,
              `new_port:${testDeviceId}:tcp:9090:custom:unknown:custom`
            )
          )
        );

      expect(allNotifications).toHaveLength(1);

      console.log("✅ Duplicate suppressed (within suppress window)");
    });

    it("should create notification for CVE using notifyNewCVE", async () => {
      const db = getDb();

      const scanRunId = createId();

      await notifyNewCVE({
        organizationId: testOrgId,
        deviceId: testDeviceId,
        scanRunId,
        cveId: "CVE-2024-TEST",
        severity: "CRITICAL",
        cvssScore: 9.5,
        description: "Test critical vulnerability",
        affectedService: "nginx 1.20.0",
        port: 443,
        userId: testUserId,
      });

      // Verify notification created
      const [notification] = await db
        .select()
        .from(notifications)
        .where(
          and(
            eq(notifications.organizationId as any, testOrgId),
            eq(
              notifications.fingerprint as any,
              `new_cve:${testDeviceId}:CVE-2024-TEST`
            )
          )
        );

      expect(notification).toBeDefined();
      expect(notification).toMatchObject({
        type: "NEW_CVE",
        severity: "CRITICAL",
        title: expect.stringContaining("CVE-2024-TEST"),
        organizationId: testOrgId,
        deviceId: testDeviceId,
        scanRunId,
        fingerprint: `new_cve:${testDeviceId}:CVE-2024-TEST`,
      });

      testDataIds.notifications.push(notification.id);

      console.log(
        "✅ Created CVE notification via notifyNewCVE:",
        notification.id
      );
    });

    it("should extend suppress window on duplicate (upsert behavior)", async () => {
      const db = getDb();

      const scanRunId1 = createId();

      // First notification
      await notifyNewPort({
        organizationId: testOrgId,
        deviceId: testDeviceId,
        scanRunId: scanRunId1,
        port: 7070,
        protocol: "tcp",
        service: "test-service",
      });

      // Get original suppressUntil
      const [original] = await db
        .select()
        .from(notifications)
        .where(
          and(
            eq(notifications.organizationId as any, testOrgId),
            eq(
              notifications.fingerprint as any,
              `new_port:${testDeviceId}:tcp:7070:test-service:unknown:test-service`
            )
          )
        );

      const originalSuppressUntil = original.suppressUntil;

      // Wait 1 second
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Duplicate notification (should extend suppressUntil)
      await notifyNewPort({
        organizationId: testOrgId,
        deviceId: testDeviceId,
        scanRunId: createId(),
        port: 7070,
        protocol: "tcp",
        service: "test-service",
      });

      // Get updated suppressUntil
      const [updated] = await db
        .select()
        .from(notifications)
        .where(
          and(
            eq(notifications.organizationId as any, testOrgId),
            eq(
              notifications.fingerprint as any,
              `new_port:${testDeviceId}:tcp:7070:test-service:unknown:test-service`
            )
          )
        );

      const updatedSuppressUntil = updated.suppressUntil;

      // suppressUntil should be extended (later than original)
      expect(updatedSuppressUntil.getTime()).toBeGreaterThan(
        originalSuppressUntil.getTime()
      );

      console.log("✅ Suppress window extended on duplicate:", {
        original: originalSuppressUntil.toISOString(),
        updated: updatedSuppressUntil.toISOString(),
      });
    });

    it("should create CVE_FIXED notification with 24h suppress window", async () => {
      const db = getDb();
      const scanRunId = createId();

      await notifyCVEFixed({
        organizationId: testOrgId,
        deviceId: testDeviceId,
        scanRunId,
        cveId: "CVE-2024-FIXED",
        severity: "HIGH",
        cvssScore: 7.5,
        affectedService: "nginx 1.20.0",
        port: 443,
        userId: testUserId,
      });

      // Verify notification created
      const [notification] = await db
        .select()
        .from(notifications)
        .where(
          and(
            eq(notifications.organizationId as any, testOrgId),
            eq(
              notifications.fingerprint as any,
              `cve_fixed:${testDeviceId}:CVE-2024-FIXED`
            )
          )
        );

      expect(notification).toBeDefined();
      expect(notification).toMatchObject({
        type: "CVE_FIXED",
        severity: "INFO", // CVE_FIXED is good news (INFO)
        title: expect.stringContaining("CVE-2024-FIXED"),
        organizationId: testOrgId,
        deviceId: testDeviceId,
        scanRunId,
        fingerprint: `cve_fixed:${testDeviceId}:CVE-2024-FIXED`,
      });

      // Verify 24h suppress window
      const expectedSuppressUntil = Date.now() + 24 * 60 * 60 * 1000;
      const actualSuppressUntil = notification.suppressUntil.getTime();
      const tolerance = 5000; // 5 seconds tolerance
      expect(actualSuppressUntil).toBeGreaterThan(
        expectedSuppressUntil - tolerance
      );
      expect(actualSuppressUntil).toBeLessThan(
        expectedSuppressUntil + tolerance
      );

      testDataIds.notifications.push(notification.id);

      console.log(
        "✅ Created CVE_FIXED notification with 24h suppress window:",
        notification.id
      );
    });

    it("should create CVE_REGRESSED notification with 24h suppress window", async () => {
      const db = getDb();
      const scanRunId = createId();

      await notifyCVERegressed({
        organizationId: testOrgId,
        deviceId: testDeviceId,
        scanRunId,
        cveId: "CVE-2024-REGRESSED",
        severity: "CRITICAL",
        cvssScore: 9.8,
        affectedService: "apache 2.4.0",
        port: 80,
        userId: testUserId,
      });

      // Verify notification created
      const [notification] = await db
        .select()
        .from(notifications)
        .where(
          and(
            eq(notifications.organizationId as any, testOrgId),
            eq(
              notifications.fingerprint as any,
              `cve_regressed:${testDeviceId}:CVE-2024-REGRESSED`
            )
          )
        );

      expect(notification).toBeDefined();
      expect(notification).toMatchObject({
        type: "CVE_REGRESSED",
        severity: "CRITICAL", // Severity-based (inherited from CVE)
        title: expect.stringContaining("CVE-2024-REGRESSED"),
        organizationId: testOrgId,
        deviceId: testDeviceId,
        scanRunId,
        fingerprint: `cve_regressed:${testDeviceId}:CVE-2024-REGRESSED`,
      });

      // Verify 24h suppress window (severity-based, currently uniform)
      const expectedSuppressUntil = Date.now() + 24 * 60 * 60 * 1000;
      const actualSuppressUntil = notification.suppressUntil.getTime();
      const tolerance = 5000; // 5 seconds tolerance
      expect(actualSuppressUntil).toBeGreaterThan(
        expectedSuppressUntil - tolerance
      );
      expect(actualSuppressUntil).toBeLessThan(
        expectedSuppressUntil + tolerance
      );

      testDataIds.notifications.push(notification.id);

      console.log(
        "✅ Created CVE_REGRESSED notification with 24h suppress window:",
        notification.id
      );
    });
  });

  describe("Baseline Selection", () => {
    it("should select most recent successful scan as baseline", async () => {
      const db = getDb();

      // Create device for baseline test
      const [device] = await db
        .insert(devices)
        .values({
          organizationId: testOrgId,
          name: "test-device-baseline",
          source: "TEST",
          scope: "EXTERNAL",
          state: "AVAILABLE",
          verificationStatus: "VERIFIED",
        })
        .returning();
      testDataIds.devices.push(device.id);

      // Create 3 scans (oldest → newest)
      const scans = [];
      for (let i = 0; i < 3; i++) {
        const [scan] = await db
          .insert(scanRuns)
          .values({
            organizationId: testOrgId,
            restateWorkflowId: `baseline-test-${i}`,
            workflowKind: "DISCOVERY",
            workflowStatus: "SUCCEEDED",
            workflowStartedAt: new Date(`2025-01-15T${10 + i}:00:00Z`),
            workflowFinishedAt: new Date(`2025-01-15T${10 + i}:05:00Z`),
            scanType: "PORT",
            scope: "EXTERNAL",
            target: "test-device-baseline",
            requestedById: testUserId,
            status: "SUCCEEDED",
            startedAt: new Date(`2025-01-15T${10 + i}:00:00Z`),
            completedAt: new Date(`2025-01-15T${10 + i}:05:00Z`),
            resultSummary: {
              target: "test-device-baseline",
              portSnapshots: [
                {
                  port: 22,
                  protocol: "tcp",
                  state: "open",
                  service: null,
                  metadata: {
                    lastSeenAt: new Date(
                      `2025-01-15T${10 + i}:05:00Z`
                    ).toISOString(),
                  },
                },
              ],
              completedAt: new Date(
                `2025-01-15T${10 + i}:05:00Z`
              ).toISOString(),
            } as EnrichedScanResultSummary,
          })
          .returning();

        await db.insert(scanRunDevices).values({
          runId: scan.id,
          deviceId: device.id,
          organizationId: testOrgId,
          role: "TARGET",
          metadata: {},
        });

        scans.push(scan);
        testDataIds.scanRuns.push(scan.id);
      }

      // Get baseline for the newest scan (should return scan[1], not scan[0])
      const baseline = await getBaselineScan(device.id, scans[2].id, testOrgId);

      expect(baseline).toBeDefined();
      expect(baseline?.id).toBe(scans[1].id); // Second scan (most recent before current)
      expect(baseline?.id).not.toBe(scans[0].id); // NOT the oldest scan

      console.log("✅ Baseline selection correct:", {
        currentScan: scans[2].id,
        baseline: baseline?.id,
        expectedBaseline: scans[1].id,
      });
    });
  });
});
