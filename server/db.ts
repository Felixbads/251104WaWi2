import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@shared/schema";

// Initialize the database client
const connectionString = process.env.DATABASE_URL || "";
const sql = postgres(connectionString, { max: 10 });
export const db = drizzle(sql, { schema });
