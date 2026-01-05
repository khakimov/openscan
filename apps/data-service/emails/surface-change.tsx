import { buildPlainEmail, type PlainEmailLine } from './layout';

type ChangeType = 'port-opened' | 'service-change';

export interface SurfaceChangeEmailProps {
  changeType: ChangeType;
  surfaceName: string;
  port: number;
  protocol: string;
  firstSeen: string;
  detectedService?: string;
  ctaUrl: string;
  projectName?: string;
}

/**
 * Surface Change Email - Notifications for attack surface changes
 *
 * Covers:
 * - New port opened on monitored server (expanded attack surface)
 * - Service change detected on existing port (tech stack shift)
 */
export function SurfaceChangeEmail({
  changeType,
  surfaceName,
  port,
  protocol,
  firstSeen,
  detectedService,
  ctaUrl,
  projectName,
}: SurfaceChangeEmailProps) {
  const title =
    changeType === 'port-opened'
      ? `New port detected on ${surfaceName}`
      : `Service changed on ${surfaceName}`;

  const portDisplay = `${port}/${protocol.toUpperCase()}`;

  const subtitle = projectName ? `${surfaceName} · ${projectName}` : surfaceName;
  const intro =
    changeType === 'port-opened'
      ? 'A new port has been detected on this server. Review the details to confirm this change is expected.'
      : 'A previously detected service has changed. This may indicate updated software or configuration changes.';
  const guidance =
    changeType === 'port-opened'
      ? 'If this port should remain open, update the Business Lens impact to reflect its importance and reduce future alert noise.'
      : 'Review the updated service details and verify this change aligns with your deployment schedule.';

  const bodyLines: PlainEmailLine[] = [
    subtitle,
    '',
    intro,
    '',
    { text: `Port: ${portDisplay}`, bold: true },
  ];

  if (detectedService) {
    bodyLines.push(`Detected service: ${detectedService}`);
  }

  bodyLines.push(
    `First seen: ${firstSeen}`,
    '',
    `Review change: ${ctaUrl}`,
    '',
    guidance
  );

  return buildPlainEmail({
    subject: title,
    heading: title,
    bodyLines,
  });
}
