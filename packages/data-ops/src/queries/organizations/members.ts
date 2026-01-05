/**
 * Organization queries
 */

import { eq } from 'drizzle-orm';
import { getDb } from '../../database/setup';
import { auth_user, member } from '../../drizzle/auth-schema';

/**
 * Get email addresses of all users in an organization
 * Used for notification delivery
 *
 * Note: Uses member table from better-auth organization plugin
 * which links users to organizations
 */
export async function getOrganizationMemberEmails(
  organizationId: string
): Promise<string[]> {
  const db = getDb();

  // Query member joined with auth_user to get emails of org members
  const members = await db
    .select({ email: auth_user.email })
    .from(member)
    .innerJoin(auth_user, eq(member.userId, auth_user.id))
    .where(eq(member.organizationId, organizationId));

  return members.map((row: { email: string }) => row.email).filter(Boolean);
}
