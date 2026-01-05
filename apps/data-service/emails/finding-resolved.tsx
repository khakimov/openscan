import { buildPlainEmail, type PlainEmailLine } from './layout';

type Variant = 'vuln' | 'surface';

export interface FindingResolvedEmailProps {
  variant: Variant;
  surfaceName: string;
  findingId: string;
  summary: string;
  ctaUrl: string;
  projectName?: string;
}

/**
 * Finding Resolved Email - Positive notification for resolved issues
 *
 * Covers:
 * - Vulnerability marked remediated/verified closed (risk cleared)
 * - Service/port status returns to expected baseline (recovered surface)
 */
export function FindingResolvedEmail({
  variant,
  surfaceName,
  findingId,
  summary,
  ctaUrl,
  projectName,
}: FindingResolvedEmailProps) {
  const title =
    variant === 'vuln'
      ? `Vulnerability resolved on ${surfaceName}`
      : `Service recovered on ${surfaceName}`;

  const subtitle = projectName ? `${surfaceName} · ${projectName}` : surfaceName;
  const intro =
    variant === 'vuln'
      ? 'Good news! A previously detected vulnerability has been resolved.'
      : 'A monitored service has returned to its expected state.';
  const guidance =
    variant === 'vuln'
      ? 'This finding has been verified as resolved. Great work on improving your security posture!'
      : 'Monitor this service to ensure it remains in the expected state.';

  const bodyLines: PlainEmailLine[] = [
    subtitle,
    '',
    intro,
    '',
    { text: `Finding: ${findingId}`, bold: true },
    summary,
    '',
    `View details: ${ctaUrl}`,
    '',
    guidance,
  ];

  return buildPlainEmail({
    subject: title,
    heading: title,
    bodyLines,
  });
}
