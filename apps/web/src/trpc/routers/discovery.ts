import { z } from 'zod';
import { protectedProcedure, createTRPCRouter, requireOrganizationId } from '../trpc';
import {
  startDiscoveryWorkflow,
  getScanWorkflowStatusDB,
  getScanWorkflowResultsDB,
} from '@/server/discovery/index';
import { createLogger } from '@repo/logger';

const logger = createLogger({ name: 'discovery-trpc' });

export const discoveryRouter = createTRPCRouter({
  /**
   * Start a discovery workflow for a target domain
   */
  start: protectedProcedure
    .input(z.object({
      target: z.string().min(1, 'Target is required'),
    }))
    .mutation(async ({ ctx, input }) => {
      const organizationId = requireOrganizationId(ctx);
      const userId = ctx.user.id;

      logger.info('Starting discovery via tRPC', {
        target: input.target,
        organizationId,
        userId,
      });

      const response = await startDiscoveryWorkflow({
        data: {
          target: input.target,
          organizationId,
          userId,
        },
        env: ctx.env,
      });

      if (!response.success) {
        logger.error('Discovery failed to start', {
          target: input.target,
          error: response.error,
        });
      }

      return response;
    }),

  /**
   * Poll workflow status from database
   */
  workflowStatus: protectedProcedure
    .input(z.object({
      scanId: z.string().min(1, 'Scan ID is required'),
    }))
    .query(async ({ ctx, input }) => {
      const organizationId = requireOrganizationId(ctx);

      return getScanWorkflowStatusDB({
        data: { scanId: input.scanId, organizationId },
      });
    }),

  /**
   * Get workflow results from database
   */
  workflowResults: protectedProcedure
    .input(z.object({
      scanId: z.string().min(1, 'Scan ID is required'),
    }))
    .query(async ({ ctx, input }) => {
      const organizationId = requireOrganizationId(ctx);

      return getScanWorkflowResultsDB({
        data: { scanId: input.scanId, organizationId },
      });
    }),
});
