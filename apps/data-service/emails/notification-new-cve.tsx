import { buildPlainEmail, type PlainEmailLine } from './layout';

export interface NewCveEmailProps {
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  deviceName: string;
  cveId: string;
  cvssScore?: number;
  description?: string;
  documentationUrl: string;
  scanLink: string;
  projectName?: string;
  // Catalog-derived notification text (single source of truth)
  notificationTitle?: string;
  notificationMessage?: string;
}

export function NewCveEmail({
  severity,
  deviceName,
  cveId,
  cvssScore,
  description,
  documentationUrl,
  scanLink,
  projectName,
  notificationTitle,
  notificationMessage,
}: NewCveEmailProps) {
  const subject = `[sec.rocks] ${notificationTitle ?? `New CVE on ${deviceName}`}`;

  const cvssInfo = cvssScore ? `CVSS ${cvssScore.toFixed(1)}` : '';

  const bodyLines: PlainEmailLine[] = [
    `On ${deviceName} detected ${cveId}${cvssInfo ? ` (${cvssInfo})` : ''}.`,
    '',
    `Severity: ${severity}`,
  ];

  // Use catalog message if available (includes CVE remediation guidance)
  if (notificationMessage) {
    bodyLines.push('', notificationMessage);
  } else if (description) {
    // Fallback for legacy notifications
    bodyLines.push('', description);
  }

  bodyLines.push(
    '',
    `Advisory: ${documentationUrl}`,
    `Review: ${scanLink}`
  );

  return buildPlainEmail({
    subject,
    heading: subject,
    bodyLines,
  });
}
