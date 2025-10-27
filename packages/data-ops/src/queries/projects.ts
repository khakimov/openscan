import { eq, and } from 'drizzle-orm';
import { getDb } from '../database/setup';
import { projects } from '../schema';
import { validateOrganizationAccess } from './organizations/access';

export type ProjectCreateData = {
  name: string;
  domain?: string;
  description?: string;
  isDefault?: boolean;
};

export type ProjectUpdateData = {
  name?: string;
  domain?: string;
  description?: string;
  isDefault?: boolean;
};

/**
 * Create a new project
 */
export async function createProject(
  organizationId: string,
  data: ProjectCreateData
) {
  const db = getDb();

  const [project] = await db
    .insert(projects)
    .values({
      organizationId,
      name: data.name,
      domain: data.domain,
      description: data.description,
      isDefault: data.isDefault ?? false,
    })
    .returning();

  return project;
}

/**
 * Get project by ID
 */
export async function getProjectById(
  projectId: string,
  organizationId: string
) {
  const db = getDb();

  const [project] = await db
    .select()
    .from(projects)
    .where(
      and(
        eq(projects.id, projectId),
        eq(projects.organizationId, organizationId)
      )
    )
    .limit(1);

  return project || null;
}

/**
 * Get organizationId from projectId (VULN-003 FIX)
 *
 * Security: Use this to derive organizationId from projectId
 * instead of accepting organizationId from client
 */
export async function getOrganizationIdFromProject(projectId: string): Promise<string | null> {
  const db = getDb();

  const [project] = await db
    .select({ organizationId: projects.organizationId })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  return project?.organizationId || null;
}

/**
 * Get all projects for an organization
 */
export async function getProjectsForOrganization(organizationId: string) {
  const db = getDb();

  return await db
    .select()
    .from(projects)
    .where(eq(projects.organizationId, organizationId))
    .orderBy(projects.createdAt);
}

/**
 * Get default project for organization (without auto-creating)
 */
export async function getDefaultProject(organizationId: string) {
  const db = getDb();

  const [defaultProject] = await db
    .select()
    .from(projects)
    .where(
      and(
        eq(projects.organizationId, organizationId),
        eq(projects.isDefault, true)
      )
    )
    .limit(1);

  return defaultProject || null;
}

/**
 * Get default project for organization (create if doesn't exist)
 */
export async function getOrCreateDefaultProject(organizationId: string) {
  const db = getDb();

  // Try to get default project
  const [defaultProject] = await db
    .select()
    .from(projects)
    .where(
      and(
        eq(projects.organizationId, organizationId),
        eq(projects.isDefault, true)
      )
    )
    .limit(1);

  if (defaultProject) {
    return defaultProject;
  }

  // Create default project
  const [newProject] = await db
    .insert(projects)
    .values({
      organizationId,
      name: 'Default Project',
      isDefault: true,
    })
    .returning();

  return newProject;
}

/**
 * Update a project
 */
export async function updateProject(
  projectId: string,
  organizationId: string,
  data: ProjectUpdateData
) {
  const db = getDb();

  const [updatedProject] = await db
    .update(projects)
    .set(data)
    .where(
      and(
        eq(projects.id, projectId),
        eq(projects.organizationId, organizationId)
      )
    )
    .returning();

  return updatedProject || null;
}

/**
 * Delete a project
 */
export async function deleteProject(
  projectId: string,
  organizationId: string
) {
  const db = getDb();

  const result = await db
    .delete(projects)
    .where(
      and(
        eq(projects.id, projectId),
        eq(projects.organizationId, organizationId)
      )
    )
    .returning();

  return result.length > 0;
}

/**
 * Validate user has access to project (VULN-001 FIX - REFACTORED)
 *
 * Security: Multi-layer validation
 * 1. Resolves organization slug/ID to actual organization
 * 2. Validates user is a member of that organization
 * 3. Validates project exists and belongs to organization
 *
 * This is the SINGLE SOURCE OF TRUTH for project access validation.
 * Use this function in route loaders and server functions.
 *
 * @param userId - User ID to check
 * @param projectId - Project ID to validate
 * @param organizationSlugOrId - Organization slug or ID from URL
 * @returns Object with project and organization if access granted, null otherwise
 */
export async function validateProjectAccess(
  userId: string,
  projectId: string,
  organizationSlugOrId: string
) {
  // First, validate organization access (includes membership check)
  const orgAccess = await validateOrganizationAccess(
    userId,
    organizationSlugOrId
  );

  if (!orgAccess) {
    return null;
  }

  // Then validate project belongs to organization
  const project = await getProjectById(projectId, orgAccess.id);

  if (!project) {
    return null;
  }

  return {
    project,
    organization: orgAccess,
  };
}
