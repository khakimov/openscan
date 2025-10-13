import { createServerFn } from '@tanstack/react-start'
import {
  getScannersForTenant,
  getAvailableScannersForScanType,
  createScanner,
  getScannerById,
  deleteScanner,
  createRegistrationToken,
  type CreateScannerRequest,
  type ScannerQueryParams
} from '@repo/data-ops'
import { createLogger } from '@repo/logger'
import { z } from 'zod'
import { getCurrentTenant, getCurrentUser } from './utils/auth'
import { formatServerError } from './utils/errors'

const logger = createLogger({ name: 'scanners-server' })

// Validation schemas
const CreateScannerSchema = z.object({
  kind: z.enum(['CLOUD_SHARED', 'TENANT_DEDICATED', 'APPLIANCE', 'EMBEDDED_AGENT']),
  label: z.string().min(1).max(255),
  capabilities: z.object({
    scanTypes: z.array(z.string()).min(1),
    maxParallelJobs: z.number().int().min(1).max(10),
    regions: z.array(z.string()).optional(),
    specialFeatures: z.array(z.string()).optional(),
  }),
  temporalIdentity: z.string().optional(),
})

const ScannerQuerySchema = z.object({
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
  filter: z.string().optional(),
  status: z.string().optional(),
  kind: z.string().optional(),
  includeShared: z.boolean().optional(),
})

// Get all scanners for the current tenant
export const getScannersData = createServerFn({
  method: 'GET',
})
  .inputValidator((data?: ScannerQueryParams) => ScannerQuerySchema.parse(data || {}))
  .handler(async ({ data }) => {
    try {
      logger.info('Fetching scanners from database')

      // Get tenant context
      const tenantId = await getCurrentTenant()
      logger.info('Fetching scanners for tenant', { tenantId })

      const scannersResponse = await getScannersForTenant(tenantId, data)

      logger.info('Successfully fetched scanners from database', {
        scannerCount: scannersResponse.items.length,
        totalCount: scannersResponse.totalCount
      })

      return scannersResponse
    } catch (error) {
      logger.error('Failed to fetch scanners', {
        error: error instanceof Error ? {
          name: error.name,
          message: error.message,
          stack: error.stack
        } : error
      })

      // Return empty response on error
      return {
        items: [],
        totalCount: 0,
        page: 1,
        totalPages: 0
      }
    }
  })

// Get available scanners for a specific scan type
export const getAvailableScannersForScanTypeData = createServerFn({
  method: 'POST',
})
  .inputValidator((data: { scanType: string }) => {
    if (!data?.scanType) {
      throw new Error('Scan type is required')
    }
    return data
  })
  .handler(async ({ data }) => {
    try {
      const tenantId = await getCurrentTenant()

      logger.info('Finding available scanners for scan type', {
        scanType: data.scanType,
        tenantId
      })

      const availableScanners = await getAvailableScannersForScanType(
        data.scanType,
        tenantId
      )

      logger.info('Found available scanners', {
        scanType: data.scanType,
        count: availableScanners.length
      })

      return availableScanners
    } catch (error) {
      logger.error('Failed to find available scanners', {
        error: error instanceof Error ? error.message : String(error),
        scanType: data.scanType
      })
      throw error
    }
  })

// Create a new scanner
export const createScannerData = createServerFn({
  method: 'POST',
})
  .inputValidator((data: CreateScannerRequest) => CreateScannerSchema.parse(data))
  .handler(async ({ data }) => {
    try {
      const tenantId = await getCurrentTenant()

      logger.info('Creating new scanner', {
        kind: data.kind,
        label: data.label,
        tenantId
      })

      const newScanner = await createScanner(data, tenantId)

      logger.info('Scanner created successfully', {
        scannerId: newScanner.id,
        kind: newScanner.kind,
        label: newScanner.label
      })

      return newScanner
    } catch (error) {
      logger.error('Failed to create scanner', {
        error: error instanceof Error ? error.message : String(error),
        scannerData: data
      })
      throw error
    }
  })

// Get scanner by ID
export const getScannerDetailData = createServerFn({
  method: 'POST',
})
  .inputValidator((data: { scannerId: string }) => {
    if (!data?.scannerId) {
      throw new Error('Scanner ID is required')
    }
    return data
  })
  .handler(async ({ data }) => {
    try {
      const tenantId = await getCurrentTenant()

      logger.info('Fetching scanner detail', {
        scannerId: data.scannerId,
        tenantId
      })

      const scanner = await getScannerById(data.scannerId, tenantId)

      if (!scanner) {
        throw new Error('Scanner not found or access denied')
      }

      logger.info('Scanner detail fetched successfully', {
        scannerId: scanner.id,
        status: scanner.status
      })

      return scanner
    } catch (error) {
      logger.error('Failed to fetch scanner detail', {
        error: error instanceof Error ? error.message : String(error),
        scannerId: data.scannerId
      })
      throw error
    }
  })

// Delete a scanner
export const deleteScannerData = createServerFn({
  method: 'POST',
})
  .inputValidator((data: { scannerId: string }) => {
    if (!data?.scannerId) {
      throw new Error('Scanner ID is required')
    }
    return data
  })
  .handler(async ({ data }) => {
    try {
      const tenantId = await getCurrentTenant()

      logger.info('Deleting scanner', {
        scannerId: data.scannerId,
        tenantId
      })

      const deleted = await deleteScanner(data.scannerId, tenantId)

      if (!deleted) {
        throw new Error('Scanner not found or access denied')
      }

      logger.info('Scanner deleted successfully', {
        scannerId: data.scannerId
      })

      return { success: true }
    } catch (error) {
      logger.error('Failed to delete scanner', {
        error: error instanceof Error ? error.message : String(error),
        scannerId: data.scannerId
      })
      throw error
    }
  })

// Generate registration token for scanner provisioning
export const generateRegistrationTokenData = createServerFn({
  method: 'POST',
})
  .inputValidator((data: { expiresInSeconds?: number }) => {
    const expiresInSeconds = data?.expiresInSeconds || 3600
    if (expiresInSeconds < 60 || expiresInSeconds > 86400) {
      throw new Error('Token expiration must be between 60 seconds and 24 hours')
    }
    return { expiresInSeconds }
  })
  .handler(async ({ data }) => {
    try {
      const tenantId = await getCurrentTenant()

      logger.info('Generating scanner registration token', {
        tenantId,
        expiresInSeconds: data.expiresInSeconds
      })

      const tokenData = await createRegistrationToken(
        tenantId,
        data.expiresInSeconds
      )

      logger.info('Registration token generated successfully', {
        tokenId: tokenData.tokenId,
        tenantId
      })

      // Return only the token, not the hash (for security)
      return {
        token: tokenData.token,
        tokenId: tokenData.tokenId,
        expiresInSeconds: data.expiresInSeconds
      }
    } catch (error) {
      logger.error('Failed to generate registration token', {
        error: formatServerError(error)
      })
      throw error
    }
  })