import "dotenv/config";
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

const counts = await sql`SELECT COUNT(*) as total, type, EXTRACT(MONTH FROM transaction_date::date) as month FROM transactions GROUP BY type, month ORDER BY month, type`;
console.log("=== BY TYPE AND MONTH ===");
console.table(counts);

const total = await sql`SELECT COUNT(*) as total FROM transactions`;
console.log("Total transactions:", total[0].total);

const sample = await sql`SELECT merchant, amount, type, transaction_date FROM transactions ORDER BY transaction_date DESC LIMIT 5`;
console.log("\n=== LATEST 5 ===");
console.table(sample);
