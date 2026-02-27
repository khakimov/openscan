/**
 * Reserved IDs that cannot be used as organization or project identifiers
 * 
 * These are blocked to prevent routing conflicts with system routes,
 * static files, and API endpoints.
 */

/**
 * Organization IDs that cannot be used (system routes)
 */
export const RESERVED_ORGANIZATION_IDS = [
  "api", // API routes
  "onboarding", // Onboarding flow
  "login", // Auth routes
  ".well-known", // OIDC/security standards
] as const;

/**
 * Project IDs that cannot be used (org-scoped system routes)
 */
export const RESERVED_PROJECT_IDS = [
  "settings", // Organization settings
  "members", // Organization members
  "billing", // Organization billing
  "integrations", // Organization integrations
] as const;

/**
 * File extensions to block from routing
 * Prevents static file requests from being handled by the router
 */
export const BLOCKED_FILE_EXTENSIONS = [
  // Images
  "jpg",
  "jpeg",
  "png",
  "gif",
  "bmp",
  "tiff",
  "ico",
  // Static files
  "js",
  "xml",
  "txt",
  "json",
  "webmanifest",
  // Styles
  "css",
  "map",
  // Fonts
  "woff",
  "woff2",
  "ttf",
  "eot",
] as const;

/**
 * Check if a path looks like a static file request
 */
export function isStaticFile(path: string): boolean {
  return BLOCKED_FILE_EXTENSIONS.some((extension) =>
    path.endsWith(`.${extension}`)
  );
}

/**
 * Check if an organization ID is reserved
 */
export function isReservedOrganizationId(id: string): boolean {
  return RESERVED_ORGANIZATION_IDS.includes(id as typeof RESERVED_ORGANIZATION_IDS[number]);
}

/**
 * Check if a project ID is reserved
 */
export function isReservedProjectId(id: string): boolean {
  return RESERVED_PROJECT_IDS.includes(id as typeof RESERVED_PROJECT_IDS[number]);
}
