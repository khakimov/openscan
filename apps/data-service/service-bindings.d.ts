interface Env {
  DB: D1Database;
  NOTIFICATION_DELIVERY: Queue<NotificationDeliveryMessage>;
  NOTIFICATION_DELIVERY_PRODUCER: Queue<NotificationDeliveryMessage>;
  DATA_OPS_API_URL: string;
  RESEND_API_KEY?: string;
  RESEND_EMAIL_FROM?: string;
  TELEGRAM_BOT_TOKEN?: string;
}

interface NotificationDeliveryMessage {
  notificationId: string;
  organizationId: string;
  deviceId?: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  targetChannels: NotificationDeliveryChannel[];
  recipients: string[];
  eventType: string;
  payload: Record<string, unknown>;
  notificationTitle?: string;
  notificationMessage?: string;
}

type NotificationDeliveryChannel = 'email' | 'telegram';
