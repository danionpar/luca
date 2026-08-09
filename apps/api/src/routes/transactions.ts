import type { FastifyInstance } from "fastify";
import { eq, and, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import { transactions } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";

const createSchema = z.object({
  type: z.enum(["income", "expense", "saving"]),
  amount: z.number().int().positive(),
  categoryId: z.string().uuid().optional(),
  merchant: z.string().max(200).optional(),
  description: z.string().max(500).optional(),
  transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  source: z.enum(["email", "manual"]).default("manual"),
  bank: z.string().max(100).optional(),
  paymentMethod: z.string().max(100).optional(),
});

const updateSchema = z.object({
  type: z.enum(["income", "expense", "saving"]).optional(),
  amount: z.number().int().positive().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  merchant: z.string().max(200).nullable().optional(),
  description: z.string().max(500).nullable().optional(),
  transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const filtersSchema = z.object({
  month: z.coerce.number().int().min(1).max(12).optional(),
  year: z.coerce.number().int().min(2000).optional(),
  type: z.enum(["income", "expense", "saving"]).optional(),
  categoryId: z.string().uuid().optional(),
});

export async function transactionRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  // List transactions with filters
  app.get("/api/transactions", async (request) => {
    const userId = (request as any).user.id;
    const filters = filtersSchema.parse(request.query);

    const now = new Date();
    const month = filters.month ?? now.getMonth() + 1;
    const year = filters.year ?? now.getFullYear();

    const conditions = [
      eq(transactions.userId, userId),
      sql`EXTRACT(MONTH FROM ${transactions.transactionDate}::date) = ${month}`,
      sql`EXTRACT(YEAR FROM ${transactions.transactionDate}::date) = ${year}`,
    ];

    if (filters.type) conditions.push(eq(transactions.type, filters.type));
    if (filters.categoryId)
      conditions.push(eq(transactions.categoryId, filters.categoryId));

    const rows = await db
      .select()
      .from(transactions)
      .where(and(...conditions))
      .orderBy(sql`${transactions.transactionDate} DESC`);

    return { data: rows };
  });

  // Summary for a month
  app.get("/api/transactions/summary", async (request) => {
    const userId = (request as any).user.id;
    const { month, year } = filtersSchema.parse(request.query);

    const now = new Date();
    const m = month ?? now.getMonth() + 1;
    const y = year ?? now.getFullYear();

    const [result] = await db
      .select({
        totalIncome: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'income' AND ${transactions.isProjected} = false THEN ${transactions.amount} ELSE 0 END), 0)`,
        totalExpenses: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'expense' AND ${transactions.isProjected} = false THEN ${transactions.amount} ELSE 0 END), 0)`,
        totalSavings: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'saving' AND ${transactions.isProjected} = false THEN ${transactions.amount} ELSE 0 END), 0)`,
        totalProjected: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.isProjected} = true THEN ${transactions.amount} ELSE 0 END), 0)`,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          sql`EXTRACT(MONTH FROM ${transactions.transactionDate}::date) = ${m}`,
          sql`EXTRACT(YEAR FROM ${transactions.transactionDate}::date) = ${y}`
        )
      );

    const income = Number(result.totalIncome);
    const expenses = Number(result.totalExpenses);
    const savings = Number(result.totalSavings);
    const projectedExpenses = Number(result.totalProjected);

    return {
      data: {
        totalIncome: income,
        totalExpenses: expenses,
        totalSavings: savings,
        totalProjected: projectedExpenses,
        available: income - expenses - savings,
        month: m,
        year: y,
      },
    };
  });

  // Create transaction
  app.post("/api/transactions", async (request, reply) => {
    const userId = (request as any).user.id;
    const body = createSchema.parse(request.body);
    const [row] = await db
      .insert(transactions)
      .values({ ...body, userId })
      .returning();
    return reply.status(201).send({ data: row });
  });

  // Update transaction
  app.put("/api/transactions/:id", async (request, reply) => {
    const userId = (request as any).user.id;
    const { id } = request.params as { id: string };
    const body = updateSchema.parse(request.body);

    const [existing] = await db
      .select()
      .from(transactions)
      .where(and(eq(transactions.id, id), eq(transactions.userId, userId)));

    if (!existing) return reply.status(404).send({ error: "Not found" });

    const [row] = await db
      .update(transactions)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(transactions.id, id))
      .returning();
    return { data: row };
  });

  // Delete transaction
  app.delete("/api/transactions/:id", async (request, reply) => {
    const userId = (request as any).user.id;
    const { id } = request.params as { id: string };

    const [existing] = await db
      .select()
      .from(transactions)
      .where(and(eq(transactions.id, id), eq(transactions.userId, userId)));

    if (!existing) return reply.status(404).send({ error: "Not found" });

    await db.delete(transactions).where(eq(transactions.id, id));
    return reply.status(204).send();
  });
}
