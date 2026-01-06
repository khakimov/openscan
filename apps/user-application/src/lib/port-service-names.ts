/**
 * Friendly port-to-service name mappings for non-technical users
 * Used to display "Web Server" instead of "80/tcp (http)"
 */

export type ServiceCategory = 'web' | 'remote' | 'database' | 'email' | 'file' | 'cache' | 'message' | 'other';

export interface PortInfo {
  name: string;
  category: ServiceCategory;
  description?: string;
}

/**
 * Common ports mapped to user-friendly names and categories
 */
export const COMMON_PORTS: Record<number, PortInfo> = {
  // Web Services
  80: { name: 'Web Server (HTTP)', category: 'web' },
  443: { name: 'Web Server (HTTPS)', category: 'web' },
  8080: { name: 'Web Server (Alt)', category: 'web' },
  8443: { name: 'Web Server (Alt HTTPS)', category: 'web' },
  3000: { name: 'Development Server', category: 'web' },
  5000: { name: 'Development Server', category: 'web' },

  // Remote Access
  22: { name: 'SSH Remote Access', category: 'remote' },
  23: { name: 'Telnet (Insecure)', category: 'remote', description: 'Consider disabling - unencrypted' },
  3389: { name: 'Remote Desktop (RDP)', category: 'remote' },
  5900: { name: 'VNC Remote Desktop', category: 'remote' },

  // Databases
  3306: { name: 'MySQL Database', category: 'database' },
  5432: { name: 'PostgreSQL Database', category: 'database' },
  27017: { name: 'MongoDB Database', category: 'database' },
  1433: { name: 'SQL Server Database', category: 'database' },
  1521: { name: 'Oracle Database', category: 'database' },
  6379: { name: 'Redis Cache', category: 'cache' },
  11211: { name: 'Memcached Cache', category: 'cache' },

  // Email
  25: { name: 'Email Server (SMTP)', category: 'email' },
  465: { name: 'Email Server (SMTPS)', category: 'email' },
  587: { name: 'Email Submission', category: 'email' },
  110: { name: 'Email (POP3)', category: 'email' },
  143: { name: 'Email (IMAP)', category: 'email' },
  993: { name: 'Email (IMAPS)', category: 'email' },
  995: { name: 'Email (POP3S)', category: 'email' },

  // File Transfer
  21: { name: 'FTP File Transfer', category: 'file' },
  69: { name: 'TFTP File Transfer', category: 'file' },
  445: { name: 'Windows File Sharing', category: 'file' },
  139: { name: 'NetBIOS File Sharing', category: 'file' },
  2049: { name: 'NFS File Sharing', category: 'file' },

  // Message Queues
  5672: { name: 'RabbitMQ', category: 'message' },
  9092: { name: 'Apache Kafka', category: 'message' },

  // Other Common
  53: { name: 'DNS Server', category: 'other' },
  67: { name: 'DHCP Server', category: 'other' },
  123: { name: 'Time Server (NTP)', category: 'other' },
  161: { name: 'Network Monitoring (SNMP)', category: 'other' },
  389: { name: 'Directory Service (LDAP)', category: 'other' },
  636: { name: 'Directory Service (LDAPS)', category: 'other' },
  514: { name: 'Syslog', category: 'other' },
  8081: { name: 'HTTP Proxy', category: 'web' },
  9000: { name: 'Application Server', category: 'web' },
  9090: { name: 'Prometheus Metrics', category: 'other' },
  9100: { name: 'Node Exporter', category: 'other' },
};

/**
 * Category display information
 */
export const CATEGORY_INFO: Record<ServiceCategory, { label: string; icon: string }> = {
  web: { label: 'Web Services', icon: 'Globe' },
  remote: { label: 'Remote Access', icon: 'Terminal' },
  database: { label: 'Databases', icon: 'Database' },
  email: { label: 'Email Services', icon: 'Mail' },
  file: { label: 'File Sharing', icon: 'FolderOpen' },
  cache: { label: 'Cache Services', icon: 'Zap' },
  message: { label: 'Message Queues', icon: 'MessageSquare' },
  other: { label: 'Other Services', icon: 'HelpCircle' },
};

/**
 * Get user-friendly display name for a port
 */
export function getServiceDisplay(port: number, serviceName?: string | null): string {
  const known = COMMON_PORTS[port];
  if (known) return known.name;
  if (serviceName) {
    // Capitalize service name
    const formatted = serviceName.charAt(0).toUpperCase() + serviceName.slice(1);
    return `${formatted} (Port ${port})`;
  }
  return `Port ${port}`;
}

/**
 * Get category for a port
 */
export function getPortCategory(port: number): ServiceCategory {
  return COMMON_PORTS[port]?.category ?? 'other';
}

/**
 * Group ports by category
 */
export function groupPortsByCategory<T extends { port: number }>(
  ports: T[]
): Record<ServiceCategory, T[]> {
  const groups: Record<ServiceCategory, T[]> = {
    web: [],
    remote: [],
    database: [],
    email: [],
    file: [],
    cache: [],
    message: [],
    other: [],
  };

  for (const port of ports) {
    const category = getPortCategory(port.port);
    groups[category].push(port);
  }

  return groups;
}

/**
 * Get summary string for grouped ports
 * e.g., "Web Services, SSH, 2 others"
 */
export function getServicesSummary(ports: Array<{ port: number; service?: { name?: string } | null }>): string {
  if (ports.length === 0) return 'No services detected';

  const groups = groupPortsByCategory(ports);
  const parts: string[] = [];

  // Add web services first (most common)
  if (groups.web.length > 0) {
    parts.push(groups.web.length > 1 ? 'Web Services' : 'Web Server');
  }

  // Add remote access
  if (groups.remote.length > 0) {
    const sshPort = groups.remote.find(p => p.port === 22);
    parts.push(sshPort ? 'SSH' : 'Remote Access');
  }

  // Add databases
  if (groups.database.length > 0) {
    parts.push(groups.database.length > 1 ? 'Databases' : 'Database');
  }

  // Count remaining
  const coveredCount = groups.web.length + groups.remote.length + groups.database.length;
  const otherCount = ports.length - coveredCount;

  if (otherCount > 0) {
    parts.push(`${otherCount} other${otherCount > 1 ? 's' : ''}`);
  }

  return parts.join(', ');
}
