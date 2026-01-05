import { buildPlainEmail, type PlainEmailLine } from './layout';

export interface ServerPromotedEmailProps {
  deviceName: string;
  scanLink: string;
  projectName?: string;
  // Catalog-derived notification text (single source of truth)
  notificationTitle?: string;
  notificationMessage?: string;
}

export function ServerPromotedEmail({
  deviceName,
  scanLink,
  projectName,
  notificationTitle,
  notificationMessage,
}: ServerPromotedEmailProps) {
  const subject = `[sec.rocks] ${notificationTitle ?? `${deviceName} is now monitored`}`;

  const bodyLines: PlainEmailLine[] = [];

  // Use catalog text if available (preferred - single source of truth)
  if (notificationTitle && notificationMessage) {
    bodyLines.push(
      `${deviceName} is now being monitored for security changes.`,
      '',
      notificationMessage, // Catalog description
      '',
      `View server: ${scanLink}`
    );
  } else {
    // Fallback for legacy notifications without catalog text
    bodyLines.push(
      `${deviceName} has been promoted to monitored status.`,
      '',
      'You will now receive notifications for:',
      '• New open ports detected',
      '• Ports going offline',
      '• Service version changes',
      '• New vulnerabilities (CVEs)',
      '',
      `View server: ${scanLink}`
    );
  }

  if (projectName) {
    bodyLines.push('', `Project: ${projectName}`);
  }

  return buildPlainEmail({
    subject,
    heading: subject,
    bodyLines,
  });
}
