import { eq, and } from 'drizzle-orm';
import { getDb } from '../database/setup';
import { projects } from '../schema';

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
