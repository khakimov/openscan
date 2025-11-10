import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/$organizationId/$projectId/assets/")({
  beforeLoad: ({ params }) => {
    // Redirect to discovery tab by default
    throw redirect({
      to: "/$organizationId/$projectId/assets/discovery",
      params: {
        organizationId: params.organizationId,
        projectId: params.projectId,
      },
    });
  },
});
