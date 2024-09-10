import { DrizzleSQLiteAdapter } from "@lucia-auth/adapter-drizzle";
import type { Env, Context as HonoContext } from "hono";
import type { Session, User } from "lucia";
import { Lucia } from "lucia";
import { db } from "../db";
import { sessionTable, usersTable } from "../db/schema";

export interface Context extends Env {
    Variables: {
        user: User | null;
        session: Session | null;
    };
}

const adapter = new DrizzleSQLiteAdapter(db, sessionTable, usersTable);

export const lucia = new Lucia(adapter, {
    sessionCookie: {
        attributes: {
            secure: process.env.NODE_ENV === "production",
        },
    },
    getUserAttributes: (attributes) => {
        return {
            username: attributes.username,
        };
    },
});

declare module "lucia" {
    interface Register {
        Lucia: typeof lucia;
        DatabaseUserAttributes: Pick<typeof usersTable.$inferSelect, "username" | "id">;
    }
}

export async function setUserCookie(userId: string, c: HonoContext) {
    const session = await lucia.createSession(userId, {});
    c.header("Set-Cookie", lucia.createSessionCookie(session.id).serialize(), {
        append: true,
    });
    return session;
}
