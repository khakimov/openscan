import type { IncomingMessage } from "http";

/**
 * Type-safe wrappers for better-auth organization plugin API methods
 *
 * The organization plugin methods exist at runtime but aren't in the TypeScript types.
 * These wrappers provide type safety without using 'any'.
 */

export interface Organization {
  id: string;
  name: string;
  slug: string;
  logo?: string | null;
  metadata?: string | null;
  createdAt: Date;
}

export interface CreateOrganizationParams {
  name: string;
  slug?: string;
  logo?: string;
  metadata?: Record<string, any>;
}

export interface SetActiveOrganizationParams {
  organizationId: string;
}

export type SetActiveOrganizationHeadersResult = {
  headers: Headers;
  response: Organization | null;
};

/**
 * Organization API methods interface
 * Cast any better-auth instance to this type to access organization methods
 */
export interface OrganizationAPI {
  createOrganization(params: {
    body: CreateOrganizationParams;
    headers: Headers | IncomingMessage["headers"];
  }): Promise<Organization>;

  setActiveOrganization<T extends boolean | undefined = undefined>(params: {
    body: SetActiveOrganizationParams;
    headers: Headers | IncomingMessage["headers"];
    returnHeaders?: T;
  }): Promise<T extends true ? SetActiveOrganizationHeadersResult : void>;

  listOrganizations(params: {
    headers: Headers | IncomingMessage["headers"];
  }): Promise<Organization[]>;
}

/**
 * Extended session type with organization plugin fields
 */
export interface SessionWithOrganization {
  id: string;
  userId: string;
  expiresAt: Date;
  token: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  // Organization plugin adds this field
  activeOrganizationId?: string;
}

/**
 * Cast a better-auth instance to access organization plugin methods
 *
 * @example
 * const auth = getAuth();
 * const orgAPI = getOrganizationAPI(auth);
 * const orgs = await orgAPI.listOrganizations({ headers: request.headers });
 */
export function getOrganizationAPI(authInstance: { api: unknown }): OrganizationAPI {
  return authInstance.api as unknown as OrganizationAPI;
}

/**
 * Extract activeOrganizationId from a session object
 */
export function getActiveOrganizationId(session: { session: unknown }): string | undefined {
  return (session.session as SessionWithOrganization).activeOrganizationId;
}
