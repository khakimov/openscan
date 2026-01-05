import { buildPlainEmail, type PlainEmailLine } from './layout';

export interface ServiceDriftEmailProps {
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  deviceName: string;
  portDisplay: string;
  protocol: string;
  oldService?: {
    name?: string;
    product?: string;
    version?: string;
  };
  newService?: {
    name?: string;
    product?: string;
    version?: string;
  };
  scanLink: string;
  projectName?: string;
  // Catalog-derived notification text (single source of truth)
  notificationTitle?: string;
  notificationMessage?: string;
}

export function ServiceDriftEmail({
  severity,
  deviceName,
  portDisplay,
  protocol,
  oldService,
  newService,
  scanLink,
  projectName,
  notificationTitle,
  notificationMessage,
}: ServiceDriftEmailProps) {
  const subject = `[sec.rocks] ${notificationTitle ?? `Service drift on ${deviceName}`}`;

  const portLine = `${portDisplay}/${protocol}`;

  const bodyLines: PlainEmailLine[] = [];

  // Use catalog text if available (preferred - single source of truth)
  if (notificationTitle && notificationMessage) {
    bodyLines.push(
      `On ${deviceName} detected service drift on port ${portLine}.`,
      '',
      notificationMessage, // Catalog description (product switch, version change, etc.)
      '',
      `Severity: ${severity}`
    );
  } else {
    // Fallback for legacy notifications without catalog text
    const oldLabel = oldService?.product || oldService?.name || 'unknown';
    const newLabel = newService?.product || newService?.name || 'unknown';
    const oldVersion = oldService?.version ? ` ${oldService.version}` : '';
    const newVersion = newService?.version ? ` ${newService.version}` : '';
    const portLineFormatted = `${portDisplay}/${protocol.toUpperCase()}`; // Uppercase protocol for consistency

    bodyLines.push(
      `On ${deviceName} detected service drift on port ${portLineFormatted}.`,
      '',
      `Previous: ${oldLabel}${oldVersion}`,
      `Current: ${newLabel}${newVersion}`,
      '',
      `Severity: ${severity}`
    );
  }

  bodyLines.push('', `Review: ${scanLink}`);

  if (projectName) {
    bodyLines.push('', `Project: ${projectName}`);
  }

  return buildPlainEmail({
    subject,
    heading: subject,
    bodyLines,
  });
}
