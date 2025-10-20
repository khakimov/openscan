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
 * Necto API request payload
 */
export interface NectoAPIRequest {
  /** Operating system information from port scan */
  os?: {
    name?: string;
    version?: string;
    cpe?: string[];
  };
  /** List of detected services with ports */
  services?: Array<{
    name?: string;
    product?: string;
    version?: string;
    port: number;
  }>;
}

/**
 * Necto API CVE response structure
 */
interface NectoAPICVE {
  cve_id: string;
  cvss_score: number;
  published_date: string;
  last_modified_date?: string;
  description?: string;
  cpe23_uri?: string;
  vector_string?: string;
}

/**
 * Necto API OS vulnerabilities response
 */
interface NectoAPIOSResponse {
  name: string;
  version?: string;
  cpe: string;
  vulnerabilities: NectoAPICVE[];
}

/**
 * Necto API application vulnerabilities response
 */
interface NectoAPIAppResponse {
  name: string;
  version: string;
  port: number;
  cpe: string;
  vulnerabilities: NectoAPICVE[];
}

/**
 * Necto API summary response
 */
interface NectoAPISummary {
  total_cves: number;
  critical_count: number;
  high_count: number;
  medium_count: number;
  low_count: number;
  affected_services: number;
  max_cvss_score: number;
}

/**
 * Complete Necto API response
 */
interface NectoAPIResponse {
  os?: NectoAPIOSResponse;
  applications?: NectoAPIAppResponse[];
  summary: NectoAPISummary;
}

/**
 * Necto API error response
 */
interface NectoAPIError {
  error: string;
  details?: string;
  status: number;
  retryAfter?: number;
}

/**
 * Necto API client configuration
 */
export interface NectoAPIConfig {
  /** Base URL for Necto API (default: http://127.0.0.1:5020) */
  baseUrl?: string;
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
  private readonly timeout: number;
  private readonly retries: number;
  private readonly retryDelay: number;

  constructor(config: NectoAPIConfig = {}) {
    this.baseUrl = config.baseUrl || 'http://127.0.0.1:5020';
    this.timeout = config.timeout || 30000;
    this.retries = config.retries || 3;
    this.retryDelay = config.retryDelay || 1000;
  }

  /**
   * Build request payload from port scan data
   */
  buildRequest(ports: PortScanPort[], osInfo?: PortScanOSInfo): NectoAPIRequest {
    const request: NectoAPIRequest = {};

    // Add OS information if available
    if (osInfo?.name) {
      request.os = {
        name: osInfo.name,
        version: osInfo.version,
        cpe: osInfo.cpe,
      };
    }

    // Add service information from open ports
    const openPorts = ports.filter((p) => p.state === 'open' && p.service);
    if (openPorts.length > 0) {
      request.services = openPorts.map((p) => ({
        name: p.service?.name,
        product: p.service?.product || undefined,
        version: p.service?.version || undefined,
        port: p.port,
      }));
    }

    return request;
  }

  /**
   * Map Necto API CVE to our CVEDetail type
   */
  private mapCVE(cve: NectoAPICVE): CVEDetail {
    const severity = this.calculateSeverity(cve.cvss_score);
    return {
      cveId: cve.cve_id,
      cvssScore: cve.cvss_score,
      severity,
      publishedDate: cve.published_date,
      lastModifiedDate: cve.last_modified_date,
      description: cve.description,
      cpe23Uri: cve.cpe23_uri,
      vectorString: cve.vector_string,
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
   * Transform Necto API response to CVE enrichment format
   */
  transformResponse(response: NectoAPIResponse): CVEEnrichment {
    const enrichment: CVEEnrichment = {
      enrichedAt: new Date().toISOString(),
      nectoVersion: '1.0.0', // TODO: Get from API response header
      summary: {
        totalCves: response.summary.total_cves,
        totalCritical: response.summary.critical_count,
        totalHigh: response.summary.high_count,
        totalMedium: response.summary.medium_count,
        totalLow: response.summary.low_count,
        affectedServices: response.summary.affected_services,
        maxCvssScore: response.summary.max_cvss_score,
      },
    };

    // Transform OS vulnerabilities
    if (response.os) {
      const osCves = response.os.vulnerabilities.map((cve) => this.mapCVE(cve));
      const criticalCount = osCves.filter((c) => c.severity === 'CRITICAL').length;
      const highCount = osCves.filter((c) => c.severity === 'HIGH').length;

      enrichment.os = {
        product: `${response.os.name}${response.os.version ? ` ${response.os.version}` : ''}`,
        cveCount: osCves.length,
        criticalCount,
        highCount,
        cves: osCves,
      };
    }

    // Transform application vulnerabilities
    if (response.applications && response.applications.length > 0) {
      enrichment.applications = response.applications.map((app) => {
        const appCves = app.vulnerabilities.map((cve) => this.mapCVE(cve));
        const criticalCount = appCves.filter((c) => c.severity === 'CRITICAL').length;
        const highCount = appCves.filter((c) => c.severity === 'HIGH').length;

        return {
          name: app.name,
          version: app.version,
          port: app.port,
          cveCount: appCves.length,
          criticalCount,
          highCount,
          cves: appCves,
        };
      });
    }

    return enrichment;
  }

  /**
   * Fetch CVE enrichment data from Necto API
   */
  async fetchCVEEnrichment(request: NectoAPIRequest): Promise<CVEEnrichment> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        const response = await fetch(`${this.baseUrl}/api/v1/vulnerabilities`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(request),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        // Handle error responses
        if (!response.ok) {
          const errorData = (await response.json()) as NectoAPIError;
          throw new NectoAPIClientError(
            errorData.error || `HTTP ${response.status}`,
            errorData.status || response.status,
            errorData.retryAfter,
            errorData.details
          );
        }

        // Parse and transform successful response
        const data = (await response.json()) as NectoAPIResponse;
        return this.transformResponse(data);
      } catch (error) {
        lastError = error as Error;

        // Don't retry on client errors (4xx) or abort errors
        if (error instanceof NectoAPIClientError) {
          if (error.status && error.status >= 400 && error.status < 500) {
            throw error;
          }
        }

        if ((error as Error).name === 'AbortError') {
          throw new NectoAPIClientError('Request timeout', 408);
        }

        // Wait before retrying (exponential backoff)
        if (attempt < this.retries - 1) {
          await new Promise((resolve) => setTimeout(resolve, this.retryDelay * Math.pow(2, attempt)));
        }
      }
    }

    // All retries exhausted
    throw new NectoAPIClientError(
      `Failed after ${this.retries} attempts: ${lastError?.message}`,
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
