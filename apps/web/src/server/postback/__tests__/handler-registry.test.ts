/**
 * Integration Tests: Handler Registry
 *
 * Tests the handler registration and lookup system.
 */

import { describe, it, expect } from 'vitest';
import { postbackRegistry } from '../handlers/registry';

describe('Postback Handler Registry', () => {
  describe('Handler Registration', () => {
    it('should have PORT_SCAN handler registered', () => {
      const handler = postbackRegistry.get('PORT_SCAN');

      expect(handler).toBeDefined();
      expect(handler?.type).toBe('PORT_SCAN');
      expect(handler?.schema).toBeDefined();
      expect(handler?.handle).toBeDefined();
      expect(typeof handler?.handle).toBe('function');
    });

    it('should have DISCOVERY handler registered', () => {
      const handler = postbackRegistry.get('DISCOVERY');

      expect(handler).toBeDefined();
      expect(handler?.type).toBe('DISCOVERY');
      expect(handler?.schema).toBeDefined();
      expect(handler?.handle).toBeDefined();
      expect(typeof handler?.handle).toBe('function');
    });

    it('should return undefined for unregistered type', () => {
      const handler = postbackRegistry.get('NONEXISTENT_TYPE');

      expect(handler).toBeUndefined();
    });
  });

  describe('Handler Discovery', () => {
    it('should list all registered handler types', () => {
      const types = postbackRegistry.getAllTypes();

      expect(types).toBeDefined();
      expect(types.length).toBeGreaterThanOrEqual(2);
      expect(types).toContain('PORT_SCAN');
      expect(types).toContain('DISCOVERY');
    });

    it('should return an array of strings', () => {
      const types = postbackRegistry.getAllTypes();

      types.forEach(type => {
        expect(typeof type).toBe('string');
      });
    });
  });

  describe('Handler Interface Compliance', () => {
    it('PORT_SCAN handler should have required properties', () => {
      const handler = postbackRegistry.get('PORT_SCAN');

      expect(handler).toBeDefined();
      expect(handler?.type).toBe('PORT_SCAN');
      expect(handler?.schema).toBeDefined();
      expect(handler?.handle).toBeDefined();

      expect(typeof handler?.schema.parse).toBe('function');
      if (handler?.schema.safeParse) {
        expect(typeof handler.schema.safeParse).toBe('function');
      }
    });

    it('DISCOVERY handler should have required properties', () => {
      const handler = postbackRegistry.get('DISCOVERY');

      expect(handler).toBeDefined();
      expect(handler?.type).toBe('DISCOVERY');
      expect(handler?.schema).toBeDefined();
      expect(handler?.handle).toBeDefined();

      expect(typeof handler?.schema.parse).toBe('function');
      if (handler?.schema.safeParse) {
        expect(typeof handler.schema.safeParse).toBe('function');
      }
    });
  });
});
