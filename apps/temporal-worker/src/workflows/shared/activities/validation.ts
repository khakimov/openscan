import { activityInfo } from '@temporalio/activity';
import { createLogger } from '@repo/logger';
import type { ScanTarget } from '@repo/temporal/contracts';

const logger = createLogger({ name: 'validation-activities' });

/**
 * Validate scan targets for security and correctness
 * Database-agnostic: Only validates inputs, no persistence
 */
export async function validateScanTargets(
  targets: ScanTarget[],
  tenantId: string
): Promise<{
  valid: ScanTarget[];
  invalid: Array<{ target: ScanTarget; reason: string }>;
}> {
  const activityId = activityInfo().activityId;

  logger.info(`[${activityId}] Validating ${targets.length} scan targets`, {
    tenantId,
    targetCount: targets.length,
  });

  const valid: ScanTarget[] = [];
  const invalid: Array<{ target: ScanTarget; reason: string }> = [];

  for (const target of targets) {
    try {
      const validationResult = await validateSingleTarget(target);
      if (validationResult.isValid) {
        valid.push(target);
      } else {
        invalid.push({ target, reason: validationResult.reason });
      }
    } catch (error) {
      invalid.push({
        target,
        reason: `Validation error: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  logger.info(`[${activityId}] Target validation complete`, {
    tenantId,
    validCount: valid.length,
    invalidCount: invalid.length,
  });

  return { valid, invalid };
}

/**
 * Validate a single scan target
 * Centralized validation logic with security checks
 */
async function validateSingleTarget(
  target: ScanTarget
): Promise<{ isValid: boolean; reason: string }> {
  // Basic format validation
  if (!target.value || target.value.trim().length === 0) {
    return { isValid: false, reason: 'Target value is empty' };
  }

  const value = target.value.trim();

  switch (target.type) {
    case 'IP_ADDRESS':
      return validateIpAddress(value);

    case 'DOMAIN':
      return validateDomain(value);

    case 'URL':
      return validateUrl(value);

    case 'IP_RANGE':
      return validateIpRange(value);

    case 'SUBNET':
      return validateSubnet(value);

    case 'EMAIL':
      return validateEmail(value);

    default:
      return { isValid: false, reason: `Unknown target type: ${target.type}` };
  }
}

/**
 * IP address validation with security checks
 */
function validateIpAddress(ip: string): { isValid: boolean; reason: string } {
  const ipRegex =
    /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

  if (!ipRegex.test(ip)) {
    return { isValid: false, reason: 'Invalid IP address format' };
  }

  // Security: Block private ranges that shouldn't be scanned externally
  // This is configurable based on scan scope in real implementation
  if (ip.startsWith('127.') || ip.startsWith('169.254.')) {
    return {
      isValid: false,
      reason: 'Localhost and link-local addresses not allowed',
    };
  }

  return { isValid: true, reason: '' };
}

/**
 * Domain validation with security checks
 */
function validateDomain(domain: string): { isValid: boolean; reason: string } {
  const domainRegex =
    /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;

  if (!domainRegex.test(domain)) {
    return { isValid: false, reason: 'Invalid domain format' };
  }

  if (domain.length > 253) {
    return { isValid: false, reason: 'Domain name too long' };
  }

  // Security: Block localhost variants
  if (domain.toLowerCase() === 'localhost' || domain.endsWith('.local')) {
    return { isValid: false, reason: 'Localhost domains not allowed' };
  }

  return { isValid: true, reason: '' };
}

/**
 * URL validation with security checks
 */
function validateUrl(url: string): { isValid: boolean; reason: string } {
  try {
    const parsed = new URL(url);

    // Only allow HTTP/HTTPS
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { isValid: false, reason: 'Only HTTP/HTTPS URLs allowed' };
    }

    // Validate the hostname component
    const hostnameValidation = validateDomain(parsed.hostname);
    if (!hostnameValidation.isValid) {
      // If domain validation fails, try IP validation
      const ipValidation = validateIpAddress(parsed.hostname);
      if (!ipValidation.isValid) {
        return {
          isValid: false,
          reason: `Invalid hostname: ${hostnameValidation.reason}`,
        };
      }
    }

    return { isValid: true, reason: '' };
  } catch (error) {
    return { isValid: false, reason: 'Invalid URL format' };
  }
}

/**
 * IP range validation (e.g., "192.168.1.1-192.168.1.100")
 */
function validateIpRange(range: string): { isValid: boolean; reason: string } {
  const parts = range.split('-');
  if (parts.length !== 2) {
    return { isValid: false, reason: 'IP range must be in format "start-end"' };
  }

  const startValidation = validateIpAddress(parts[0].trim());
  if (!startValidation.isValid) {
    return {
      isValid: false,
      reason: `Invalid start IP: ${startValidation.reason}`,
    };
  }

  const endValidation = validateIpAddress(parts[1].trim());
  if (!endValidation.isValid) {
    return {
      isValid: false,
      reason: `Invalid end IP: ${endValidation.reason}`,
    };
  }

  return { isValid: true, reason: '' };
}

/**
 * Subnet validation (CIDR notation)
 */
function validateSubnet(subnet: string): { isValid: boolean; reason: string } {
  const parts = subnet.split('/');
  if (parts.length !== 2) {
    return {
      isValid: false,
      reason: 'Subnet must be in CIDR format (e.g., 192.168.1.0/24)',
    };
  }

  const ipValidation = validateIpAddress(parts[0]);
  if (!ipValidation.isValid) {
    return {
      isValid: false,
      reason: `Invalid network IP: ${ipValidation.reason}`,
    };
  }

  const mask = parseInt(parts[1]);
  if (isNaN(mask) || mask < 0 || mask > 32) {
    return { isValid: false, reason: 'Invalid subnet mask (must be 0-32)' };
  }

  return { isValid: true, reason: '' };
}

/**
 * Email validation
 */
function validateEmail(email: string): { isValid: boolean; reason: string } {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailRegex.test(email)) {
    return { isValid: false, reason: 'Invalid email format' };
  }

  if (email.length > 254) {
    return { isValid: false, reason: 'Email address too long' };
  }

  return { isValid: true, reason: '' };
}
