import { createFileRoute, Outlet, notFound } from "@tanstack/react-router";
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
  loader: async ({ params }) => {
    // Validate organization exists and user has access
    // This will throw if organization doesn't exist or user doesn't have access
    const result = await getOrganizationById({ data: params.organizationId });

    if (!result.success) {
      throw notFound();
    }

    return {
      organization: result.organization,
    };
  },
  component: OrganizationLayout,
});

function OrganizationLayout() {
  return <Outlet />;
}
