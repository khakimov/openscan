import type { DiscoveredDevice } from '@repo/temporal/contracts';

/**
 * Mock discovery data for development/testing
 * Based on actual openpanel.dev subdomain discovery results
 */
export const mockDiscoveryData: Record<string, DiscoveredDevice[]> = {
  'openpanel.dev': [
    {
      scope: 'EXTERNAL',
      hostname: 'api.openpanel.dev',
      ipAddress: '138.199.128.236',
      discoveredAt: new Date(),
      discoveryMethod: 'subfinder',
      confidence: 1.0,
      metadata: { originalDomain: 'openpanel.dev', source: 'hackertarget' },
    },
    {
      scope: 'EXTERNAL',
      hostname: 'dashboard.openpanel.dev',
      ipAddress: '66.33.60.35',
      discoveredAt: new Date(),
      discoveryMethod: 'subfinder',
      confidence: 1.0,
      metadata: { originalDomain: 'openpanel.dev', source: 'crtsh' },
    },
    {
      scope: 'EXTERNAL',
      hostname: 'www.openpanel.dev',
      ipAddress: '76.76.21.241',
      discoveredAt: new Date(),
      discoveryMethod: 'subfinder',
      confidence: 1.0,
      metadata: { originalDomain: 'openpanel.dev', source: 'crtsh' },
    },
    {
      scope: 'EXTERNAL',
      hostname: 'api.demo.openpanel.dev',
      ipAddress: '138.199.147.65',
      discoveredAt: new Date(),
      discoveryMethod: 'assetfinder',
      confidence: 0.9,
      metadata: { originalDomain: 'openpanel.dev', source: 'hackertarget' },
    },
    {
      scope: 'EXTERNAL',
      hostname: 'worker.demo.openpanel.dev',
      ipAddress: '138.199.147.65',
      discoveredAt: new Date(),
      discoveryMethod: 'assetfinder',
      confidence: 0.9,
      metadata: { originalDomain: 'openpanel.dev', source: 'hackertarget' },
    },
    {
      scope: 'EXTERNAL',
      hostname: 'demo.openpanel.dev',
      ipAddress: '138.199.147.65',
      discoveredAt: new Date(),
      discoveryMethod: 'subfinder',
      confidence: 1.0,
      metadata: { originalDomain: 'openpanel.dev', source: 'hackertarget' },
    },
    {
      scope: 'EXTERNAL',
      hostname: 'test.openpanel.dev',
      ipAddress: '95.216.196.170',
      discoveredAt: new Date(),
      discoveryMethod: 'subfinder',
      confidence: 1.0,
      metadata: { originalDomain: 'openpanel.dev', source: 'hackertarget' },
    },
    {
      scope: 'EXTERNAL',
      hostname: 'test2.openpanel.dev',
      ipAddress: '95.216.196.170',
      discoveredAt: new Date(),
      discoveryMethod: 'subfinder',
      confidence: 1.0,
      metadata: { originalDomain: 'openpanel.dev', source: 'hackertarget' },
    },
    {
      scope: 'EXTERNAL',
      hostname: 'api.k8s.openpanel.dev',
      ipAddress: '138.199.128.236',
      discoveredAt: new Date(),
      discoveryMethod: 'subfinder',
      confidence: 1.0,
      metadata: { originalDomain: 'openpanel.dev', source: 'hackertarget' },
    },
    {
      scope: 'EXTERNAL',
      hostname: 'workers.k8s.openpanel.dev',
      ipAddress: '138.199.128.236',
      discoveredAt: new Date(),
      discoveryMethod: 'subfinder',
      confidence: 1.0,
      metadata: { originalDomain: 'openpanel.dev', source: 'hackertarget' },
    },
    {
      scope: 'EXTERNAL',
      hostname: 'grafana.k8s.openpanel.dev',
      ipAddress: '138.199.128.236',
      discoveredAt: new Date(),
      discoveryMethod: 'subfinder',
      confidence: 1.0,
      metadata: { originalDomain: 'openpanel.dev', source: 'hackertarget' },
    },
    {
      scope: 'EXTERNAL',
      hostname: 'coolify.openpanel.dev',
      ipAddress: '135.181.80.147',
      discoveredAt: new Date(),
      discoveryMethod: 'subfinder',
      confidence: 1.0,
      metadata: { originalDomain: 'openpanel.dev', source: 'hackertarget' },
    },
    {
      scope: 'EXTERNAL',
      hostname: 'status.openpanel.dev',
      ipAddress: '66.33.60.194',
      discoveredAt: new Date(),
      discoveryMethod: 'subfinder',
      confidence: 1.0,
      metadata: { originalDomain: 'openpanel.dev', source: 'crtsh' },
    },
    {
      scope: 'EXTERNAL',
      hostname: 'go.openpanel.dev',
      ipAddress: '76.76.21.21',
      discoveredAt: new Date(),
      discoveryMethod: 'subfinder',
      confidence: 1.0,
      metadata: { originalDomain: 'openpanel.dev', source: 'crtsh' },
    },
    {
      scope: 'EXTERNAL',
      hostname: 'feedback.openpanel.dev',
      ipAddress: '172.66.40.128',
      discoveredAt: new Date(),
      discoveryMethod: 'subfinder',
      confidence: 1.0,
      metadata: { originalDomain: 'openpanel.dev', source: 'crtsh' },
    },
  ],

  // Mock data for other common test domains
  'example.com': [
    {
      scope: 'EXTERNAL',
      hostname: 'www.example.com',
      ipAddress: '93.184.216.34',
      discoveredAt: new Date(),
      discoveryMethod: 'subfinder',
      confidence: 1.0,
      metadata: { originalDomain: 'example.com', source: 'mock' },
    },
    {
      scope: 'EXTERNAL',
      hostname: 'api.example.com',
      ipAddress: '93.184.216.35',
      discoveredAt: new Date(),
      discoveryMethod: 'assetfinder',
      confidence: 0.9,
      metadata: { originalDomain: 'example.com', source: 'mock' },
    },
    {
      scope: 'EXTERNAL',
      hostname: 'mail.example.com',
      ipAddress: '93.184.216.36',
      discoveredAt: new Date(),
      discoveryMethod: 'subfinder',
      confidence: 1.0,
      metadata: { originalDomain: 'example.com', source: 'mock' },
    },
  ],

  'test.com': [
    {
      scope: 'EXTERNAL',
      hostname: 'www.test.com',
      ipAddress: '1.2.3.4',
      discoveredAt: new Date(),
      discoveryMethod: 'subfinder',
      confidence: 1.0,
      metadata: { originalDomain: 'test.com', source: 'mock' },
    },
    {
      scope: 'EXTERNAL',
      hostname: 'api.test.com',
      ipAddress: '1.2.3.5',
      discoveredAt: new Date(),
      discoveryMethod: 'subfinder',
      confidence: 1.0,
      metadata: { originalDomain: 'test.com', source: 'mock' },
    },
  ],
};

/**
 * Get mock discovery results for a domain
 */
export function getMockDiscoveryResults(domain: string): DiscoveredDevice[] {
  return (
    mockDiscoveryData[domain] || [
      {
        scope: 'EXTERNAL',
        hostname: `www.${domain}`,
        ipAddress: '127.0.0.1',
        discoveredAt: new Date(),
        discoveryMethod: 'mock',
        confidence: 1.0,
        metadata: { originalDomain: domain, source: 'fallback-mock' },
      },
    ]
  );
}

/**
 * Mock ping sweep results
 */
export const mockPingSweepResults: Record<string, boolean> = {
  '138.199.128.236': true, // api.openpanel.dev
  '66.33.60.35': true, // dashboard.openpanel.dev
  '76.76.21.241': true, // www.openpanel.dev
  '138.199.147.65': true, // demo services
  '95.216.196.170': false, // test services (offline)
  '135.181.80.147': true, // coolify
  '127.0.0.1': true, // fallback
};
