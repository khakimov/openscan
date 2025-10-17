import { describe, it, expect } from 'vitest';
import { validateDiscoveryTarget } from '../validation';

/**
 * Discovery Input Validation Tests (sec-27)
 *
 * These tests define the expected behavior for validating discovery targets
 * before they are passed to external tools like subfinder, amass, etc.
 *
 * Security Requirements:
 * 1. Block shell metacharacters to prevent command injection
 * 2. Validate domain format using regex
 * 3. Validate IP address formats (IPv4 and IPv6)
 * 4. Validate CIDR ranges
 * 5. Reject empty, null, or excessively long inputs
 *
 * Note: This follows TDD - tests written BEFORE implementation
 */

describe('Discovery Input Validation (sec-27)', () => {
  describe('Domain Validation', () => {
    it('should accept valid single-level domains', () => {
      expect(() => validateDiscoveryTarget('example.com', 'DOMAIN')).not.toThrow();
      expect(() => validateDiscoveryTarget('google.com', 'DOMAIN')).not.toThrow();
      expect(() => validateDiscoveryTarget('test.org', 'DOMAIN')).not.toThrow();
    });

    it('should accept valid multi-level subdomains', () => {
      expect(() => validateDiscoveryTarget('sub.example.com', 'DOMAIN')).not.toThrow();
      expect(() => validateDiscoveryTarget('api.staging.example.com', 'DOMAIN')).not.toThrow();
      expect(() => validateDiscoveryTarget('deep.nested.sub.example.com', 'DOMAIN')).not.toThrow();
    });

    it('should accept domains with hyphens', () => {
      expect(() => validateDiscoveryTarget('my-site.com', 'DOMAIN')).not.toThrow();
      expect(() => validateDiscoveryTarget('test-api.example-site.com', 'DOMAIN')).not.toThrow();
    });

    it('should accept domains with numbers', () => {
      expect(() => validateDiscoveryTarget('test123.com', 'DOMAIN')).not.toThrow();
      expect(() => validateDiscoveryTarget('api2.example.com', 'DOMAIN')).not.toThrow();
    });

    it('should reject empty domain', () => {
      expect(() => validateDiscoveryTarget('', 'DOMAIN'))
        .toThrow(/empty/i);
    });

    it('should reject domain that is too long (>253 chars)', () => {
      const longDomain = 'a'.repeat(250) + '.com'; // 254 chars
      expect(() => validateDiscoveryTarget(longDomain, 'DOMAIN'))
        .toThrow(/too long/i);
    });

    it('should reject domain with label longer than 63 chars', () => {
      const longLabel = 'a'.repeat(64) + '.example.com';
      expect(() => validateDiscoveryTarget(longLabel, 'DOMAIN'))
        .toThrow(/label too long/i);
    });

    it('should reject domains starting or ending with hyphen', () => {
      expect(() => validateDiscoveryTarget('-example.com', 'DOMAIN'))
        .toThrow(/invalid.*format/i);
      expect(() => validateDiscoveryTarget('example-.com', 'DOMAIN'))
        .toThrow(/invalid.*format/i);
    });

    it('should reject domains with consecutive dots', () => {
      expect(() => validateDiscoveryTarget('example..com', 'DOMAIN'))
        .toThrow(/invalid.*format/i);
    });

    it('should reject domains starting with dot', () => {
      expect(() => validateDiscoveryTarget('.example.com', 'DOMAIN'))
        .toThrow(/invalid.*format/i);
    });

    it('should reject domains ending with dot', () => {
      expect(() => validateDiscoveryTarget('example.com.', 'DOMAIN'))
        .toThrow(/invalid.*format/i);
    });
  });

  describe('Shell Metacharacter Protection (CRITICAL SECURITY)', () => {
    it('should reject semicolon (command chaining)', () => {
      expect(() => validateDiscoveryTarget('example.com; rm -rf /', 'DOMAIN'))
        .toThrow(/shell metacharacter|dangerous/i);
    });

    it('should reject pipe (command piping)', () => {
      expect(() => validateDiscoveryTarget('example.com | cat /etc/passwd', 'DOMAIN'))
        .toThrow(/shell metacharacter|dangerous/i);
    });

    it('should reject ampersand (background execution)', () => {
      expect(() => validateDiscoveryTarget('example.com & malicious', 'DOMAIN'))
        .toThrow(/shell metacharacter|dangerous/i);
    });

    it('should reject dollar sign (variable expansion)', () => {
      expect(() => validateDiscoveryTarget('example.com$(whoami)', 'DOMAIN'))
        .toThrow(/shell metacharacter|dangerous/i);
    });

    it('should reject backticks (command substitution)', () => {
      expect(() => validateDiscoveryTarget('example.com`whoami`', 'DOMAIN'))
        .toThrow(/shell metacharacter|dangerous/i);
    });

    it('should reject parentheses (subshell)', () => {
      expect(() => validateDiscoveryTarget('example.com(test)', 'DOMAIN'))
        .toThrow(/shell metacharacter|dangerous/i);
    });

    it('should reject angle brackets (redirection)', () => {
      expect(() => validateDiscoveryTarget('example.com > /tmp/out', 'DOMAIN'))
        .toThrow(/shell metacharacter|dangerous/i);
      expect(() => validateDiscoveryTarget('example.com < /etc/passwd', 'DOMAIN'))
        .toThrow(/shell metacharacter|dangerous/i);
    });

    it('should reject curly braces (brace expansion)', () => {
      expect(() => validateDiscoveryTarget('example.{com,org}', 'DOMAIN'))
        .toThrow(/shell metacharacter|dangerous/i);
    });

    it('should reject square brackets (globbing)', () => {
      expect(() => validateDiscoveryTarget('example[1-9].com', 'DOMAIN'))
        .toThrow(/shell metacharacter|dangerous/i);
    });

    it('should reject backslash (escaping)', () => {
      expect(() => validateDiscoveryTarget('example\\.com', 'DOMAIN'))
        .toThrow(/shell metacharacter|dangerous/i);
    });

    it('should reject exclamation mark (history expansion)', () => {
      expect(() => validateDiscoveryTarget('example.com!test', 'DOMAIN'))
        .toThrow(/shell metacharacter|dangerous/i);
    });

    it('should reject hash (comment)', () => {
      expect(() => validateDiscoveryTarget('example.com #comment', 'DOMAIN'))
        .toThrow(/shell metacharacter|dangerous/i);
    });

    it('should reject asterisk (wildcard)', () => {
      expect(() => validateDiscoveryTarget('*.example.com', 'DOMAIN'))
        .toThrow(/shell metacharacter|dangerous/i);
    });

    it('should reject question mark (wildcard)', () => {
      expect(() => validateDiscoveryTarget('example?.com', 'DOMAIN'))
        .toThrow(/shell metacharacter|dangerous/i);
    });

    it('should reject single quotes', () => {
      expect(() => validateDiscoveryTarget("example'.com", 'DOMAIN'))
        .toThrow(/shell metacharacter|dangerous/i);
    });

    it('should reject double quotes', () => {
      expect(() => validateDiscoveryTarget('example".com', 'DOMAIN'))
        .toThrow(/shell metacharacter|dangerous/i);
    });

    it('should reject newline characters', () => {
      expect(() => validateDiscoveryTarget('example.com\nmalicious', 'DOMAIN'))
        .toThrow(/shell metacharacter|dangerous/i);
    });

    it('should reject null bytes', () => {
      expect(() => validateDiscoveryTarget('example.com\0', 'DOMAIN'))
        .toThrow(/shell metacharacter|dangerous|null/i);
    });
  });

  describe('IPv4 Validation', () => {
    it('should accept valid IPv4 addresses', () => {
      expect(() => validateDiscoveryTarget('192.168.1.1', 'IP')).not.toThrow();
      expect(() => validateDiscoveryTarget('10.0.0.1', 'IP')).not.toThrow();
      expect(() => validateDiscoveryTarget('172.16.0.1', 'IP')).not.toThrow();
      expect(() => validateDiscoveryTarget('8.8.8.8', 'IP')).not.toThrow();
    });

    it('should accept edge case IPv4 addresses', () => {
      expect(() => validateDiscoveryTarget('0.0.0.0', 'IP')).not.toThrow();
      expect(() => validateDiscoveryTarget('255.255.255.255', 'IP')).not.toThrow();
      expect(() => validateDiscoveryTarget('127.0.0.1', 'IP')).not.toThrow();
    });

    it('should reject invalid IPv4 octets > 255', () => {
      expect(() => validateDiscoveryTarget('256.1.1.1', 'IP'))
        .toThrow(/invalid.*ip/i);
      expect(() => validateDiscoveryTarget('192.168.1.300', 'IP'))
        .toThrow(/invalid.*ip/i);
    });

    it('should reject IPv4 with too few octets', () => {
      expect(() => validateDiscoveryTarget('192.168.1', 'IP'))
        .toThrow(/invalid.*ip/i);
    });

    it('should reject IPv4 with too many octets', () => {
      expect(() => validateDiscoveryTarget('192.168.1.1.1', 'IP'))
        .toThrow(/invalid.*ip/i);
    });

    it('should reject IPv4 with non-numeric octets', () => {
      expect(() => validateDiscoveryTarget('192.168.abc.1', 'IP'))
        .toThrow(/invalid.*ip/i);
    });
  });

  describe('IPv6 Validation', () => {
    it('should accept valid full IPv6 addresses', () => {
      expect(() => validateDiscoveryTarget('2001:0db8:0000:0000:0000:0000:0000:0001', 'IP')).not.toThrow();
      expect(() => validateDiscoveryTarget('fe80:0000:0000:0000:0000:0000:0000:0001', 'IP')).not.toThrow();
    });

    it('should accept valid compressed IPv6 addresses', () => {
      expect(() => validateDiscoveryTarget('2001:db8::1', 'IP')).not.toThrow();
      expect(() => validateDiscoveryTarget('::1', 'IP')).not.toThrow();
      expect(() => validateDiscoveryTarget('::', 'IP')).not.toThrow();
      expect(() => validateDiscoveryTarget('fe80::1', 'IP')).not.toThrow();
    });

    it('should accept IPv6 with zone ID', () => {
      expect(() => validateDiscoveryTarget('fe80::1%eth0', 'IP')).not.toThrow();
    });

    it('should reject invalid IPv6 format', () => {
      expect(() => validateDiscoveryTarget('2001:db8:::1', 'IP'))
        .toThrow(/invalid.*ip/i);
      expect(() => validateDiscoveryTarget('gggg::1', 'IP'))
        .toThrow(/invalid.*ip/i);
    });
  });

  describe('CIDR Range Validation', () => {
    it('should accept valid IPv4 CIDR ranges', () => {
      expect(() => validateDiscoveryTarget('192.168.1.0/24', 'CIDR')).not.toThrow();
      expect(() => validateDiscoveryTarget('10.0.0.0/8', 'CIDR')).not.toThrow();
      expect(() => validateDiscoveryTarget('172.16.0.0/12', 'CIDR')).not.toThrow();
    });

    it('should accept valid IPv6 CIDR ranges', () => {
      expect(() => validateDiscoveryTarget('2001:db8::/32', 'CIDR')).not.toThrow();
      expect(() => validateDiscoveryTarget('fe80::/10', 'CIDR')).not.toThrow();
    });

    it('should reject CIDR with invalid prefix length', () => {
      expect(() => validateDiscoveryTarget('192.168.1.0/33', 'CIDR'))
        .toThrow(/invalid.*cidr|prefix/i);
      expect(() => validateDiscoveryTarget('192.168.1.0/-1', 'CIDR'))
        .toThrow(/invalid.*cidr|prefix/i);
    });

    it('should reject CIDR without prefix length', () => {
      expect(() => validateDiscoveryTarget('192.168.1.0/', 'CIDR'))
        .toThrow(/invalid.*cidr/i);
    });

    it('should reject CIDR with invalid IP', () => {
      expect(() => validateDiscoveryTarget('300.168.1.0/24', 'CIDR'))
        .toThrow(/invalid.*cidr|ip/i);
    });
  });

  describe('Type Mismatch Detection', () => {
    it('should reject IP when expecting DOMAIN', () => {
      expect(() => validateDiscoveryTarget('192.168.1.1', 'DOMAIN'))
        .toThrow(/expected.*domain/i);
    });

    it('should reject domain when expecting IP', () => {
      expect(() => validateDiscoveryTarget('example.com', 'IP'))
        .toThrow(/expected.*ip/i);
    });

    it('should reject non-CIDR IP when expecting CIDR', () => {
      expect(() => validateDiscoveryTarget('192.168.1.1', 'CIDR'))
        .toThrow(/expected.*cidr/i);
    });

    it('should reject CIDR when expecting plain IP', () => {
      expect(() => validateDiscoveryTarget('192.168.1.0/24', 'IP'))
        .toThrow(/expected.*ip/i);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should reject whitespace-only input', () => {
      expect(() => validateDiscoveryTarget('   ', 'DOMAIN'))
        .toThrow(/empty/i);
    });

    it('should reject input with leading/trailing whitespace', () => {
      expect(() => validateDiscoveryTarget(' example.com', 'DOMAIN'))
        .toThrow(/whitespace/i);
      expect(() => validateDiscoveryTarget('example.com ', 'DOMAIN'))
        .toThrow(/whitespace/i);
    });

    it('should reject unicode/international domain names without punycode', () => {
      expect(() => validateDiscoveryTarget('münchen.de', 'DOMAIN'))
        .toThrow(/invalid.*format|ascii/i);
    });

    it('should accept punycode encoded international domains', () => {
      expect(() => validateDiscoveryTarget('xn--mnchen-3ya.de', 'DOMAIN')).not.toThrow();
    });

    it('should provide helpful error messages', () => {
      try {
        validateDiscoveryTarget('example.com; rm -rf /', 'DOMAIN');
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error.message).toMatch(/shell metacharacter|dangerous/i);
        expect(error.message).toContain(';');
      }
    });

    it('should include the problematic input in error messages', () => {
      const invalidInput = 'malicious$(whoami).com';
      try {
        validateDiscoveryTarget(invalidInput, 'DOMAIN');
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error.message).toContain(invalidInput);
      }
    });
  });
});
