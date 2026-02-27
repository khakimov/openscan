import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/health')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        console.log('[HEALTH] Handler called:', request.url);
        return new Response(JSON.stringify({ ok: true, time: Date.now() }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      },
    },
  },
});
