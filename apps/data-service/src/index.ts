import type { MessageBatch } from 'cloudflare:workers';
import { WorkerEntrypoint } from 'cloudflare:workers';
import { Hono } from 'hono';
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
  // TODO: hydrate notification detail via data-ops API
  console.log('Received notification delivery job', {
    notificationId: job.notificationId,
    channels: job.targetChannels,
    eventType: job.eventType,
  });

  for (const channel of job.targetChannels) {
    if (channel === 'email') {
      await deliverEmail(job, env);
    }

    if (channel === 'telegram') {
      await deliverTelegram(job, env);
    }
  }
}

async function deliverEmail(
  job: NotificationDeliveryMessage,
  env: Env
): Promise<void> {
  if (job.recipients.length === 0) {
    console.log('No email recipients for notification, skipping send', {
      notificationId: job.notificationId,
    });
    return;
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
    return;
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
    }
  }
}

async function deliverTelegram(
  job: NotificationDeliveryMessage,
  env: Env
): Promise<void> {
  console.log('Telegram delivery placeholder', {
    notificationId: job.notificationId,
    botTokenPresent: Boolean(env.TELEGRAM_BOT_TOKEN),
  });
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
