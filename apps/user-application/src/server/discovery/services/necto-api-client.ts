/**
 * Necto API HTTP Client
 *
 * HTTP client for interacting with the Necto vulnerability mapping API.
 * Maps device metadata (OS, services, ports) to CVE vulnerabilities.
 *
 * Issue: sec-68
 */

import type {
  PortScanPort,
  PortScanOSInfo,
  CVEEnrichment,
  CVESeverity,
  CVEDetail,
} from '@repo/data-ops';

/**
 * Necto API vulnerability mapping request payload
 */
export interface NectoVulnMappingRequest {
  /** Operating system information */
  os?: {
    id: number;
    product_type: 'os';
    product_name: string;
    product_version: string;
    extra: Record<string, unknown>;
  };
  /** List of detected applications/services */
  applications?: Array<{
    id: number;
    product_type: 'application';
    product_name: string;
    product_version: string;
    extra: Record<string, unknown>;
  }>;
}

/**
 * Necto vulnerability mapping response (Step 1: Get CVE IDs)
 */
interface NectoVulnMappingResponse {
  os?: {
    id: number;
    product_type: string;
    product_name: string;
    product_version: string;
    extra: Record<string, unknown>;
    cpe: string;
    cve_list: string[];
  };
  applications?: Array<{
    id: number;
    product_type: string;
    product_name: string;
    product_version: string;
    extra: Record<string, unknown>;
    cpe: string;
    cve_list: string[];
  }>;
}

/**
 * Necto CVE details response (Step 2: Enrich CVE IDs)
 */
interface NectoCVEDetail {
  cve: string;
  docType: string;
  lastModifiedData: string;
  publishedDate: string;
  campaign: number;
  state: string;
  impact: {
    baseMetricV3?: {
      cvssV3?: {
        baseScore: number;
        baseSeverity: string;
        vectorString: string;
        attackVector: string;
        attackComplexity: string;
        privilegesRequired: string;
        userInteraction: string;
        scope: string;
        confidentialityImpact: string;
        integrityImpact: string;
        availabilityImpact: string;
      };
    };
  };
  isWeaponized: boolean;
  isExploitable: boolean;
  cveData: {
    description?: {
      descriptionData?: Array<{
        lang: string;
        value: string;
      }>;
    };
  };
  source: string;
}

/**
 * Necto API error response
 */
interface NectoAPIError {
  error?: string;
  detail?: string; // FastAPI uses 'detail' field
  details?: string;
  status?: number;
  retryAfter?: number;
}

/**
 * Necto API client configuration
 */
export interface NectoAPIConfig {
  /** Base URL for Necto API (default: http://127.0.0.1:5020) */
  baseUrl?: string;
  /** API key for authentication (default: process.env.WORKER_API_KEY) */
  apiKey?: string;
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Number of retry attempts for failed requests (default: 3) */
  retries?: number;
  /** Delay between retries in milliseconds (default: 1000) */
  retryDelay?: number;
}

/**
 * Necto API client error
 */
export class NectoAPIClientError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly retryAfter?: number,
    public readonly details?: string
  ) {
    super(message);
    this.name = 'NectoAPIClientError';
  }
}

/**
 * HTTP client for Necto vulnerability mapping API
 */
export class NectoAPIClient {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly timeout: number;
  private readonly retries: number;
  private readonly retryDelay: number;

  constructor(config: NectoAPIConfig = {}) {
    this.baseUrl = config.baseUrl || 'http://127.0.0.1:5020';
    this.apiKey = config.apiKey || process.env.WORKER_API_KEY;
    this.timeout = config.timeout || 30000;
    this.retries = config.retries || 3;
    this.retryDelay = config.retryDelay || 1000;
  }

  /**
   * Get headers with optional API key authentication
   */
  private getHeaders(): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    return headers;
  }

  /**
   * Build vulnerability mapping request from port scan data
   */
  buildRequest(ports: PortScanPort[], osInfo?: PortScanOSInfo): NectoVulnMappingRequest {
    const request: NectoVulnMappingRequest = {};

    // Always include OS field (Necto API requires it)
    // Use detected OS info if available, otherwise provide minimal default
    request.os = {
      id: 0,
      product_type: 'os',
      product_name: osInfo?.name || 'unknown',
      product_version: osInfo?.version || '',
      extra: {},
    };

    // Add application information from open ports
    const openPorts = ports.filter((p) => p.state === 'open' && p.service);
    if (openPorts.length > 0) {
      request.applications = openPorts.map((p, idx) => ({
        id: idx + 1,
        product_type: 'application',
        product_name: p.service?.product || p.service?.name || 'unknown',
        product_version: p.service?.version || '',
        extra: { port: p.port },
      }));
    }

    console.log('[NectoAPIClient] Built request:', {
      hasOS: !!request.os,
      osName: request.os?.product_name,
      applicationCount: request.applications?.length || 0,
      applications: request.applications?.map(a => ({
        name: a.product_name,
        version: a.product_version,
        port: a.extra.port
      })),
      openPortsTotal: openPorts.length,
      portsWithService: openPorts.filter(p => p.service).length
    });

    return request;
  }

  /**
   * Map Necto CVE detail to our CVEDetail type
   */
  private mapCVE(cve: NectoCVEDetail): CVEDetail {
    const cvssScore = cve.impact?.baseMetricV3?.cvssV3?.baseScore || 0;
    const severity = this.calculateSeverity(cvssScore);
    const description =
      cve.cveData?.description?.descriptionData?.[0]?.value || undefined;

    return {
      cveId: cve.cve,
      cvssScore,
      severity,
      publishedDate: cve.publishedDate,
      lastModifiedDate: cve.lastModifiedData || undefined,
      description,
      cpe23Uri: undefined, // Not available in current API response
      vectorString: cve.impact?.baseMetricV3?.cvssV3?.vectorString,
    };
  }

  /**
   * Calculate severity from CVSS score
   */
  private calculateSeverity(cvssScore: number): CVESeverity {
    if (cvssScore >= 9.0) return 'CRITICAL';
    if (cvssScore >= 7.0) return 'HIGH';
    if (cvssScore >= 4.0) return 'MEDIUM';
    return 'LOW';
  }

  /**
   * Transform CVE details to enrichment format
   */
  private transformToEnrichment(
    vulnMapping: NectoVulnMappingResponse,
    cveDetails: NectoCVEDetail[]
  ): CVEEnrichment {
    // Create a map of CVE ID to details for quick lookup
    const cveMap = new Map<string, NectoCVEDetail>();
    for (const cve of cveDetails) {
      cveMap.set(cve.cve, cve);
    }

    // Calculate summary statistics
    let totalCves = 0;
    let criticalCount = 0;
    let highCount = 0;
    let mediumCount = 0;
    let lowCount = 0;
    let maxCvssScore = 0;
    const affectedComponents = new Set<string>();

    const enrichment: CVEEnrichment = {
      enrichedAt: new Date().toISOString(),
      nectoVersion: '1.51.2',
      summary: {
        totalCves: 0,
        totalCritical: 0,
        totalHigh: 0,
        totalMedium: 0,
        totalLow: 0,
        affectedServices: 0,
        maxCvssScore: 0,
      },
    };

    // Process OS vulnerabilities
    if (vulnMapping.os && vulnMapping.os.cve_list.length > 0) {
      const osCves = vulnMapping.os.cve_list
        .map((cveId) => cveMap.get(cveId))
        .filter((cve): cve is NectoCVEDetail => cve !== undefined)
        .map((cve) => this.mapCVE(cve));

      enrichment.os = {
        product: `${vulnMapping.os.product_name} ${vulnMapping.os.product_version}`.trim(),
        cveCount: osCves.length,
        criticalCount: osCves.filter((c) => c.severity === 'CRITICAL').length,
        highCount: osCves.filter((c) => c.severity === 'HIGH').length,
        cves: osCves,
      };

      totalCves += osCves.length;
      criticalCount += enrichment.os.criticalCount;
      highCount += enrichment.os.highCount;
      mediumCount += osCves.filter((c) => c.severity === 'MEDIUM').length;
      lowCount += osCves.filter((c) => c.severity === 'LOW').length;
      affectedComponents.add('os');

      for (const cve of osCves) {
        if (cve.cvssScore > maxCvssScore) maxCvssScore = cve.cvssScore;
      }
    }

    // Process application vulnerabilities
    if (vulnMapping.applications && vulnMapping.applications.length > 0) {
      enrichment.applications = vulnMapping.applications
        .filter((app) => app.cve_list.length > 0)
        .map((app) => {
          const appCves = app.cve_list
            .map((cveId) => cveMap.get(cveId))
            .filter((cve): cve is NectoCVEDetail => cve !== undefined)
            .map((cve) => this.mapCVE(cve));

          const port = (app.extra.port as number) || 0;

          totalCves += appCves.length;
          const appCriticalCount = appCves.filter((c) => c.severity === 'CRITICAL').length;
          const appHighCount = appCves.filter((c) => c.severity === 'HIGH').length;
          criticalCount += appCriticalCount;
          highCount += appHighCount;
          mediumCount += appCves.filter((c) => c.severity === 'MEDIUM').length;
          lowCount += appCves.filter((c) => c.severity === 'LOW').length;
          affectedComponents.add(`${app.product_name}:${port}`);

          for (const cve of appCves) {
            if (cve.cvssScore > maxCvssScore) maxCvssScore = cve.cvssScore;
          }

          return {
            name: app.product_name,
            version: app.product_version,
            port,
            cveCount: appCves.length,
            criticalCount: appCriticalCount,
            highCount: appHighCount,
            cves: appCves,
          };
        });
    }

    // Update summary
    enrichment.summary = {
      totalCves,
      totalCritical: criticalCount,
      totalHigh: highCount,
      totalMedium: mediumCount,
      totalLow: lowCount,
      affectedServices: affectedComponents.size,
      maxCvssScore,
    };

    return enrichment;
  }

  /**
   * Fetch CVE enrichment data from Necto API (two-step workflow)
   */
  async fetchCVEEnrichment(request: NectoVulnMappingRequest): Promise<CVEEnrichment> {
    // Step 1: Get CVE IDs from vulnerability mapping
    const vulnMapping = await this.fetchVulnerabilityMapping(request);

    // Collect all unique CVE IDs
    const allCveIds = new Set<string>();
    if (vulnMapping.os) {
      vulnMapping.os.cve_list.forEach((id) => allCveIds.add(id));
    }
    if (vulnMapping.applications) {
      vulnMapping.applications.forEach((app) => {
        app.cve_list.forEach((id) => allCveIds.add(id));
      });
    }

    // If no CVEs found, return empty enrichment
    if (allCveIds.size === 0) {
      return {
        enrichedAt: new Date().toISOString(),
        nectoVersion: '1.51.2',
        summary: {
          totalCves: 0,
          totalCritical: 0,
          totalHigh: 0,
          totalMedium: 0,
          totalLow: 0,
          affectedServices: 0,
          maxCvssScore: 0,
        },
      };
    }

    // Step 2: Enrich CVE IDs with full details
    const cveDetails = await this.fetchCVEDetails(Array.from(allCveIds));

    // Step 3: Transform to enrichment format
    return this.transformToEnrichment(vulnMapping, cveDetails);
  }

  /**
   * Step 1: Fetch vulnerability mapping (CVE IDs)
   */
  private async fetchVulnerabilityMapping(
    request: NectoVulnMappingRequest
  ): Promise<NectoVulnMappingResponse> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        // TODO: Auto-detect OS type (linux/windows/macos) from request.os.product_name
        // For now, default to linux
        const osType = 'linux';

        const response = await fetch(
          `${this.baseUrl}/vulnerability-mapping/${osType}/`,
          {
            method: 'POST',
            headers: this.getHeaders(),
            body: JSON.stringify(request),
            signal: controller.signal,
          }
        );

        clearTimeout(timeoutId);

        if (!response.ok) {
          let errorMessage = `HTTP ${response.status}`;
          let errorDetails: string | undefined;
          let fullErrorData: any;

          try {
            const errorData = (await response.json()) as NectoAPIError;
            fullErrorData = errorData;
            errorMessage = errorData.error || errorData.detail || errorMessage;
            errorDetails = errorData.details;
          } catch {
            // If response is not JSON, try to read as text
            try {
              const errorText = await response.text();
              if (errorText) {
                errorMessage = `${errorMessage}: ${errorText}`;
              }
            } catch {
              // Ignore text parsing errors
            }
          }

          console.error('[NectoAPIClient] Vulnerability mapping failed:', {
            status: response.status,
            statusText: response.statusText,
            errorMessage,
            errorDetails,
            fullErrorResponse: fullErrorData,
            requestPayload: request
          });

          throw new NectoAPIClientError(
            errorMessage,
            response.status,
            undefined,
            errorDetails
          );
        }

        return (await response.json()) as NectoVulnMappingResponse;
      } catch (error) {
        lastError = error as Error;

        if (error instanceof NectoAPIClientError) {
          if (error.status && error.status >= 400 && error.status < 500) {
            throw error;
          }
        }

        if ((error as Error).name === 'AbortError') {
          throw new NectoAPIClientError('Request timeout', 408);
        }

        if (attempt < this.retries - 1) {
          await new Promise((resolve) =>
            setTimeout(resolve, this.retryDelay * Math.pow(2, attempt))
          );
        }
      }
    }

    throw new NectoAPIClientError(
      `Vulnerability mapping failed after ${this.retries} attempts: ${lastError?.message}`,
      500,
      undefined,
      lastError?.message
    );
  }

  /**
   * Step 2: Fetch CVE details (enrichment)
   */
  private async fetchCVEDetails(cveIds: string[]): Promise<NectoCVEDetail[]> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        const response = await fetch(`${this.baseUrl}/cve-details/`, {
          method: 'POST',
          headers: this.getHeaders(),
          body: JSON.stringify({ cve_list: cveIds }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          let errorMessage = `HTTP ${response.status}`;
          let errorDetails: string | undefined;
          let fullErrorData: any;

          try {
            const errorData = (await response.json()) as NectoAPIError;
            fullErrorData = errorData;
            errorMessage = errorData.error || errorData.detail || errorMessage;
            errorDetails = errorData.details;
          } catch {
            // If response is not JSON, try to read as text
            try {
              const errorText = await response.text();
              if (errorText) {
                errorMessage = `${errorMessage}: ${errorText}`;
              }
            } catch {
              // Ignore text parsing errors
            }
          }

          console.error('[NectoAPIClient] CVE details fetch failed:', {
            status: response.status,
            statusText: response.statusText,
            errorMessage,
            errorDetails,
            fullErrorResponse: fullErrorData,
            cveIdsRequested: cveIds.length,
            cveIdsSample: cveIds.slice(0, 5)
          });

          throw new NectoAPIClientError(
            errorMessage,
            response.status,
            undefined,
            errorDetails
          );
        }

        return (await response.json()) as NectoCVEDetail[];
      } catch (error) {
        lastError = error as Error;

        if (error instanceof NectoAPIClientError) {
          if (error.status && error.status >= 400 && error.status < 500) {
            throw error;
          }
        }

        if ((error as Error).name === 'AbortError') {
          throw new NectoAPIClientError('Request timeout', 408);
        }

        if (attempt < this.retries - 1) {
          await new Promise((resolve) =>
            setTimeout(resolve, this.retryDelay * Math.pow(2, attempt))
          );
        }
      }
    }

    throw new NectoAPIClientError(
      `CVE details fetch failed after ${this.retries} attempts: ${lastError?.message}`,
      500,
      undefined,
      lastError?.message
    );
  }

  /**
   * Enrich scan results with CVE data
   *
   * Convenience method that builds request from scan data and fetches enrichment.
   */
  async enrichScanResults(ports: PortScanPort[], osInfo?: PortScanOSInfo): Promise<CVEEnrichment> {
    const request = this.buildRequest(ports, osInfo);
    return this.fetchCVEEnrichment(request);
  }
}

/**
 * Create a Necto API client instance
 */
export function createNectoAPIClient(config?: NectoAPIConfig): NectoAPIClient {
  return new NectoAPIClient(config);
}
