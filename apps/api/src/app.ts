import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { fromNodeHeaders } from "better-auth/node";
import { env } from "./config/env.js";
import { auth } from "./config/auth.js";
import { categoryRoutes } from "./routes/categories.js";
import { transactionRoutes } from "./routes/transactions.js";
import { statementRoutes } from "./routes/statements.js";

export async function buildApp() {
  const app = Fastify({ logger: true });

  await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } });

  await app.register(cors, {
    origin: env.CORS_ORIGIN,
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"],
  });

  // Better Auth catch-all
  app.route({
    method: ["GET", "POST"],
    url: "/api/auth/*",
    async handler(request, reply) {
      const url = new URL(request.url, `http://${request.headers.host}`);
      const headers = fromNodeHeaders(request.headers);
      const req = new Request(url.toString(), {
        method: request.method,
        headers,
        ...(request.body ? { body: JSON.stringify(request.body) } : {}),
      });
      const response = await auth.handler(req);
      reply.status(response.status);
      response.headers.forEach((value, key) => reply.header(key, value));
      return reply.send(response.body ? await response.text() : null);
    },
  });

  // Routes
  await app.register(categoryRoutes);
  await app.register(transactionRoutes);
  await app.register(statementRoutes);

  // Health check
  app.get("/health", async () => ({ status: "ok" }));

  return app;
}
