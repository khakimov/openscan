/**
 * Script to fetch real CVE data from Necto API for test fixtures
 * Run with: node scripts/fetch-necto-fixtures.mjs
 */

import { writeFileSync } from 'fs';
import { join } from 'path';

const NECTO_API_URL = 'http://localhost:8000';

async function callNectoAPI(endpoint, payload) {
  const response = await fetch(`${NECTO_API_URL}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Necto API error: ${response.status} ${text}`);
  }

  return response.json();
}

async function main() {
  console.log('🔍 Fetching CVE data from Necto API...\n');

  const fixtures = {};

  // 1. Linux/Ubuntu scan - based on real data from grpc.necto.sec.rocks
  console.log('1. Testing Linux/Ubuntu scan...');
  const linuxPayload = {
    os: {
      id: 0,
      product_type: 'os',
      product_name: 'Ubuntu',
      product_version: '24.04 LTS',
      extra: {},
    },
    applications: [
      {
        id: 1,
        product_type: 'application',
        product_name: 'openssh-server',
        product_version: '9.6p1',
        extra: {
          revision: '3ubuntu13.11',
        },
      },
      {
        id: 2,
        product_type: 'application',
        product_name: 'nginx',
        product_version: '1.28.0',
        extra: {},
      },
    ],
  };

  try {
    const linuxResponse = await callNectoAPI('/vulnerability-mapping/linux/', linuxPayload);
    fixtures.linuxUbuntuWithOpenSSH = {
      request: linuxPayload,
      response: linuxResponse,
      description: 'Real Ubuntu 24.04 scan with OpenSSH 9.6p1 and nginx 1.28.0',
      cveCount: {
        os: linuxResponse.os?.cve_list?.length || 0,
        applications: linuxResponse.applications?.reduce((sum, app) => sum + (app.cve_list?.length || 0), 0) || 0,
      }
    };
    console.log(`   ✓ Linux scan complete - Found ${fixtures.linuxUbuntuWithOpenSSH.cveCount.os + fixtures.linuxUbuntuWithOpenSSH.cveCount.applications} CVEs\n`);
  } catch (error) {
    console.error('   ✗ Linux scan failed:', error.message);
  }

  // 2. Windows 11 scan
  console.log('2. Testing Windows 11 scan...');
  const windowsPayload = {
    os: {
      id: 0,
      product_type: 'os',
      product_name: 'Microsoft Windows 11 Pro',
      product_version: '10.0.22621',
      build_number: '10.0.22621',
      extra: {
        ubr: 3085,
        installed_updates: [],
        missing_updates: [],
      },
    },
    applications: [
      {
        id: 1,
        product_type: 'application',
        product_name: 'Google Chrome',
        product_version: '120.0.6099.109',
        extra: {},
      },
    ],
  };

  try {
    const windowsResponse = await callNectoAPI('/vulnerability-mapping/windows/', windowsPayload);
    fixtures.windows11WithChrome = {
      request: windowsPayload,
      response: windowsResponse,
      description: 'Windows 11 22H2 (build 22621.3085) with Chrome 120',
      cveCount: {
        os: windowsResponse.os?.cve_list?.length || 0,
        applications: windowsResponse.applications?.reduce((sum, app) => sum + (app.cve_list?.length || 0), 0) || 0,
      }
    };
    console.log(`   ✓ Windows scan complete - Found ${fixtures.windows11WithChrome.cveCount.os + fixtures.windows11WithChrome.cveCount.applications} CVEs\n`);
  } catch (error) {
    console.error('   ✗ Windows scan failed:', error.message);
  }

  // 3. macOS scan
  console.log('3. Testing macOS scan...');
  const macosPayload = {
    os: {
      id: 0,
      product_type: 'os',
      product_name: 'macOS',
      product_version: '14.2.1',
      extra: {},
    },
    applications: [
      {
        id: 1,
        product_type: 'application',
        product_name: 'Safari',
        product_version: '17.2',
        extra: {},
      },
    ],
  };

  try {
    const macosResponse = await callNectoAPI('/vulnerability-mapping/macos/', macosPayload);
    fixtures.macosSonomaWithSafari = {
      request: macosPayload,
      response: macosResponse,
      description: 'macOS 14.2.1 (Sonoma) with Safari 17.2',
      cveCount: {
        os: macosResponse.os?.cve_list?.length || 0,
        applications: macosResponse.applications?.reduce((sum, app) => sum + (app.cve_list?.length || 0), 0) || 0,
      }
    };
    console.log(`   ✓ macOS scan complete - Found ${fixtures.macosSonomaWithSafari.cveCount.os + fixtures.macosSonomaWithSafari.cveCount.applications} CVEs\n`);
  } catch (error) {
    console.error('   ✗ macOS scan failed:', error.message);
  }

  // 4. Real port scan data transformation
  console.log('4. Creating port scan data fixtures...');
  fixtures.portScanRealData = {
    description: 'Real port scan data from remote database (grpc.necto.sec.rocks)',
    data: {
      target: 'grpc.necto.sec.rocks',
      openPortCount: 5,
      ports: [
        {
          port: 22,
          protocol: 'tcp',
          state: 'open',
          service: {
            name: 'ssh',
            product: 'OpenSSH',
            version: '9.6p1 Ubuntu 3ubuntu13.11',
            extraInfo: 'Ubuntu Linux; protocol 2.0',
            method: 'probed',
            confidence: 10,
          },
        },
        {
          port: 80,
          protocol: 'tcp',
          state: 'open',
          service: {
            name: 'http',
            product: 'nginx',
            version: '1.28.0',
            method: 'probed',
            confidence: 10,
          },
        },
        {
          port: 443,
          protocol: 'tcp',
          state: 'open',
          service: {
            name: 'https',
            product: 'nginx',
            version: '1.28.0',
            method: 'probed',
            confidence: 10,
          },
        },
      ],
      osInfo: {
        name: 'Ubuntu',
        version: '24.04',
        accuracy: 95,
      },
      timing: {
        start: 1760945735541,
        end: 1760945823963,
        elapsed: 88422,
      },
    },
  };
  console.log('   ✓ Port scan fixtures created\n');

  // Save all fixtures
  const outputPath = join(process.cwd(), 'apps/restate-worker/src/__tests__/fixtures/necto-api-responses.json');
  writeFileSync(outputPath, JSON.stringify(fixtures, null, 2));

  console.log(`✨ Fixtures saved to: ${outputPath}`);
  console.log(`\n📊 Summary:`);
  console.log(`   - ${Object.keys(fixtures).length} fixtures created`);
  Object.entries(fixtures).forEach(([key, value]) => {
    if (value.cveCount) {
      console.log(`   - ${key}: ${value.cveCount.os + value.cveCount.applications} CVEs total (OS: ${value.cveCount.os}, Apps: ${value.cveCount.applications})`);
    }
  });
  console.log(`   - Ready for offline testing while traveling ✈️`);
}

main().catch(console.error);
