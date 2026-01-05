import {
  createFileRoute,
  Outlet,
  notFound,
  redirect,
} from "@tanstack/react-router";
import { Spinner } from "@/components/ui/spinner";
import { getOrganization, syncActiveOrganization } from "@/server/organization";

// Reserved organization IDs that cannot be used (minimal approach from OpenPanel)
const RESERVED_ORGANIZATION_IDS = [
  "api", // API routes
  "onboarding", // Onboarding flow
  "login", // Auth routes
  ".well-known", // OIDC/security standards
];

// File extensions to block from routing
const FILE_EXTENSIONS = [
  "jpg",
  "jpeg",
  "png",
  "gif",
  "bmp",
  "tiff",
  "ico", // Images
  "js",
  "xml",
  "txt",
  "json",
  "webmanifest", // Static files
  "css",
  "map",
  "woff",
  "woff2",
  "ttf",
  "eot", // Fonts
];

/**
 * Check if path looks like a static file request
 */
const isStaticFile = (path: string): boolean => {
  return FILE_EXTENSIONS.some((extension) => path.endsWith(`.${extension}`));
};

/**
 * Pending shell for organization route
 * Shows centered spinner while organization loader resolves
 * Keeps parent layout (_app) mounted
 */
const OrganizationPendingShell = () => (
  <div className="flex h-[60vh] items-center justify-center">
    <Spinner size="md" wait="delay-200" />
  </div>
);

export const Route = createFileRoute("/_app/$organizationId")({
  pendingComponent: OrganizationPendingShell,
  beforeLoad: async ({ params, location, context }) => {
    // Block reserved organization IDs
    if (RESERVED_ORGANIZATION_IDS.includes(params.organizationId)) {
      throw notFound();
    }

    // Block static file paths from routing
    if (isStaticFile(params.organizationId)) {
      throw notFound();
    }

    const identifier = params.organizationId;

    // ✅ Fetch organization and add to context for child routes
    const organization = await getOrganization({ data: identifier });

    // Redirect from ID to slug for cleaner URLs
    if (organization.slug && identifier === organization.id) {
      const newPath = location.pathname.replace(`/${organization.id}`, `/${organization.slug}`);

      throw redirect({
        to: newPath,
        search: location.search as any,
        replace: true,
      });
    }

    // ✅ Sync URL organization → session (if different)
    // This ensures deep links work immediately and session stays in sync with navigation
    const session = context.session?.session;
    const currentSessionOrgId = session?.activeOrganizationId;

    // Only sync if:
    // 1. User is authenticated (has session)
    // 2. URL org differs from session org
    if (session && currentSessionOrgId !== organization.id) {
      await syncActiveOrganization({
        data: {
          organizationId: identifier,
          currentSessionOrgId,
        },
      });
    }

    // ✅ Return organization in context for child routes to access
    return {
      organization,
    };
  },
  component: OrganizationLayout,
});

function OrganizationLayout() {
  // Organization is guaranteed by beforeLoad (throws if not found)
  // No guard needed - just render children
  return <Outlet />;
}
