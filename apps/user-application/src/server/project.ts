/**
 * Project server functions for SSR
 *
 * Uses createServerFn to access Worker bindings (env.DB) during SSR
 * Leverages existing data-ops queries for consistency
 */

import { createServerFn } from '@tanstack/react-start';
import { getProjectById, getProjectsForOrganization } from '@repo/data-ops';
import { initDatabase } from '@repo/data-ops/database/setup';
import { env } from 'cloudflare:workers';

interface GetProjectInput {
  organizationId: string;
  projectId: string;
}

/**
 * Get Workers env
 */
function getEnv(): Env {
  initDatabase(env.DB);
  return env;
}

/**
 * Get project by ID (SSR-safe)
 *
 * Uses data-ops query with direct DB access via Worker binding - no HTTP calls
 */
export const getProject = createServerFn({ method: 'GET' })
  .inputValidator((input: GetProjectInput) => input)
  .handler(async ({ data, context }) => {
    getEnv();

    const project = await getProjectById(data.projectId, data.organizationId);

    if (!project) {
      throw new Error('Project not found');
    }

    console.log('[getProject serverFn]', {
      projectId: data.projectId,
      organizationId: data.organizationId,
      projectName: project.name,
      isSSR: typeof window === 'undefined'
    });

    return project;
  });

/**
 * List all projects for an organization (SSR-safe)
 *
 * Uses data-ops query with direct DB access via Worker binding - no HTTP calls
 */
export const listProjects = createServerFn({ method: 'GET' })
  .inputValidator((organizationId: string) => organizationId)
  .handler(async ({ data: organizationId, context }) => {
    getEnv();

    const projects = await getProjectsForOrganization(organizationId);

    console.log('[listProjects serverFn]', {
      organizationId,
      projectCount: projects.length,
      isSSR: typeof window === 'undefined'
    });

    return projects;
  });
