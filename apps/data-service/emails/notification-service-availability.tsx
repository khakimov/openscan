import { buildPlainEmail, type PlainEmailLine } from './layout';

export interface ServiceAvailabilityEmailProps {
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  deviceName: string;
  port: number;
  protocol: string;
  service?: string;
  previousState: string;
  currentState: string;
  scanLink: string;
  projectName?: string;
  isDown: boolean; // true = SERVICE_DOWN, false = SERVICE_UP
  // Catalog-derived notification text (single source of truth)
  notificationTitle?: string;
  notificationMessage?: string;
}

export function ServiceAvailabilityEmail({
  severity,
  deviceName,
  port,
  protocol,
  service,
  previousState,
  currentState,
  scanLink,
  projectName,
  isDown,
  notificationTitle,
  notificationMessage,
}: ServiceAvailabilityEmailProps) {
  const serviceName = service || 'Service';
  const portDisplay = `${port}/${protocol.toUpperCase()}`;
  const emoji = isDown ? '🔴' : '🟢';
  const status = isDown ? 'OFFLINE' : 'BACK ONLINE';

  const subject = `[sec.rocks] ${emoji} ${notificationTitle ?? `${serviceName} ${status.toLowerCase()} on ${deviceName}`}`;

  const bodyLines: PlainEmailLine[] = [];

  // Use catalog text if available (preferred - single source of truth)
  if (notificationTitle && notificationMessage) {
    bodyLines.push(
      notificationTitle,
      '',
      notificationMessage,
      '',
      `Port: ${portDisplay}`,
      `Previous state: ${previousState}`,
      `Current state: ${currentState}`,
      '',
      `Severity: ${severity}`
    );
  } else {
    // Fallback for legacy notifications without catalog text
    if (isDown) {
      bodyLines.push(
        `${serviceName} on ${deviceName} stopped responding.`,
        '',
        `Port: ${portDisplay}`,
        `Previous: ${previousState} → Current: ${currentState}`,
        '',
        `This service was operational in the previous scan but is now unreachable.`,
        '',
        `Severity: ${severity}`
      );
    } else {
      bodyLines.push(
        `${serviceName} on ${deviceName} is reachable again.`,
        '',
        `Port: ${portDisplay}`,
        `Previous: ${previousState} → Current: ${currentState}`,
        '',
        `This service has recovered and is now responding to scans.`,
        '',
        `Severity: ${severity}`
      );
    }
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
