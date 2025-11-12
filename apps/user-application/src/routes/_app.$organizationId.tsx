import { createFileRoute, Outlet, notFound, redirect, Link, ErrorComponentProps } from "@tanstack/react-router";
import { getOrganizationById } from "@/server/organization";
import { AlertTriangle, Home, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
    const raw = await getOrganizationById({ data: params.organizationId });

    // Guard the shape before using it
    if (!raw || typeof raw !== 'object' || !('success' in raw)) {
      throw notFound();
    }

    const result = raw as
      | { success: true; organization: { id: string; slug?: string | null; metadata: { [x: string]: {} } | null } }
      | { success: false; statusCode?: number; error?: string };

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
  const errorMessage = is403
    ? "You don't have access to this organization"
    : error?.message || "Organization not found";

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center space-x-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <CardTitle className="text-xl">
                {is403 ? "Access Denied" : "Not Found"}
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {errorMessage}
              </p>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3">
            <Button variant="default" asChild>
              <Link to="/" className="flex items-center gap-2">
                <Home className="h-4 w-4" />
                Go to Home
              </Link>
            </Button>

            <Button
              variant="outline"
              onClick={() => window.history.back()}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Go Back
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function OrganizationLayout() {
  return <Outlet />;
}
