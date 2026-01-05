import { buildPlainEmail, type PlainEmailLine } from './layout';

type FailureType = 'scan-failed' | 'queue-error' | 'postback-failed';

export interface PipelineWarningEmailProps {
  failureType: FailureType;
  surfaceName?: string;
  occurredAt: string;
  errorMessage?: string;
  nextAction: string;
  runbookUrl: string;
  projectName?: string;
}

/**
 * Pipeline Warning Email - System health and operational alerts
 *
 * Covers:
 * - Scan job failures (network errors, timeouts, authentication failures)
 * - Queue processing errors (retry exhausted, dead letter queue)
 * - Postback delivery failures (webhook timeouts, invalid payloads)
 */
export function PipelineWarningEmail({
  failureType,
  surfaceName,
  occurredAt,
  errorMessage,
  nextAction,
  runbookUrl,
  projectName,
}: PipelineWarningEmailProps) {
  const titles = {
    'scan-failed': surfaceName ? `Scan failed for ${surfaceName}` : 'Scan job failed',
    'queue-error': 'Queue processing error',
    'postback-failed': 'Postback delivery failed',
  };

  const descriptions = {
    'scan-failed':
      'A scheduled scan failed to complete. This may affect vulnerability detection and port monitoring.',
    'queue-error':
      'A background job encountered an error and was moved to the dead letter queue after multiple retries.',
    'postback-failed':
      'Failed to deliver scan results to the configured webhook endpoint. Results are still available in the console.',
  };

  const title = titles[failureType];
  const description = descriptions[failureType];

  const subtitle = projectName
    ? surfaceName
      ? `${surfaceName} · ${projectName}`
      : projectName
    : surfaceName || 'System Alert';

  const guidance =
    failureType === 'scan-failed'
      ? 'Check network connectivity, authentication credentials, and server availability. Scans will automatically retry on the next schedule.'
      : failureType === 'queue-error'
        ? 'Review the dead letter queue in the console to investigate the root cause and manually retry if needed.'
        : 'Verify webhook endpoint health and authentication. Failed postbacks can be manually re-sent from the scan history.';

  const bodyLines: PlainEmailLine[] = [
    subtitle,
    '',
    description,
    '',
    `Occurred at: ${occurredAt}`,
  ];

  if (errorMessage) {
    bodyLines.push(`Error: ${errorMessage}`);
  }

  bodyLines.push(
    '',
    { text: `Next action: ${nextAction}`, bold: true },
    `Runbook: ${runbookUrl}`,
    '',
    guidance
  );

  return buildPlainEmail({
    subject: title,
    heading: title,
    bodyLines,
  });
}
