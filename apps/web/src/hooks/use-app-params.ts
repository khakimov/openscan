import { useParams } from "@tanstack/react-router";

/**
 * Hook to extract organization and project parameters from URL
 *
 * This implements the URL-based project context pattern:
 * - URL structure: /:organizationId/:projectId/*
 * - No session state needed - URL is source of truth
 * - Works across all routes with strict: false
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { organizationId, projectId } = useAppParams();
 *   const devices = await getDevices(organizationId, projectId);
 * }
 * ```
 */
export function useAppParams() {
  const params = useParams({
    strict: false,
  });

  return params as {
    organizationId: string;
    projectId: string;
  };
}
