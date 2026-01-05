/**
 * Layout Primitives
 *
 * Reusable layout components following OpenPanel's pattern.
 * Provides consistent chrome and structure across all routes.
 */

// Core layouts
export { AppLayout } from './app-layout';
export { AppLayoutPending } from './app-layout-pending';
export { StackedCardLayout } from './stacked-card-layout';
export { TabbedPageLayout } from './tabbed-page-layout';
export { PageSection } from './page-section';

// Gate components
export {
  OrganizationGate,
  type Organization,
  type OrganizationGateProps,
} from './organization-gate';

export {
  ProjectGate,
  useProject,
  useProjectOptional,
  type Project,
  type ProjectGateProps,
} from './project-gate';

// Type exports
export type { AppLayoutProps } from './app-layout';
export type { StackedCardLayoutProps } from './stacked-card-layout';
export type { TabbedPageLayoutProps } from './tabbed-page-layout';
export type { PageSectionProps } from './page-section';
