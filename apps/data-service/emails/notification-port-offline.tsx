import { buildPlainEmail, type PlainEmailLine } from './layout';

export interface PortOfflineEmailProps {
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  deviceName: string;
  portDisplay: string;
  protocol: string;
  service?: string;
  previousState?: string;
  currentState?: string;
  scanLink: string;
  projectName?: string;
  // Catalog-derived notification text (single source of truth)
  notificationTitle?: string;
  notificationMessage?: string;
}

export function PortOfflineEmail({
  severity,
  deviceName,
  portDisplay,
  protocol,
  service,
  previousState,
  currentState,
  scanLink,
  projectName,
  notificationTitle,
  notificationMessage,
}: PortOfflineEmailProps) {
  const subject = `[sec.rocks] ${notificationTitle ?? `Port offline on ${deviceName}`}`;

  const portLine = `${portDisplay}/${protocol.toUpperCase()}`;

  const bodyLines: PlainEmailLine[] = [];

  // Use catalog text if available (preferred - single source of truth)
  if (notificationTitle && notificationMessage) {
    bodyLines.push(
      `On ${deviceName} port ${portLine} is no longer accessible.`,
      '',
      notificationMessage, // Catalog description
      '',
      `Severity: ${severity}`
    );
  } else {
    // Fallback for legacy notifications without catalog text
    const serviceLine = service ? ` (${service})` : '';
    const stateInfo =
      previousState && currentState
        ? ` State changed from ${previousState} to ${currentState}.`
        : '';

    bodyLines.push(
      `On ${deviceName} port ${portLine}${serviceLine} is no longer accessible.${stateInfo}`,
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
