import type { Context } from "hono";
import { deleteCookie, getCookie } from "hono/cookie";
import { lucia } from "./lucia";

export const AuthMiddleware = async (c: Context, next: () => Promise<void>) => {
    const sessionId = getCookie(c, lucia.sessionCookieName) ?? null;

    if (!sessionId) {
        c.set("user", null);
        c.set("session", null);
        return c.body(null, 401);
    }
    const { session, user } = await lucia.validateSession(sessionId);
    if (session && session.fresh) {
        // use `header()` instead of `setCookie()` to avoid TS errors
        c.header("Set-Cookie", lucia.createSessionCookie(session.id).serialize(), {
            append: true,
        });
    }
    if (!session) {
        c.header("Set-Cookie", lucia.createBlankSessionCookie().serialize(), {
            append: true,
        });
        deleteCookie(c, "app-data");
    }
    c.set("user", user);
    c.set("session", session);
    return next();
};
