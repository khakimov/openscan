import { createFileRoute, Outlet, notFound, redirect, type ErrorComponentProps } from "@tanstack/react-router";
import { organizationDetailQuery } from "@/queries";
import { OrganizationGate } from "@/components/layout/organization-gate";
import { Spinner } from "@/components/ui/spinner";
import { ErrorLayout, type ErrorAction } from "@/components/error-layout";
import type { OrganizationByIdResult } from "@/server/organization/types";

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
  loader: async ({ params, location, context }) => {
    // Use query helper for cache seeding (OpenPanel pattern)
    // Automatically caches result for components to consume
    const result: OrganizationByIdResult = await context.queryClient.ensureQueryData(
      organizationDetailQuery(params.organizationId)
    );

    if (!result.success) {
      // Check if it's a permission issue (403) or not found (404)
      if ('statusCode' in result && result.statusCode === 403) {
        // Create a custom error with statusCode property
        const error = new Error("You don't have access to this organization");
        (error as any).statusCode = 403;
        throw error;
      }

      // Otherwise, org doesn't exist (404)
      throw notFound();
    }

    const org = result.organization;

    // Redirect from ID to slug for cleaner URLs (prevents flash of wrong URL)
    // Only redirect if:
    // 1. Organization has a slug
    // 2. Current URL is using the ID (not already using the slug)
    if (org.slug && params.organizationId === org.id) {
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
  errorComponent: OrganizationError,
  component: OrganizationLayout,
});

function OrganizationError({ error }: ErrorComponentProps) {
  const is403 = (error as any)?.statusCode === 403;

  const status = is403 ? 403 : 404;
  const title = is403 ? 'Access Denied' : 'Organization Not Found';
  const message = is403
    ? "You don't have access to this organization."
    : 'The organization you requested could not be found.';

  const actions: ErrorAction[] = [
    { label: 'Go Home', to: '/', variant: 'default' },
    { label: 'Go Back', onClick: () => window.history.back(), variant: 'outline' },
  ];

  return (
    <ErrorLayout
      status={status}
      title={title}
      message={message}
      actions={actions}
    />
  );
}

function OrganizationLayout() {
  const { organization } = Route.useLoaderData();

  return (
    <OrganizationGate organization={organization}>
      <Outlet />
    </OrganizationGate>
  );
}
