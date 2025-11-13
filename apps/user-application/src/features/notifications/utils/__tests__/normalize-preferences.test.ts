import { describe, it, expect } from 'vitest';
import { normalizeNotificationPreferences } from '../normalize-preferences';

describe('normalizeNotificationPreferences', () => {
  it('marks alerts enabled when severities exist', () => {
    const result = normalizeNotificationPreferences({ severities: ['HIGH'] });
    expect(result.vulnerabilityAlertsEnabled).toBe(true);
    expect(result.alertSeverities).toEqual(['HIGH']);
  });

  it('disables alerts when severities empty', () => {
    const result = normalizeNotificationPreferences({ severities: [] });
    expect(result.vulnerabilityAlertsEnabled).toBe(false);
    expect(result.alertSeverities).toEqual([]);
  });

  it('filters out invalid severities (security whitelist)', () => {
    const result = normalizeNotificationPreferences({
      severities: ['CRITICAL', 'INVALID', 'HIGH', 'UNKNOWN'],
    });
    expect(result.alertSeverities).toEqual(['CRITICAL', 'HIGH']);
    expect(result.vulnerabilityAlertsEnabled).toBe(true);
  });

  it('handles null input with safe defaults', () => {
    const result = normalizeNotificationPreferences(null);
    expect(result.vulnerabilityAlertsEnabled).toBe(false);
    expect(result.alertSeverities).toEqual([]);
    expect(result.weeklySummaryEnabled).toBe(true);
  });

  it('handles undefined input with safe defaults', () => {
    const result = normalizeNotificationPreferences(undefined);
    expect(result.vulnerabilityAlertsEnabled).toBe(false);
    expect(result.alertSeverities).toEqual([]);
    expect(result.weeklySummaryEnabled).toBe(true);
  });

  it('respects explicit vulnerabilityAlertsEnabled flag', () => {
    const result = normalizeNotificationPreferences({
      severities: [],
      vulnerabilityAlertsEnabled: true,
    });
    expect(result.vulnerabilityAlertsEnabled).toBe(true);
    expect(result.alertSeverities).toEqual([]);
  });

  it('accepts all allowed severities', () => {
    const result = normalizeNotificationPreferences({
      severities: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'],
    });
    expect(result.alertSeverities).toEqual(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO']);
    expect(result.vulnerabilityAlertsEnabled).toBe(true);
  });

  it('defaults weeklySummaryEnabled to true', () => {
    const result = normalizeNotificationPreferences({
      severities: ['HIGH'],
    });
    expect(result.weeklySummaryEnabled).toBe(true);
  });

  it('respects explicit weeklySummaryEnabled=false', () => {
    const result = normalizeNotificationPreferences({
      severities: ['HIGH'],
      weeklySummaryEnabled: false,
    });
    expect(result.weeklySummaryEnabled).toBe(false);
  });
});
