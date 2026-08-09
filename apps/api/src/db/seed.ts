import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { categories } from "./schema.js";

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql);

const systemCategories = [
  { emoji: "🏠", name: "Vivienda", type: "expense" as const, sortOrder: 1 },
  { emoji: "🛒", name: "Supermercado", type: "expense" as const, sortOrder: 2 },
  { emoji: "🍔", name: "Delivery / Comida fuera", type: "expense" as const, sortOrder: 3 },
  { emoji: "🚗", name: "Transporte", type: "expense" as const, sortOrder: 4 },
  { emoji: "⛽", name: "Bencina", type: "expense" as const, sortOrder: 5 },
  { emoji: "💊", name: "Salud", type: "expense" as const, sortOrder: 6 },
  { emoji: "🎓", name: "Educación", type: "expense" as const, sortOrder: 7 },
  { emoji: "👗", name: "Ropa", type: "expense" as const, sortOrder: 8 },
  { emoji: "🎬", name: "Entretenimiento", type: "expense" as const, sortOrder: 9 },
  { emoji: "📱", name: "Suscripciones", type: "expense" as const, sortOrder: 10 },
  { emoji: "🐾", name: "Mascotas", type: "expense" as const, sortOrder: 11 },
  { emoji: "🎁", name: "Regalos", type: "expense" as const, sortOrder: 12 },
  { emoji: "💇", name: "Cuidado personal", type: "expense" as const, sortOrder: 13 },
  { emoji: "🏦", name: "Servicios financieros", type: "expense" as const, sortOrder: 14 },
  { emoji: "📦", name: "Otros gastos", type: "expense" as const, sortOrder: 15 },
  { emoji: "💰", name: "Sueldo", type: "income" as const, sortOrder: 1 },
  { emoji: "💵", name: "Otros ingresos", type: "income" as const, sortOrder: 2 },
  { emoji: "🐷", name: "Ahorro", type: "saving" as const, sortOrder: 1 },
];

async function seed() {
  console.log("Seeding system categories...");

  for (const cat of systemCategories) {
    await db
      .insert(categories)
      .values({ ...cat, isSystem: true, isActive: true })
      .onConflictDoNothing();
  }

  console.log(`Seeded ${systemCategories.length} system categories.`);
}

seed().catch(console.error);
