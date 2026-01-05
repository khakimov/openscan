import { buildPlainEmail, type PlainEmailLine } from './layout';

type Variant = 'new' | 'escalated';

export interface FindingAlertEmailProps {
  variant: Variant;
  surfaceName: string;
  vulnId: string;
  cvss: number;
  summary: string;
  ctaUrl: string;
  projectName?: string;
}

/**
 * Finding Alert Email - Universal template for vulnerability notifications
 *
 * Covers:
 * - CVE discovered on a monitored server (new vulnerability detected)
 * - CVE severity increases on an existing finding (risk escalates)
 */
export function FindingAlertEmail({
  variant,
  surfaceName,
  vulnId,
  cvss,
  summary,
  ctaUrl,
  projectName,
}: FindingAlertEmailProps) {
  const title =
    variant === 'new'
      ? `New vulnerability on ${surfaceName}`
      : `Severity increased: ${vulnId} on ${surfaceName}`;

  const subtitle = projectName ? `${surfaceName} · ${projectName}` : surfaceName;
  const intro =
    variant === 'new'
      ? 'A new vulnerability has been detected on this server. Review the details below and take action to reduce exposure.'
      : 'The severity level for this vulnerability has increased. Immediate attention may be required.';
  const guidance =
    variant === 'new'
      ? 'Confirm if this vulnerability applies to your configuration, then prioritize remediation based on your risk tolerance.'
      : 'Review updated risk scoring and adjust remediation priority if needed.';

  const keyFinding = `Finding: ${vulnId} · CVSS ${cvss.toFixed(1)}`;

  const bodyLines: PlainEmailLine[] = [
    subtitle,
    '',
    intro,
    '',
    { text: keyFinding, bold: true },
    summary,
    '',
    `Review in Console: ${ctaUrl}`,
    '',
    guidance,
  ];

  return buildPlainEmail({
    subject: title,
    heading: title,
    bodyLines,
  });
}
