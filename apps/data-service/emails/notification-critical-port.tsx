import { buildPlainEmail, type PlainEmailLine } from './layout';

export interface CriticalPortEmailProps {
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  deviceName: string;
  portDisplay: string;
  protocol: string;
  detectedService?: string;
  scanLink: string;
  projectName?: string;
  // Catalog-derived notification text (single source of truth)
  notificationTitle?: string;
  notificationMessage?: string;
}

export function CriticalPortEmail({
  severity,
  deviceName,
  portDisplay,
  protocol,
  detectedService,
  scanLink,
  projectName,
  notificationTitle,
  notificationMessage,
}: CriticalPortEmailProps) {
  const subject = `[sec.rocks] ${notificationTitle ?? `New detection on ${deviceName}`}`;
  const portLine = `${portDisplay}/${protocol.toUpperCase()}`;

  const bodyLines: PlainEmailLine[] = [];

  // Use catalog text if available (preferred - single source of truth)
  if (notificationTitle && notificationMessage) {
    bodyLines.push(
      `On ${deviceName} detected open port ${portLine}.`,
      '',
      notificationMessage, // PORT_SECURITY_MESSAGES from catalog
      '',
      `Severity: ${severity}`,
      '',
      `Review: ${scanLink}`
    );
  } else {
    // Fallback for legacy notifications without catalog text
    bodyLines.push(
      `On ${deviceName} detected open port ${portLine}.`,
      '',
      `Service: ${detectedService ?? 'Unknown'}`,
      `Severity: ${severity}`,
      '',
      `Review: ${scanLink}`
    );
  }

  return buildPlainEmail({
    subject,
    heading: subject,
    bodyLines,
  });
}
