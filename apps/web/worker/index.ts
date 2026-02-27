import { app } from "./app";

const worker: ExportedHandler<Env> = {
  async fetch(request, env, ctx) {
    return app.fetch(request, env, ctx);
  },
};

export default worker;
