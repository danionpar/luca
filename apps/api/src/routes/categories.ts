import type { FastifyInstance } from "fastify";
import { eq, and, or, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import { categories } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";

const createSchema = z.object({
  name: z.string().min(1).max(50),
  emoji: z.string().min(1).max(4),
  type: z.enum(["income", "expense", "saving"]),
  parentId: z.string().uuid().optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  emoji: z.string().min(1).max(4).optional(),
  type: z.enum(["income", "expense", "saving"]).optional(),
});

export async function categoryRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  // List categories (system + user's custom)
  app.get("/api/categories", async (request) => {
    const userId = (request as any).user.id;
    const rows = await db
      .select()
      .from(categories)
      .where(
        and(
          eq(categories.isActive, true),
          or(eq(categories.isSystem, true), eq(categories.userId, userId))
        )
      );
    return { data: rows };
  });

  // Create custom category
  app.post("/api/categories", async (request, reply) => {
    const userId = (request as any).user.id;
    const body = createSchema.parse(request.body);
    const [row] = await db
      .insert(categories)
      .values({ ...body, userId, isSystem: false })
      .returning();
    return reply.status(201).send({ data: row });
  });

  // Update custom category (not system)
  app.put("/api/categories/:id", async (request, reply) => {
    const userId = (request as any).user.id;
    const { id } = request.params as { id: string };
    const body = updateSchema.parse(request.body);

    const [existing] = await db
      .select()
      .from(categories)
      .where(and(eq(categories.id, id), eq(categories.userId, userId)));

    if (!existing) return reply.status(404).send({ error: "Not found" });
    if (existing.isSystem)
      return reply.status(403).send({ error: "Cannot edit system category" });

    const [row] = await db
      .update(categories)
      .set(body)
      .where(eq(categories.id, id))
      .returning();
    return { data: row };
  });

  // Delete custom category (not system)
  app.delete("/api/categories/:id", async (request, reply) => {
    const userId = (request as any).user.id;
    const { id } = request.params as { id: string };

    const [existing] = await db
      .select()
      .from(categories)
      .where(and(eq(categories.id, id), eq(categories.userId, userId)));

    if (!existing) return reply.status(404).send({ error: "Not found" });
    if (existing.isSystem)
      return reply
        .status(403)
        .send({ error: "Cannot delete system category" });

    await db.delete(categories).where(eq(categories.id, id));
    return reply.status(204).send();
  });

  // Toggle system category active/inactive
  app.patch("/api/categories/:id/toggle", async (request, reply) => {
    const { id } = request.params as { id: string };

    const [existing] = await db
      .select()
      .from(categories)
      .where(and(eq(categories.id, id), eq(categories.isSystem, true)));

    if (!existing)
      return reply.status(404).send({ error: "System category not found" });

    const [row] = await db
      .update(categories)
      .set({ isActive: !existing.isActive })
      .where(eq(categories.id, id))
      .returning();
    return { data: row };
  });
}
