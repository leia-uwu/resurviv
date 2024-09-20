import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "./schema";

const sqlite = new Database("game.db");
export const closeDB = () => sqlite.close();
export const db = drizzle(sqlite, { schema });
