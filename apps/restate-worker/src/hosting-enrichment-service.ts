/**
 * Hosting Provider Enrichment Service
 * 
 * Background job that detects hosting providers for device IPs using ip-api.com.
 * Runs periodically to enrich devices with hosting/cloud provider information.
 * 
 * Rate limit: 45 requests per minute (ip-api.com free tier)
 * We use 40 requests per batch with 1.5s delay between requests.
 */

import * as restate from '@restatedev/restate-sdk';
import { createLogger } from '@repo/logger';
import { batchDetectHosting } from '@repo/data-ops/hosting';

const logger = createLogger({ name: 'hosting-enrichment' });

/**
 * Hosting Enrichment Service
 * 
 * Provides durable background enrichment of hosting provider data.
 * Designed to run as a scheduled job or on-demand.
 */
export const hostingEnrichmentService = restate.service({
  name: 'HostingEnrichment',
  handlers: {
    /**
     * Enrich a batch of device IPs with hosting provider data.
     * 
     * Processes up to 40 IPs per call (respecting rate limits).
     * Returns stats on processing results.
     */
    async enrichBatch(ctx: restate.Context): Promise<{
      processed: number;
      succeeded: number;
      failed: number;
      durationMs: number;
    }> {
      const startTime = Date.now();

      logger.info('Starting hosting provider enrichment batch');

      try {
        const result = await ctx.run('batch-detect-hosting', async () => {
          return batchDetectHosting(40, (processed: number, total: number) => {
            logger.debug('Hosting enrichment progress', { processed, total });
          });
        });

        const durationMs = Date.now() - startTime;

        logger.info('Completed hosting provider enrichment batch', {
          processed: result.processed,
          succeeded: result.succeeded,
          failed: result.failed,
          durationMs,
        });

        return {
          processed: result.processed,
          succeeded: result.succeeded,
          failed: result.failed,
          durationMs,
        };
      } catch (error) {
        const durationMs = Date.now() - startTime;
        logger.error('Hosting enrichment batch failed', { error, durationMs });
        throw error;
      }
    },

    /**
     * Run continuous enrichment until all IPs are processed.
     * 
     * This handler runs in a loop, processing batches until no more
     * IPs need enrichment. It uses Restate's durable execution to
     * handle failures and retries gracefully.
     */
    async enrichAll(ctx: restate.Context): Promise<{
      totalProcessed: number;
      totalSucceeded: number;
      totalFailed: number;
      batchesRun: number;
      durationMs: number;
    }> {
      const startTime = Date.now();
      let totalProcessed = 0;
      let totalSucceeded = 0;
      let totalFailed = 0;
      let batchesRun = 0;

      logger.info('Starting full hosting provider enrichment');

      // Process batches until no more IPs to enrich
      while (true) {
        batchesRun++;

        const batchResult = await ctx.serviceClient(hostingEnrichmentService)
          .enrichBatch();

        totalProcessed += batchResult.processed;
        totalSucceeded += batchResult.succeeded;
        totalFailed += batchResult.failed;

        // If no IPs were processed or fewer than batch size, we're done
        if (batchResult.processed === 0 || batchResult.processed < 40) {
          logger.info(batchResult.processed === 0 ? 'No more IPs to enrich, stopping' : 'Partial batch processed, likely done', {
            processed: batchResult.processed,
          });
          break;
        }

        // Continue to next batch
        logger.debug('Batch complete, continuing to next batch', {
          batch: batchesRun,
          totalProcessed,
        });
      }

      const durationMs = Date.now() - startTime;

      logger.info('Completed full hosting provider enrichment', {
        totalProcessed,
        totalSucceeded,
        totalFailed,
        batchesRun,
        durationMs,
      });

      return {
        totalProcessed,
        totalSucceeded,
        totalFailed,
        batchesRun,
        durationMs,
      };
    },

    /**
     * Get the current enrichment status.
     * 
     * Returns counts of enriched vs pending IPs.
     */
    async getStatus(_ctx: restate.Context): Promise<{
      pendingCount: number;
      enrichedCount: number;
    }> {
      // This would require a query to count enriched vs pending
      // For now, return placeholder
      logger.debug('Getting enrichment status');
      
      // TODO: Implement status query when needed
      return {
        pendingCount: 0,
        enrichedCount: 0,
      };
    },
  },
});


