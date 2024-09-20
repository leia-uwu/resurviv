import { OAuth2RequestError } from "arctic";
import { eq } from "drizzle-orm";
import type { Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { generateId } from "lucia";
import slugify from "slugify";
import { server } from "../../..";
import { UnlockDefs } from "../../../../../../shared/defs/gameObjects/unlockDefs";
import { checkForBadWords } from "../../../../utils/serverHelpers";
import { lucia } from "../../../auth/lucia";
import { db } from "../../../db";
import { type UsersTable, itemsTable, usersTable } from "../../../db/schema";

export function sanitizeSlug(username: string) {
    username = username.toLowerCase().trim();

    if (username === "" || checkForBadWords(username)) {
        username = `Player${generateId(6)}`;
    }

    return slugify(username, {
        trim: true,
        strict: true,
    });
}

export async function setUserCookie(userId: string, c: Context) {
    const session = await lucia.createSession(userId, {});
    c.header("Set-Cookie", lucia.createSessionCookie(session.id).serialize(), {
        append: true,
    });
    return session;
}

export async function createNewUser(payload: UsersTable) {
    await db.insert(usersTable).values(payload);

    // unlock outfits on account creation;
    const unlockType = "unlock_new_account";
    const outfitsToUnlock = UnlockDefs[unlockType].unlocks;
    if (outfitsToUnlock.length) {
        const data = outfitsToUnlock.map((outfit) => {
            return {
                source: unlockType,
                type: outfit,
                userId: payload.id,
            };
        });
        await db.insert(itemsTable).values(data);
    }
}

export type OAuthProvider = {
    name: string;
    validateAuthorizationCode: (code: string) => Promise<{ accessToken: string }>;
    getUserInfo: (accessToken: string) => Promise<{ id: string; username: string }>;
    stateCookieName: string;
};

export async function handleOAuthCallback(c: Context, provider: OAuthProvider) {
    const code = c.req.query("code")?.toString() ?? null;
    const state = c.req.query("state")?.toString() ?? null;
    const storedState = getCookie(c)[provider.stateCookieName] ?? null;

    if (!code || !state || !storedState || state !== storedState) {
        return c.body(null, 400);
    }

    try {
        const tokens = await provider.validateAuthorizationCode(code);
        const user = await provider.getUserInfo(tokens.accessToken);

        const existingUser = await db.query.usersTable.findFirst({
            where: eq(usersTable.auth_id, user.id),
        });

        setCookie(c, "app-data", "1");

        if (existingUser) {
            await setUserCookie(existingUser.id, c);
            return c.redirect("/");
        }

        const slug = sanitizeSlug(user.username);

        const userId = generateId(15);
        await createNewUser({
            id: userId,
            auth_id: user.id,
            linked: true,
            [`linked${provider.name}`]: true,
            username: slug,
            slug,
        });

        await setUserCookie(userId, c);
        return c.redirect("/");
    } catch (e) {
        server.logger.warn(
            `/api/user/auth/${provider.name.toLowerCase()}/callback: Failed to create user`,
        );
        if (e instanceof OAuth2RequestError && e.message === "bad_verification_code") {
            return c.body(null, 400);
        }
        return c.body(null, 500);
    }
}
