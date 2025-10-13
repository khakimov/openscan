import { auth_user, organization } from '../drizzle/auth-schema';

// Re-export organization tables from better-auth schema
// We use better-auth's organization as our tenant/org system
export { organization, member as organizationMember, invitation as organizationInvitation } from '../drizzle/auth-schema';

// Type aliases for backward compatibility with existing code
export type Tenant = typeof organization.$inferSelect;
export type Organization = typeof organization.$inferSelect;

// Users are managed by better-auth
export { auth_user as users };
export type User = typeof auth_user.$inferSelect;
