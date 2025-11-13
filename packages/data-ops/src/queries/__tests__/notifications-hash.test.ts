import { describe, it, expect } from 'vitest';
import { hashMessage } from '../notifications';

/**
 * Hash Function Tests (No DB Required)
 *
 * Tests the messageHash helper function in isolation.
 * Verifies full 64-char SHA-256 output (Phase 2 requirement).
 */

describe('hashMessage - SHA-256 Helper', () => {
  it('should generate full 64-char SHA-256 hash', () => {
    const hash = hashMessage('Test title', 'Test message');

    // Full SHA-256 digest is 64 hex characters
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should produce consistent hashes for same input', () => {
    const hash1 = hashMessage('Same title', 'Same message');
    const hash2 = hashMessage('Same title', 'Same message');

    expect(hash1).toBe(hash2);
  });

  it('should produce different hashes for different inputs', () => {
    const hash1 = hashMessage('Title 1', 'Message 1');
    const hash2 = hashMessage('Title 2', 'Message 2');

    expect(hash1).not.toBe(hash2);
  });

  it('should handle null message gracefully', () => {
    const hash1 = hashMessage('Title only', null);
    const hash2 = hashMessage('Title only', undefined);
    const hash3 = hashMessage('Title only', '');

    // All null/undefined/empty should produce same hash
    expect(hash1).toBe(hash2);
    expect(hash2).toBe(hash3);
  });

  it('should use full digest not truncated (Phase 2 fix)', () => {
    const hash = hashMessage('Port 22 opened', 'SSH service detected');

    // Verify it's NOT 16 chars (old bug)
    expect(hash).not.toHaveLength(16);

    // Verify it IS 64 chars (Phase 2 fix)
    expect(hash).toHaveLength(64);
  });
});
