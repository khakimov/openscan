/**
 * Project domain types - shared across UI, workers, and data-ops
 * Single source of truth for project representations
 */

export interface ProjectEntity {
  id: string;
  name: string | null;
  description?: string | null;
  domain?: string | null;
  organizationId?: string;
  isDefault?: boolean;
  createdAt?: string;  // ISO string after JSON serialization
  updatedAt?: string;  // ISO string after JSON serialization
}

// Get organization projects result types
export interface ProjectsListSuccess {
  success: true;
  projects: ProjectEntity[];
  error?: undefined;
}

export interface ProjectsListError {
  success: false;
  projects: never[];
  error: string;
}

export type ProjectsListResult =
  | ProjectsListSuccess
  | ProjectsListError;

// Validate project access result types
export interface ProjectAccessSuccess {
  success: true;
  project: ProjectEntity;
  error?: undefined;
}

export interface ProjectAccessError {
  success: false;
  project: null;
  error: string;
  statusCode?: 403 | 404 | 500;
  code?: string;
}

export type ProjectAccessResult =
  | ProjectAccessSuccess
  | ProjectAccessError;

// Create project result types
export interface ProjectCreateSuccess {
  success: true;
  project: ProjectEntity;
  error?: undefined;
}

export interface ProjectCreateError {
  success: false;
  project?: undefined;
  error: string;
}

export type ProjectCreateResult =
  | ProjectCreateSuccess
  | ProjectCreateError;
