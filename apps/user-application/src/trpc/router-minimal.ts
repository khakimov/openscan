import { initTRPC } from '@trpc/server';
import superjson from 'superjson';

const t = initTRPC.create({ transformer: superjson });

export const appRouter = t.router({
  organization: t.router({
    list: t.procedure.query(() => ({ organizations: [], activeOrganizationId: null })),
    get: t.procedure.input((val: unknown) => val as { organizationId: string }).query(({ input }) => ({ 
      id: input.organizationId, 
      name: 'Test', 
      slug: 'test', 
      metadata: null 
    })),
  }),
  project: t.router({
    listByOrg: t.procedure.input((val: unknown) => val as { organizationId: string }).query(() => []),
  }),
});

export type AppRouter = typeof appRouter;
