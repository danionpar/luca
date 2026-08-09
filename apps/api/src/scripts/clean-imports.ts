import "dotenv/config";
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

console.log("Cleaning imported transactions and statements...");
const del1 = await sql`DELETE FROM transactions WHERE source = 'email'`;
console.log(`Deleted ${del1.length} email transactions (count via rowCount not available, check DB)`);
const del2 = await sql`DELETE FROM imported_statements`;
console.log("Deleted imported_statements records");
const count = await sql`SELECT COUNT(*) as total FROM transactions`;
console.log(`Remaining transactions: ${count[0].total}`);
