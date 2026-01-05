import { Resend } from 'resend';
import {
  CriticalPortEmail,
  type CriticalPortEmailProps,
  NewCveEmail,
  type NewCveEmailProps,
  ServiceDriftEmail,
  type ServiceDriftEmailProps,
  PortOfflineEmail,
  type PortOfflineEmailProps,
  ServerPromotedEmail,
  type ServerPromotedEmailProps,
  ServiceAvailabilityEmail,
  type ServiceAvailabilityEmailProps,
} from '../../emails';
import ScanBatchEmail from '../../emails/notification-scan-batch';
import type { NotificationBatchItem } from '../../types';

function ensureResendConfig(env: Env): asserts env is Env & {
  RESEND_API_KEY: string;
  RESEND_EMAIL_FROM: string;
} {
  if (!env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is not configured on the worker binding');
  }
  if (!env.RESEND_EMAIL_FROM) {
    throw new Error('RESEND_EMAIL_FROM is not configured on the worker binding');
  }
}

export function createResendClient(env: Env) {
  ensureResendConfig(env);
  return new Resend(env.RESEND_API_KEY);
}

export async function sendCriticalPortEmail(
  env: Env,
  to: string,
  props: CriticalPortEmailProps
) {
  const resend = createResendClient(env);
  const email = CriticalPortEmail(props);

  await resend.emails.send({
    from: env.RESEND_EMAIL_FROM,
    to,
    subject: email.subject,
    text: email.text,
    html: email.html,
  });
}

export async function sendNewCveEmail(
  env: Env,
  to: string,
  props: NewCveEmailProps
) {
  const resend = createResendClient(env);
  const email = NewCveEmail(props);

  await resend.emails.send({
    from: env.RESEND_EMAIL_FROM,
    to,
    subject: email.subject,
    text: email.text,
    html: email.html,
  });
}

export async function sendServiceDriftEmail(
  env: Env,
  to: string,
  props: ServiceDriftEmailProps
) {
  const resend = createResendClient(env);
  const email = ServiceDriftEmail(props);

  await resend.emails.send({
    from: env.RESEND_EMAIL_FROM,
    to,
    subject: email.subject,
    text: email.text,
    html: email.html,
  });
}

export async function sendPortOfflineEmail(
  env: Env,
  to: string,
  props: PortOfflineEmailProps
) {
  const resend = createResendClient(env);
  const email = PortOfflineEmail(props);

  await resend.emails.send({
    from: env.RESEND_EMAIL_FROM,
    to,
    subject: email.subject,
    text: email.text,
    html: email.html,
  });
}

export async function sendServerPromotedEmail(
  env: Env,
  to: string,
  props: ServerPromotedEmailProps
) {
  const resend = createResendClient(env);
  const email = ServerPromotedEmail(props);

  await resend.emails.send({
    from: env.RESEND_EMAIL_FROM,
    to,
    subject: email.subject,
    text: email.text,
    html: email.html,
  });
}

export interface ScanBatchEmailProps {
  batchItems: NotificationBatchItem[];
  scanRunId: string;
  organizationName?: string;
}

export async function sendScanBatchEmail(
  env: Env,
  to: string,
  props: ScanBatchEmailProps
) {
  const resend = createResendClient(env);

  const criticalCount = props.batchItems.filter(i => i.severity === 'CRITICAL').length;
  const subject = `Security Scan: ${props.batchItems.length} change${props.batchItems.length === 1 ? '' : 's'} detected${criticalCount > 0 ? ` (${criticalCount} critical)` : ''}`;

  await resend.emails.send({
    from: env.RESEND_EMAIL_FROM,
    to,
    subject,
    react: ScanBatchEmail(props),
  });
}

export async function sendServiceAvailabilityEmail(
  env: Env,
  to: string,
  props: ServiceAvailabilityEmailProps
) {
  const resend = createResendClient(env);
  const email = ServiceAvailabilityEmail(props);

  await resend.emails.send({
    from: env.RESEND_EMAIL_FROM,
    to,
    subject: email.subject,
    text: email.text,
    html: email.html,
  });
}
