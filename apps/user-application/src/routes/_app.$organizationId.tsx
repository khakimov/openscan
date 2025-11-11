import { createFileRoute, Outlet, notFound, redirect } from "@tanstack/react-router";
import { getOrganizationById } from "@/server/organization";

// Reserved organization IDs that cannot be used (minimal approach from OpenPanel)
const RESERVED_ORGANIZATION_IDS = [
  'api',           // API routes
  'onboarding',    // Onboarding flow
  'login',         // Auth routes
  '.well-known',   // OIDC/security standards
];

// File extensions to block from routing
const FILE_EXTENSIONS = [
  'jpg', 'jpeg', 'png', 'gif', 'bmp', 'tiff', 'ico',  // Images
  'js', 'xml', 'txt', 'json', 'webmanifest',          // Static files
  'css', 'map', 'woff', 'woff2', 'ttf', 'eot',        // Assets
];

/**
 * Check if path looks like a static file request
 */
const isStaticFile = (path: string): boolean => {
  return FILE_EXTENSIONS.some((extension) => path.endsWith(`.${extension}`));
};

export const Route = createFileRoute("/_app/$organizationId")({
  beforeLoad: async ({ params }) => {
    // Block reserved organization IDs
    if (RESERVED_ORGANIZATION_IDS.includes(params.organizationId)) {
      throw notFound();
    }

    // Block static file paths from routing
    if (isStaticFile(params.organizationId)) {
      throw notFound();
    }

    // Note: Organization existence is validated by the loader query
    // If org doesn't exist, the query will naturally throw 404
  },
  loader: async ({ params, location }) => {
    // Validate organization exists and user has access
    // This will throw if organization doesn't exist or user doesn't have access
    const result = await getOrganizationById({ data: params.organizationId });

    if (!result.success) {
      throw notFound();
    }

    const org = result.organization;

    // Redirect from ID to slug for cleaner URLs (prevents flash of wrong URL)
    // Only redirect if:
    // 1. Organization has a slug
    // 2. Current URL is using the ID (not already using the slug)
    if (org.slug && params.organizationId === org.id) {
      // Replace the org ID with slug in the current path
      const newPath = location.pathname.replace(`/${org.id}`, `/${org.slug}`);

      throw redirect({
        to: newPath,
        search: location.search as any,
        replace: true, // Replace history to avoid back button confusion
      });
    }

    return {
      organization: org,
    };
  },
  component: OrganizationLayout,
});

function OrganizationLayout() {
  return <Outlet />;
}
