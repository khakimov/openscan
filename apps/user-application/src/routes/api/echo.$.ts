import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/echo/$')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        console.log('[ECHO] Handler called:', request.url, 'params:', params);
        return new Response(JSON.stringify({ ok: true, params, time: Date.now() }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      },
    },
  },
});
