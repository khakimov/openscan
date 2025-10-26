import { eq } from 'drizzle-orm';
import { getDb } from '../../database/setup';
import { organization } from '../../drizzle/auth-schema';

/**
 * Helper: Parse organization metadata
 */
function parseMetadata(metadata: string | null | undefined): Record<string, unknown> {
  if (!metadata) {
    return {};
  }

  try {
    return JSON.parse(metadata) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/**
 * Update organization details during onboarding
 *
 * @param organizationId - Organization ID
 * @param name - Organization name
 * @param timezone - Optional timezone
 */
export async function updateOrganizationOnboarding(
  organizationId: string,
  name: string,
  timezone?: string | null
) {
  const db = getDb();

  // Get existing metadata
  const [existing] = await db
    .select({ metadata: organization.metadata })
    .from(organization)
    .where(eq(organization.id, organizationId))
    .limit(1);

  const metadataObj = parseMetadata(existing?.metadata);

  // Update timezone if provided
  if (timezone) {
    metadataObj.timezone = timezone;
  }

  // Update organization
  await db
    .update(organization)
    .set({
      name,
      metadata: Object.keys(metadataObj).length ? JSON.stringify(metadataObj) : null,
    })
    .where(eq(organization.id, organizationId));

  return true;
}

/**
 * Mark onboarding as complete for organization
 *
 * @param organizationId - Organization ID
 */
export async function markOnboardingComplete(organizationId: string) {
  const db = getDb();

  // Get existing metadata
  const [existing] = await db
    .select({ metadata: organization.metadata })
    .from(organization)
    .where(eq(organization.id, organizationId))
    .limit(1);

  const metadataObj = parseMetadata(existing?.metadata);

  // Mark onboarding as complete
  metadataObj.onboardingCompleted = true;
  metadataObj.onboardingCompletedAt = new Date().toISOString();

  // Update organization
  await db
    .update(organization)
    .set({
      metadata: JSON.stringify(metadataObj),
    })
    .where(eq(organization.id, organizationId));

  return true;
}

/**
 * Get organization by ID only (no slug resolution)
 *
 * Used by getActiveOrganization and getOnboardingStatus
 *
 * @param organizationId - Organization ID
 * @returns Organization data or null if not found
 */
export async function getOrganizationById(organizationId: string) {
  const db = getDb();

  const [org] = await db
    .select({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      metadata: organization.metadata,
    })
    .from(organization)
    .where(eq(organization.id, organizationId))
    .limit(1);

  return org || null;
}
