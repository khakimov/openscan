import type { NotificationDeliveryMessage } from '@repo/contracts/notifications';

interface Env {
  DB: D1Database;
  NOTIFICATION_DELIVERY: Queue<NotificationDeliveryMessage>;
  NOTIFICATION_DELIVERY_PRODUCER: Queue<NotificationDeliveryMessage>;
  DATA_OPS_API_URL: string;
  RESEND_API_KEY?: string;
  RESEND_EMAIL_FROM?: string;
  TELEGRAM_BOT_TOKEN?: string;
}
