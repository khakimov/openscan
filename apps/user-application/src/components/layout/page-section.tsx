/**
 * PageSection - Reusable page section with title, description, and actions
 *
 * Provides consistent header structure for list pages and dashboards.
 * Centralizes the "title + description + actions" pattern.
 *
 * Usage:
 * ```tsx
 * <PageSection
 *   title="Projects"
 *   description="Manage your security scanning projects"
 *   actions={<Button>Create Project</Button>}
 * >
 *   <ProjectsList />
 * </PageSection>
 * ```
 */

import type { ReactNode } from 'react';
import { Padding } from '@/components/ui/padding';

export interface PageSectionProps {
  /** Section title */
  title: string;
  /** Optional description text */
  description?: string;
  /** Optional action buttons */
  actions?: ReactNode;
  /** Section content */
  children: ReactNode;
}

export function PageSection({
  title,
  description,
  actions,
  children,
}: PageSectionProps) {
  return (
    <Padding>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold mb-1">{title}</h1>
          {description && (
            <p className="text-muted-foreground">{description}</p>
          )}
        </div>
        {actions}
      </div>
      {children}
    </Padding>
  );
}
