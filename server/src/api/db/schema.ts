import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { ItemStatus, validateLoadout } from "../../../../shared/utils/helpers";
import type { Loadout } from "../zodSchemas";

export const sessionTable = sqliteTable("session", {
    id: text("id").notNull().primaryKey(),
    userId: text("user_id")
        .notNull()
        .references(() => usersTable.id, { onDelete: "cascade" }),
    expiresAt: integer("expires_at").notNull(),
});

export const usersTable = sqliteTable("users", {
    id: text("id").notNull().primaryKey(),
    auth_id: text("auth_id").notNull(),
    slug: text("slug").notNull().unique(),
    wins: integer("wins").notNull().default(0),
    username: text("username").notNull().default(""),
    usernameSet: integer("username_set", { mode: "boolean" }).notNull().default(false),
    userCreated: integer("user_created", { mode: "timestamp" })
        .notNull()
        .default(sql`(unixepoch())`),
    lastUsernameChangeTime: integer("last_username_change_time", { mode: "timestamp" }),
    linkedGoogle: integer("linked_google", { mode: "boolean" }).notNull().default(false),
    linkedTwitch: integer("linked_twitch", { mode: "boolean" }).notNull().default(false),
    linkedDiscord: integer("linked_discord", { mode: "boolean" })
        .notNull()
        .default(false),
    linkedGithub: integer("linked_github", { mode: "boolean" }).notNull().default(false),
    linked: integer("linked", { mode: "boolean" }).notNull().default(false),
    loadout: text("loadout", { mode: "json" })
        .notNull()
        .default(validateLoadout({} as Loadout))
        .$type<Loadout>(),
});

export type UsersTable = typeof usersTable.$inferInsert;

export const itemsTable = sqliteTable("items", {
    id: integer("id").notNull().primaryKey({ autoIncrement: true }),
    userId: text("user_id")
        .notNull()
        .references(() => usersTable.id, { onDelete: "cascade" }),
    source: text("source").notNull(),
    timeAcquired: integer("time_acquired", { mode: "timestamp" })
        .notNull()
        .default(sql`(unixepoch())`),
    type: text("type").notNull(),
    status: integer("status").notNull().$type<ItemStatus>().default(ItemStatus.New),
});
