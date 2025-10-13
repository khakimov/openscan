export type ScanScope = 'INTERNAL' | 'EXTERNAL' | 'HYBRID';

const PRIVATE_NETWORK_REGEX = /^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.)/;

export function determineScanScope(target: string): ScanScope {
  const isPrivateIP = PRIVATE_NETWORK_REGEX.test(target);
  const isLocalhost = target === 'localhost' || target === '127.0.0.1';

  if (isPrivateIP || isLocalhost) {
    return 'INTERNAL';
  }

  return 'EXTERNAL';
}
