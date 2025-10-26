import { eq, or, and } from 'drizzle-orm';
import { getDb } from '../database/setup';
import { organization, member } from '../drizzle/auth-schema';

/**
 * Get organization by slug or ID
 *
 * Security: Does NOT check membership - use validateOrganizationAccess for that
 *
 * @param slugOrId - Organization slug (e.g., "acme-corp") or ID (e.g., "org_abc123")
 * @returns Organization data or null if not found
 */
export async function getOrganizationBySlugOrId(
  slugOrId: string
) {
  const db = getDb();

  const [org] = await db
    .select({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      metadata: organization.metadata,
      logo: organization.logo,
      createdAt: organization.createdAt,
    })
    .from(organization)
    .where(
      or(
        eq(organization.slug, slugOrId),
        eq(organization.id, slugOrId)
      )
    )
    .limit(1);

  return org || null;
}

/**
 * Validate user has access to organization
 *
 * Security: Checks membership table to ensure user belongs to organization
 *
 * This is the SINGLE SOURCE OF TRUTH for organization access validation.
 * Use this function instead of manually checking membership.
 *
 * @param userId - User ID to check
 * @param organizationSlugOrId - Organization slug or ID
 * @returns Organization with user role if access granted, null otherwise
 */
export async function validateOrganizationAccess(
  userId: string,
  organizationSlugOrId: string
) {
  const db = getDb();

  // First, resolve slug/ID to organization
  const org = await getOrganizationBySlugOrId(organizationSlugOrId);

  if (!org) {
    return null;
  }

  // Then check membership
  const [membership] = await db
    .select()
    .from(member)
    .where(
      and(
        eq(member.userId, userId),
        eq(member.organizationId, org.id)
      )
    )
    .limit(1);

  if (!membership) {
    return null;
  }

  // Return org with membership info
  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    metadata: org.metadata,
    logo: org.logo,
    createdAt: org.createdAt,
    userRole: membership.role,
  };
}
