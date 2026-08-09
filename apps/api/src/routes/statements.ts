import type { FastifyInstance } from "fastify";
import { eq, and } from "drizzle-orm";
import { writeFileSync, unlinkSync, mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { db } from "../db/index.js";
import { transactions, importedStatements } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";
import {
  parseBancoChileCreditCardStatement,
  type ParsedTransaction,
} from "../parsers/banco-chile-credit-card.js";

function getBillingMonth(periodTo: string): string {
  // periodTo is YYYY-MM-DD, billing month = month of periodTo
  return periodTo.slice(0, 7); // "2026-04"
}

function addMonths(yearMonth: string, n: number): string {
  const [y, m] = yearMonth.split("-").map(Number);
  const date = new Date(y, m - 1 + n, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function parseInstallment(s: string | null): { current: number; total: number } | null {
  if (!s || s === "01/01") return null;
  const [current, total] = s.split("/").map(Number);
  if (!current || !total || total <= 1) return null;
  return { current, total };
}

export async function statementRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  app.get("/api/statements", async (request) => {
    const userId = (request as any).user.id;
    const rows = await db
      .select()
      .from(importedStatements)
      .where(eq(importedStatements.userId, userId))
      .orderBy(importedStatements.statementDate);
    return { data: rows };
  });

  app.post("/api/statements/upload", async (request, reply) => {
    const userId = (request as any).user.id;
    const parts = request.parts();

    let fileBuffer: Buffer | null = null;
    let password = "";

    for await (const part of parts) {
      if (part.type === "file") {
        const chunks: Buffer[] = [];
        for await (const chunk of part.file) chunks.push(chunk);
        fileBuffer = Buffer.concat(chunks);
      } else {
        if (part.fieldname === "password") password = part.value as string;
      }
    }

    if (!fileBuffer) return reply.status(400).send({ error: "No file uploaded" });
    if (!password) return reply.status(400).send({ error: "PDF password required" });

    const tmpDir = mkdtempSync(join(tmpdir(), "upload-"));
    const tmpPath = join(tmpDir, "statement.pdf");
    writeFileSync(tmpPath, fileBuffer);

    try {
      const statement = await parseBancoChileCreditCardStatement(tmpPath, password);
      const billingMonth = getBillingMonth(statement.periodTo);

      // Check duplicate statement
      const [existing] = await db
        .select()
        .from(importedStatements)
        .where(
          and(
            eq(importedStatements.userId, userId),
            eq(importedStatements.cardLastFour, statement.cardLastFour),
            eq(importedStatements.periodFrom, statement.periodFrom),
            eq(importedStatements.periodTo, statement.periodTo)
          )
        );

      if (existing) {
        return reply.status(409).send({
          error: "Esta cartola ya fue importada",
          data: {
            importedAt: existing.createdAt,
            period: `${existing.periodFrom} → ${existing.periodTo}`,
            transactionsImported: existing.transactionsImported,
          },
        });
      }

      let imported = 0;
      let projected = 0;
      let skipped = 0;

      for (const tx of statement.transactions) {
        if (tx.merchant.includes("Pago Pesos TEF")) { skipped++; continue; }

        // Dedup
        const [dup] = await db
          .select()
          .from(transactions)
          .where(
            and(
              eq(transactions.userId, userId),
              eq(transactions.rawEmailUid, tx.referenceCode)
            )
          );
        if (dup) { skipped++; continue; }

        const isRefund = tx.amount < 0;
        const inst = parseInstallment(tx.installment);

        // Check if this replaces a projected transaction
        if (inst) {
          const projRef = `proj-${tx.referenceCode}-${inst.current}`;
          const [projTx] = await db
            .select()
            .from(transactions)
            .where(
              and(
                eq(transactions.userId, userId),
                eq(transactions.rawEmailUid, projRef),
                eq(transactions.isProjected, true)
              )
            );
          if (projTx) {
            await db.delete(transactions).where(eq(transactions.id, projTx.id));
          }
        }

        // Insert real transaction
        await db.insert(transactions).values({
          userId,
          type: isRefund ? "income" : "expense",
          amount: Math.abs(tx.amount),
          merchant: tx.merchant,
          description: inst
            ? `Cuota ${inst.current}/${inst.total} | ${tx.location}`
            : tx.location || null,
          transactionDate: tx.date,
          source: "email",
          bank: "Banco de Chile",
          paymentMethod: `TC ****${statement.cardLastFour}`,
          rawEmailUid: tx.referenceCode,
          billingMonth,
          isProjected: false,
          installmentCurrent: inst?.current ?? null,
          installmentTotal: inst?.total ?? null,
        });
        imported++;

        // Project future installments
        if (inst && inst.current < inst.total) {
          const remaining = inst.total - inst.current;
          const monthsToProject = Math.min(remaining, 3);

          for (let i = 1; i <= monthsToProject; i++) {
            const futureMonth = addMonths(billingMonth, i);
            const futureInstallment = inst.current + i;
            const projRef = `proj-${tx.referenceCode}-${futureInstallment}`;

            // Don't create if already exists
            const [existingProj] = await db
              .select()
              .from(transactions)
              .where(
                and(
                  eq(transactions.userId, userId),
                  eq(transactions.rawEmailUid, projRef)
                )
              );
            if (existingProj) continue;

            await db.insert(transactions).values({
              userId,
              type: "expense",
              amount: Math.abs(tx.amount),
              merchant: tx.merchant,
              description: `Cuota ${futureInstallment}/${inst.total} | ${tx.location} (proyectado)`,
              transactionDate: `${futureMonth}-15`, // mid-month placeholder
              source: "email",
              bank: "Banco de Chile",
              paymentMethod: `TC ****${statement.cardLastFour}`,
              rawEmailUid: projRef,
              billingMonth: futureMonth,
              isProjected: true,
              installmentCurrent: futureInstallment,
              installmentTotal: inst.total,
            });
            projected++;
          }
        }
      }

      // Record import
      await db.insert(importedStatements).values({
        userId,
        bank: "Banco de Chile",
        cardLastFour: statement.cardLastFour,
        periodFrom: statement.periodFrom,
        periodTo: statement.periodTo,
        statementDate: statement.statementDate,
        totalBilled: statement.totalBilled,
        transactionsImported: imported,
      });

      return reply.status(200).send({
        data: {
          statementDate: statement.statementDate,
          period: `${statement.periodFrom} → ${statement.periodTo}`,
          billingMonth,
          totalBilled: statement.totalBilled,
          totalParsed: statement.transactions.length,
          imported,
          projected,
          skipped,
        },
      });
    } catch (err: any) {
      return reply.status(422).send({ error: `Error al procesar PDF: ${err.message}` });
    } finally {
      try { unlinkSync(tmpPath); } catch {}
    }
  });
}
