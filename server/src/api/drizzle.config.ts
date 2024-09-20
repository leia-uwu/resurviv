import { defineConfig } from "drizzle-kit";

export default defineConfig({
    dialect: "sqlite",
    schema: "src/api/db/schema.ts",
    out: "./src/api/db/drizzle",
    dbCredentials: {
        url: "file:./game.db",
    },
});
