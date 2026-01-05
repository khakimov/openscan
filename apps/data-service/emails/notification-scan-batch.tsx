/**
 * Scan Batch Notification Email
 *
 * Purpose: Group multiple notifications from a single scan into one email
 * Triggered by: Port scan postback with multiple changes detected
 *
 * Pattern:
 * - One email per scan run (instead of N emails for N changes)
 * - Groups notifications by severity (CRITICAL → HIGH → MEDIUM → LOW → INFO)
 * - Shows summary at top, detailed list below
 */

import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import type { NotificationBatchItem } from '../types';

interface ScanBatchEmailProps {
  batchItems: NotificationBatchItem[];
  scanRunId: string;
  organizationName?: string;
}

export default function ScanBatchEmail({
  batchItems,
  scanRunId,
  organizationName,
}: ScanBatchEmailProps) {
  // Group by severity
  const bySeverity = batchItems.reduce((acc, item) => {
    if (!acc[item.severity]) acc[item.severity] = [];
    acc[item.severity].push(item);
    return acc;
  }, {} as Record<string, NotificationBatchItem[]>);

  const severityOrder: Array<keyof typeof bySeverity> = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'];
  const severityColors = {
    CRITICAL: '#dc2626',
    HIGH: '#ea580c',
    MEDIUM: '#f59e0b',
    LOW: '#3b82f6',
    INFO: '#6b7280',
  };

  const totalCount = batchItems.length;
  const criticalCount = bySeverity.CRITICAL?.length || 0;
  const highCount = bySeverity.HIGH?.length || 0;

  return (
    <Html>
      <Head />
      <Preview>
        Scan completed: {totalCount} change{totalCount === 1 ? '' : 's'} detected
        {criticalCount > 0 && ` (${criticalCount} critical)`}
      </Preview>
      <Body style={main}>
        <Container style={container}>
          {/* Header */}
          <Heading style={h1}>Security Scan Report</Heading>
          {organizationName && (
            <Text style={text}>Organization: {organizationName}</Text>
          )}

          {/* Summary */}
          <Section style={summaryBox}>
            <Text style={{ ...text, margin: '0 0 12px' }}>
              <strong>Total Changes: {totalCount}</strong>
            </Text>
            <Text style={{ ...text, margin: 0, fontSize: '14px', color: '#6b7280' }}>
              {criticalCount > 0 && `${criticalCount} Critical • `}
              {highCount > 0 && `${highCount} High • `}
              {(bySeverity.MEDIUM?.length || 0) > 0 && `${bySeverity.MEDIUM.length} Medium • `}
              {(bySeverity.LOW?.length || 0) > 0 && `${bySeverity.LOW.length} Low • `}
              {(bySeverity.INFO?.length || 0) > 0 && `${bySeverity.INFO.length} Info`}
            </Text>
          </Section>

          <Hr style={hr} />

          {/* Grouped notifications */}
          {severityOrder.map((severity) => {
            const items = bySeverity[severity];
            if (!items || items.length === 0) return null;

            return (
              <Section key={severity} style={{ marginBottom: '24px' }}>
                <Text
                  style={{
                    ...text,
                    fontWeight: 600,
                    fontSize: '16px',
                    color: severityColors[severity],
                    marginBottom: '12px',
                  }}
                >
                  {severity} ({items.length})
                </Text>
                {items.map((item, idx) => {
                  const deviceName = item.payload.deviceName as string | undefined;
                  const scanLink = item.payload.scanLink as string | undefined;
                  const isLast = idx === items.length - 1;
                  const treeChar = isLast ? '└─' : '├─';

                  return (
                    <Section
                      key={item.notificationId}
                      style={{
                        ...notificationItem,
                        borderLeft: `3px solid ${severityColors[severity]}`,
                      }}
                    >
                      <Text style={{ ...text, margin: '0 0 4px', fontWeight: 500, fontFamily: 'monospace' }}>
                        <span style={{ color: severityColors[severity], marginRight: '8px' }}>{treeChar}</span>
                        {item.title}
                      </Text>
                      {item.message && (
                        <Text style={{ ...text, margin: '0 0 8px', fontSize: '14px', color: '#6b7280', paddingLeft: '28px' }}>
                          {item.message}
                        </Text>
                      )}
                      {deviceName && (
                        <Text style={{ ...text, margin: 0, fontSize: '13px', color: '#9ca3af', paddingLeft: '28px' }}>
                          Server: {deviceName}
                        </Text>
                      )}
                      {scanLink && (
                        <Text style={{ ...text, margin: '8px 0 0', paddingLeft: '28px' }}>
                          <Link href={scanLink} style={link}>
                            View Details →
                          </Link>
                        </Text>
                      )}
                    </Section>
                  );
                })}
              </Section>
            );
          })}

          <Hr style={hr} />

          {/* Footer */}
          <Text style={footer}>
            This email was sent because you're monitoring security changes for {organizationName || 'your organization'}.
            <br />
            To manage notification settings, visit your{' '}
            <Link href="https://sec.rocks/settings/notifications" style={link}>
              notification preferences
            </Link>
            .
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

// Styles
const main = {
  backgroundColor: '#f6f9fc',
  fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
};

const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  padding: '20px 0 48px',
  marginBottom: '64px',
  maxWidth: '600px',
};

const h1 = {
  color: '#1f2937',
  fontSize: '24px',
  fontWeight: '600',
  lineHeight: '32px',
  padding: '0 40px',
  margin: '24px 0 16px',
};

const text = {
  color: '#374151',
  fontSize: '15px',
  lineHeight: '24px',
  padding: '0 40px',
  margin: '8px 0',
};

const summaryBox = {
  backgroundColor: '#f9fafb',
  border: '1px solid #e5e7eb',
  borderRadius: '8px',
  padding: '16px',
  margin: '16px 40px',
};

const notificationItem = {
  backgroundColor: '#f9fafb',
  borderRadius: '6px',
  padding: '12px 16px',
  marginBottom: '8px',
  marginLeft: '40px',
  marginRight: '40px',
};

const hr = {
  borderColor: '#e5e7eb',
  margin: '24px 40px',
};

const link = {
  color: '#2563eb',
  textDecoration: 'none',
  fontWeight: 500,
};

const footer = {
  color: '#6b7280',
  fontSize: '13px',
  lineHeight: '20px',
  padding: '0 40px',
  margin: '24px 0 0',
};
