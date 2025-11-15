import {
  createFileRoute,
  Outlet,
  notFound,
  redirect,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { TRPCClientError } from "@trpc/client";
import { OrganizationGate } from "@/components/layout/organization-gate";
import { Spinner } from "@/components/ui/spinner";
import { ErrorLayout, type ErrorAction } from "@/components/error-layout";

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
  "eot", // Assets
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

type OrganizationRouteError = {
  status: number;
  message: string;
  code?: string;
};

const toOrganizationRouteError = (error: unknown): OrganizationRouteError => {
  // Handle tRPC errors first (preserves accurate status codes)
  if (error instanceof TRPCClientError) {
    const status = error.data?.httpStatus ?? 500;
    return {
      status,
      message: error.message,
      code: error.data?.code,
    };
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    "message" in error &&
    typeof (error as any).status === "number" &&
    typeof (error as any).message === "string"
  ) {
    return {
      status: (error as any).status,
      message: (error as any).message,
      code:
        "code" in error && typeof (error as any).code === "string"
          ? (error as any).code
          : undefined,
    };
  }

  if (typeof error === "object" && error !== null) {
    const statusCode =
      "statusCode" in error && typeof (error as any).statusCode === "number"
        ? (error as any).statusCode
        : undefined;
    const message =
      "message" in error && typeof (error as any).message === "string"
        ? (error as any).message
        : undefined;
    const code =
      "code" in error && typeof (error as any).code === "string"
        ? String((error as any).code)
        : undefined;

    if (statusCode) {
      return {
        status: statusCode,
        message: message ?? "Unexpected error while resolving organization",
        code,
      };
    }
  }

  return {
    status: 500,
    message:
      error instanceof Error
        ? error.message
        : "Unexpected error while resolving organization",
    code: "ORG_UNKNOWN_ERROR",
  };
};

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
    const identifier = params.organizationId;

    try {
      // OpenPanel pattern: Use tRPC options proxy for loader queries
      const detailQuery = context.trpc.organization.get.queryOptions({
        organizationId: identifier,
      });
      const org = await context.queryClient.fetchQuery(detailQuery);

      // Redirect from ID to slug for cleaner URLs
      if (org.slug && identifier === org.id) {
        const newPath = location.pathname.replace(`/${org.id}`, `/${org.slug}`);

        throw redirect({
          to: newPath,
          search: location.search as any,
          replace: true,
        });
      }

      // OpenPanel pattern: Prefetch projects using tRPC queryOptions
      // Use org.id (not slug) as the TRPC router expects the real organization ID
      const projectsQuery = context.trpc.project.listByOrg.queryOptions({
        organizationId: org.id,
      });
      await context.queryClient.prefetchQuery(projectsQuery);

      return {
        organization: org,
      };
    } catch (error) {
      throw toOrganizationRouteError(error);
    }
  },
  errorComponent: OrganizationError,
  component: OrganizationLayout,
});

function OrganizationError({ error }: ErrorComponentProps) {
  const payload = toOrganizationRouteError(error);
  const status = payload.status;
  const code = payload.code;
  const message = payload.message;
  const is403 = status === 403;

  const actions: ErrorAction[] = [
    { label: "Go Home", to: "/", variant: "default" },
    {
      label: "Go Back",
      onClick: () => window.history.back(),
      variant: "outline",
    },
  ];

  return (
    <ErrorLayout
      status={status}
      title={is403 ? "Access Denied" : "Organization Not Found"}
      message={
        is403
          ? "You don't have access to this organization."
          : message
      }
      actions={actions}
      technicalDetails={
        code ? (
          <dl className="text-sm text-muted-foreground">
            <div className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1">
              <dt className="font-semibold">Error code</dt>
              <dd>{code}</dd>
            </div>
          </dl>
        ) : null
      }
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
