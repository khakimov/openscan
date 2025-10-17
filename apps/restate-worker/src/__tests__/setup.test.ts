import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { RestateTestEnvironment } from '@restatedev/restate-sdk-testcontainers';
import * as clients from '@restatedev/restate-sdk-clients';
import { portScanner } from '../port-scanner';

/**
 * Test setup verification
 *
 * This test ensures:
 * 1. Restate testcontainers work
 * 2. Our port scanner service can be registered
 * 3. We can call the service through Restate
 *
 * Note: Requires Docker to be running
 * Skipped by default - run with Docker available
 */
describe.skip('Restate Test Environment Setup', () => {
  let restateTestEnvironment: RestateTestEnvironment;
  let restateIngress: clients.Ingress;

  beforeAll(async () => {
    // Start Restate container and register our service
    restateTestEnvironment = await RestateTestEnvironment.start(
      (restateServer) => {
        restateServer.bind(portScanner);
      }
    );

    // Get ingress client for calling services
    restateIngress = clients.connect({ url: restateTestEnvironment.baseUrl() });
  }, 60000); // Testcontainers needs time to pull/start Docker image

  afterAll(async () => {
    if (restateTestEnvironment) {
      await restateTestEnvironment.stop();
    }
  });

  it('should start Restate test environment successfully', () => {
    expect(restateTestEnvironment).toBeDefined();
    expect(restateTestEnvironment.baseUrl()).toBeTruthy();
  });

  it('should have registered the PortScanner service', async () => {
    const client = restateIngress.serviceClient(portScanner);
    expect(client).toBeDefined();
  });

  it('should be able to call cancel handler (smoke test)', async () => {
    const client = restateIngress.serviceClient(portScanner);

    // Just test that we can call the service - cancelling non-existent scan should fail gracefully
    const result = await client.cancel({
      scanId: 'test-scan-id',
      reason: 'Test cancellation',
    });

    expect(result).toBeDefined();
    // Non-existent scan should return success: false
    expect(result.success).toBe(false);
    expect(result.message).toContain('not found');
  });
});
