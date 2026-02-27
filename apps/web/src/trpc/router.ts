import { createTRPCRouter } from './trpc';
import { authRouter } from './routers/auth';
import { organizationRouter } from './routers/organization';
import { projectRouter } from './routers/project';
import { deviceRouter } from './routers/device';
import { notificationRouter } from './routers/notification';
import { onboardingRouter } from './routers/onboarding';
import { scanRouter } from './routers/scan';
import { scheduleRouter } from './routers/schedule';

export const appRouter = createTRPCRouter({
  auth: authRouter,
  organization: organizationRouter,
  project: projectRouter,
  device: deviceRouter,
  notification: notificationRouter,
  onboarding: onboardingRouter,
  scan: scanRouter,
  schedule: scheduleRouter,
});

export type AppRouter = typeof appRouter;
