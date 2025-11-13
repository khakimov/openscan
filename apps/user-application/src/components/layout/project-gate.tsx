/**
 * ProjectGate - Context provider for project-scoped routes
 *
 * Provides project data from loader to child routes via context.
 * Follows OpenPanel's "gate" pattern for keeping loader data accessible.
 *
 * Usage in route:
 * ```tsx
 * function ProjectLayout() {
 *   const { project } = Route.useLoaderData();
 *   return (
 *     <ProjectGate project={project}>
 *       <Outlet />
 *     </ProjectGate>
 *   );
 * }
 * ```
 *
 * Usage in child components:
 * ```tsx
 * const project = useProject();
 * ```
 */

import { createContext, useContext, type ReactNode } from 'react';

export interface Project {
  id: string;
  name: string | null;
  domain?: string | null;
  description?: string | null;
  isDefault?: boolean;
}

const ProjectContext = createContext<Project | null>(null);

export interface ProjectGateProps {
  project: Project;
  children: ReactNode;
}

export function ProjectGate({ project, children }: ProjectGateProps) {
  return (
    <ProjectContext.Provider value={project}>
      {children}
    </ProjectContext.Provider>
  );
}

/**
 * Hook to access project from context
 * @throws Error if used outside ProjectGate
 */
export function useProject(): Project {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error('useProject must be used within ProjectGate');
  }
  return context;
}

/**
 * Hook to optionally access project from context
 * Returns null if used outside ProjectGate
 */
export function useProjectOptional(): Project | null {
  return useContext(ProjectContext);
}
