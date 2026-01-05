import type { MessageBatch } from 'cloudflare:workers';
import { WorkerEntrypoint } from 'cloudflare:workers';
import { Hono } from 'hono';
import { initDatabase, markNotificationEmailSent } from '@repo/data-ops';
import {
  sendCriticalPortEmail,
  sendNewCveEmail,
  sendServiceDriftEmail,
  sendPortOfflineEmail,
  sendServerPromotedEmail,
  sendScanBatchEmail,
  sendServiceAvailabilityEmail,
} from './lib/resend';
import type { NotificationDeliveryMessage } from '../types';

type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';

const app = new Hono<{ Bindings: Env }>();

app.get('/status', (c) =>
  c.json({
    ok: true,
    queue: 'notification-delivery',
  })
);

app.post('/debug/enqueue', async (c) => {
  try {
    const overrides = await c.req.json<Partial<NotificationDeliveryMessage>>().catch(() => ({}));

    if (!c.env.NOTIFICATION_DELIVERY_PRODUCER) {
      return c.json(
        {
          ok: false,
          error: 'Queue producer binding NOTIFICATION_DELIVERY_PRODUCER is not available on this worker',
          availableBindings: Object.keys(c.env ?? {}),
        },
        500
      );
    }

    const job: NotificationDeliveryMessage = {
      notificationId: overrides?.notificationId ?? `debug-${Date.now()}`,
      organizationId: overrides?.organizationId ?? 'org_debug',
      deviceId: overrides?.deviceId,
      severity: overrides?.severity ?? 'HIGH',
      targetChannels: overrides?.targetChannels ?? ['email'],
      recipients:
        overrides?.recipients && overrides.recipients.length > 0
          ? overrides.recipients
          : ['you@example.com'],
      eventType: overrides?.eventType ?? 'critical-port',
      payload: {
        deviceName: 'Debug Server',
        portDisplay: '443',
        protocol: 'tcp',
        scanLink: 'https://sec.rocks/servers/debug',
        ...((overrides?.payload as Record<string, unknown> | undefined) ?? {}),
      },
    };

    await c.env.NOTIFICATION_DELIVERY_PRODUCER.sendBatch([
      {
        body: job,
      },
    ]);

    return c.json(
      {
        ok: true,
        message: 'Notification delivery job enqueued',
        job,
      },
      202
    );
  } catch (error) {
    console.error('Failed to enqueue debug notification job', { error });
    return c.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : 'Unknown error enqueuing job',
      },
      500
    );
  }
});

async function handleNotificationDelivery(
  job: NotificationDeliveryMessage,
  env: Env
): Promise<void> {
  // Initialize database for marking notifications as sent
  initDatabase(env.DB);

  console.log('Received notification delivery job', {
    notificationId: job.notificationId,
    channels: job.targetChannels,
    eventType: job.eventType,
  });

  const sentNotificationIds: string[] = [];

  for (const channel of job.targetChannels) {
    if (channel === 'email') {
      const ids = await deliverEmail(job, env);
      sentNotificationIds.push(...ids);
    }

    if (channel === 'telegram') {
      const ids = await deliverTelegram(job, env);
      // Telegram IDs are tracked separately - don't add to emailSent
      // Future: Add telegramSent column to notifications table
      console.log('Telegram delivery returned', { ids });
    }
  }

  // Mark all sent notifications as email sent in database
  if (sentNotificationIds.length > 0) {
    const markResults = await Promise.allSettled(
      sentNotificationIds.map((id) =>
        markNotificationEmailSent(id, job.organizationId)
      )
    );

    const succeeded = markResults.filter((r) => r.status === 'fulfilled').length;
    const failed = markResults.filter((r) => r.status === 'rejected').length;

    console.log('Marked notifications as email sent', {
      total: sentNotificationIds.length,
      succeeded,
      failed,
    });

    if (failed > 0) {
      const errors = markResults
        .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
        .map((r) => r.reason);
      console.error('Some notifications failed to mark as sent', { errors });
    }
  }
}

/**
 * Delivers email and returns list of notification IDs that were sent
 * For batch emails, returns all batch item notification IDs
 * For single emails, returns the job's notification ID
 */
async function deliverEmail(
  job: NotificationDeliveryMessage,
  env: Env
): Promise<string[]> {
  if (job.recipients.length === 0) {
    console.log('No email recipients for notification, skipping send', {
      notificationId: job.notificationId,
    });
    return [];
  }

  // Handle batch notifications
  if (job.isBatch && job.batchItems) {
    console.log('Sending batch email', {
      notificationId: job.notificationId,
      scanRunId: job.scanRunId,
      itemCount: job.batchItems.length,
      recipients: job.recipients.length,
    });

    await Promise.all(
      job.recipients.map((to) =>
        sendScanBatchEmail(env, to, {
          batchItems: job.batchItems!,
          scanRunId: job.scanRunId || 'unknown',
          organizationName: job.payload.organizationName as string | undefined,
        })
      )
    );

    // Return all batch item notification IDs for marking as sent
    return job.batchItems.map((item) => item.notificationId);
  }

  switch (job.eventType) {
    case 'NEW_PORT':
    case 'critical-port': {
      const payload = job.payload as Partial<{
        deviceName: string;
        portDisplay: string;
        protocol: string;
        detectedService: string;
        scanLink: string;
        projectName: string;
      }>;

      await Promise.all(
        job.recipients.map((to) =>
          sendCriticalPortEmail(env, to, {
            severity: job.severity as Severity, // Use catalog severity from job, not payload
            deviceName: payload.deviceName ?? 'Monitored server',
            portDisplay: payload.portDisplay ?? '443',
            protocol: payload.protocol ?? 'tcp',
            detectedService: payload.detectedService,
            scanLink:
              payload.scanLink ?? 'https://app.example.com/servers/activity',
            projectName: payload.projectName,
            // Pass catalog text (single source of truth)
            notificationTitle: job.notificationTitle,
            notificationMessage: job.notificationMessage,
          })
        )
      );
      break;
    }
    case 'NEW_CVE':
    case 'new-cve': {
      const payload = job.payload as Partial<{
        severity: string;
        deviceName: string;
        cveId: string;
        cvssScore: number;
        description: string;
        documentationUrl: string;
        scanLink: string;
        projectName: string;
      }>;

      await Promise.all(
        job.recipients.map((to) =>
          sendNewCveEmail(env, to, {
            deviceName: payload.deviceName ?? 'Monitored server',
            cveId: payload.cveId ?? 'CVE-YYYY-0000',
            cvssScore: payload.cvssScore,
            description: payload.description,
            documentationUrl:
              payload.documentationUrl ??
              'https://nvd.nist.gov/vuln/detail/CVE-YYYY-0000',
            scanLink:
              payload.scanLink ?? 'https://app.example.com/servers/activity',
            projectName: payload.projectName,
            // Pass catalog text (includes CVE remediation guidance)
            notificationTitle: job.notificationTitle,
            notificationMessage: job.notificationMessage,
          })
        )
      );
      break;
    }
    case 'SERVICE_DRIFT': {
      const payload = job.payload as Partial<{
        deviceName: string;
        port: number;
        protocol: string;
        oldService?: {
          name?: string;
          product?: string;
          version?: string;
        };
        newService?: {
          name?: string;
          product?: string;
          version?: string;
        };
        scanLink: string;
        projectName: string;
      }>;

      await Promise.all(
        job.recipients.map((to) =>
          sendServiceDriftEmail(env, to, {
            severity: job.severity as Severity, // Use catalog severity from job, not payload
            deviceName: payload.deviceName ?? 'Monitored server',
            portDisplay: String(payload.port ?? 'unknown'),
            protocol: payload.protocol ?? 'tcp',
            oldService: payload.oldService,
            newService: payload.newService,
            scanLink:
              payload.scanLink ?? 'https://app.example.com/servers/activity',
            projectName: payload.projectName,
            // Pass catalog text (single source of truth)
            notificationTitle: job.notificationTitle,
            notificationMessage: job.notificationMessage,
          })
        )
      );
      break;
    }
    case 'CLOSED_PORT': {
      const payload = job.payload as Partial<{
        deviceName: string;
        port: number;
        protocol: string;
        service: string;
        previousState: string;
        currentState: string;
        scanLink: string;
        projectName: string;
      }>;

      await Promise.all(
        job.recipients.map((to) =>
          sendPortOfflineEmail(env, to, {
            severity: job.severity as Severity, // Use catalog severity from job, not payload
            deviceName: payload.deviceName ?? 'Monitored server',
            portDisplay: String(payload.port ?? 'unknown'),
            protocol: payload.protocol ?? 'tcp',
            service: payload.service,
            previousState: payload.previousState,
            currentState: payload.currentState,
            scanLink:
              payload.scanLink ?? 'https://app.example.com/servers/activity',
            projectName: payload.projectName,
            // Pass catalog text (single source of truth)
            notificationTitle: job.notificationTitle,
            notificationMessage: job.notificationMessage,
          })
        )
      );
      break;
    }
    case 'SERVER_PROMOTED': {
      const payload = job.payload as Partial<{
        deviceName: string;
        scanLink: string;
        projectName: string;
      }>;

      await Promise.all(
        job.recipients.map((to) =>
          sendServerPromotedEmail(env, to, {
            deviceName: payload.deviceName ?? 'Server',
            scanLink:
              payload.scanLink ?? 'https://app.example.com/servers',
            projectName: payload.projectName,
            // Pass catalog text (single source of truth)
            notificationTitle: job.notificationTitle,
            notificationMessage: job.notificationMessage,
          })
        )
      );
      break;
    }
    case 'SERVICE_DOWN': {
      const payload = job.payload as Partial<{
        deviceName: string;
        port: number;
        protocol: string;
        service: string;
        previousState: string;
        currentState: string;
        scanLink: string;
        projectName: string;
      }>;

      await Promise.all(
        job.recipients.map((to) =>
          sendServiceAvailabilityEmail(env, to, {
            severity: job.severity as Severity,
            deviceName: payload.deviceName ?? 'Monitored server',
            port: payload.port ?? 0,
            protocol: payload.protocol ?? 'tcp',
            service: payload.service,
            previousState: payload.previousState ?? 'open',
            currentState: payload.currentState ?? 'closed',
            scanLink: payload.scanLink ?? 'https://app.example.com/servers/activity',
            projectName: payload.projectName,
            isDown: true,
            // Pass catalog text (single source of truth)
            notificationTitle: job.notificationTitle,
            notificationMessage: job.notificationMessage,
          })
        )
      );
      break;
    }
    case 'SERVICE_UP': {
      const payload = job.payload as Partial<{
        deviceName: string;
        port: number;
        protocol: string;
        service: string;
        previousState: string;
        currentState: string;
        scanLink: string;
        projectName: string;
      }>;

      await Promise.all(
        job.recipients.map((to) =>
          sendServiceAvailabilityEmail(env, to, {
            severity: job.severity as Severity,
            deviceName: payload.deviceName ?? 'Monitored server',
            port: payload.port ?? 0,
            protocol: payload.protocol ?? 'tcp',
            service: payload.service,
            previousState: payload.previousState ?? 'closed',
            currentState: payload.currentState ?? 'open',
            scanLink: payload.scanLink ?? 'https://app.example.com/servers/activity',
            projectName: payload.projectName,
            isDown: false,
            // Pass catalog text (single source of truth)
            notificationTitle: job.notificationTitle,
            notificationMessage: job.notificationMessage,
          })
        )
      );
      break;
    }
    default: {
      console.log('Unhandled email event type, skipping send', {
        notificationId: job.notificationId,
        eventType: job.eventType,
      });
      return [];
    }
  }

  // Email was sent for this notification
  return [job.notificationId];
}

/**
 * Format notification for Telegram message
 * Uses Markdown formatting for better readability
 */
function formatTelegramMessage(job: NotificationDeliveryMessage): string {
  const severityEmoji: Record<Severity, string> = {
    CRITICAL: '🔴',
    HIGH: '🟠',
    MEDIUM: '🟡',
    LOW: '🔵',
    INFO: 'ℹ️',
  };

  const emoji = severityEmoji[job.severity as Severity] ?? '📢';
  const title = job.notificationTitle ?? 'Security Alert';
  const message = job.notificationMessage ?? '';

  const payload = job.payload as Record<string, unknown>;
  const deviceName = (payload.deviceName as string) ?? '';
  const scanLink = (payload.scanLink as string) ?? '';

  let text = `${emoji} *${escapeMarkdown(title)}*\n`;

  if (message) {
    text += `\n${escapeMarkdown(message)}\n`;
  }

  if (deviceName) {
    text += `\n🖥 Server: ${escapeMarkdown(deviceName)}`;
  }

  if (scanLink) {
    text += `\n\n[View Details](${scanLink})`;
  }

  return text;
}

/**
 * Escape special characters for Telegram Markdown
 */
function escapeMarkdown(text: string): string {
  return text.replace(/([_*\[\]()~`>#+=|{}.!-])/g, '\\$1');
}

/**
 * Send message to Telegram chat via Bot API
 */
async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  text: string
): Promise<boolean> {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'MarkdownV2',
      disable_web_page_preview: false,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Telegram API error', {
      status: response.status,
      error,
    });
    return false;
  }

  return true;
}

async function deliverTelegram(
  job: NotificationDeliveryMessage,
  env: Env
): Promise<string[]> {
  if (!env.TELEGRAM_BOT_TOKEN) {
    console.log('Telegram bot token not configured, skipping delivery', {
      notificationId: job.notificationId,
    });
    return [];
  }

  // Get Telegram recipients from job payload
  // These are chat IDs from user preferences
  const telegramRecipients = (job.payload.telegramRecipients as string[]) ?? [];

  if (telegramRecipients.length === 0) {
    console.log('No Telegram recipients for notification, skipping', {
      notificationId: job.notificationId,
    });
    return [];
  }

  const message = formatTelegramMessage(job);
  const sentNotificationIds: string[] = [];

  console.log('Sending Telegram notifications', {
    notificationId: job.notificationId,
    recipientCount: telegramRecipients.length,
  });

  // Send to all Telegram chat IDs
  const results = await Promise.allSettled(
    telegramRecipients.map((chatId) =>
      sendTelegramMessage(env.TELEGRAM_BOT_TOKEN!, chatId, message)
    )
  );

  const succeeded = results.filter(
    (r) => r.status === 'fulfilled' && r.value
  ).length;
  const failed = results.length - succeeded;

  console.log('Telegram delivery complete', {
    notificationId: job.notificationId,
    succeeded,
    failed,
  });

  // Return notification ID if at least one delivery succeeded
  if (succeeded > 0) {
    sentNotificationIds.push(job.notificationId);
  }

  return sentNotificationIds;
}

export default class NotificationDeliveryWorker extends WorkerEntrypoint<Env> {
  fetch(request: Request): Promise<Response> {
    return app.fetch(request, this.env, this.ctx);
  }

  async queue(
    batch: MessageBatch<NotificationDeliveryMessage>
  ): Promise<void> {
    for (const message of batch.messages) {
      try {
        await handleNotificationDelivery(message.body, this.env);
        message.ack();
      } catch (error) {
        console.error('Failed to process notification delivery job', {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          notificationId: message.body.notificationId,
        });
        message.retry();
      }
    }
  }
}
