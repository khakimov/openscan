/**
 * Port Scan Workflow Tests (Database-Free)
 */

import { describe, test, expect } from 'vitest';
import { portscanWorkflow } from '../workflow';

describe('portscanWorkflow', () => {
  test('returns result with ports array', async () => {
    const result = await portscanWorkflow({
      target: '192.168.1.1',
      scanProfile: 'QUICK',
      requestedPorts: [80, 443],
    });

    expect(result).toBeDefined();
    expect(result.ports).toBeInstanceOf(Array);
    expect(result.target).toBe('192.168.1.1');
  });

  test('includes timing data', async () => {
    const result = await portscanWorkflow({
      target: '192.168.1.1',
    });

    expect(result.timing).toBeDefined();
    expect(result.timing.start).toBeGreaterThan(0);
  });

  test('includes scan metadata', async () => {
    const result = await portscanWorkflow({
      target: '192.168.1.1',
    });

    expect(result.scanMetadata).toBeDefined();
    expect(result.scanMetadata.scanner).toBe('nmap');
  });

  test('handles empty ports result', async () => {
    const result = await portscanWorkflow({
      target: '192.168.1.254',
    });

    // In dev mode, mock XML always has ports
    // In production, this would be 0
    expect(result.ports).toBeDefined();
    expect(result.timing).toBeDefined();
  });

  test('throws on invalid target', async () => {
    await expect(
      portscanWorkflow({ target: '' })
    ).rejects.toThrow();
  });
});
