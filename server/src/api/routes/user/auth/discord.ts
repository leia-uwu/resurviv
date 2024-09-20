import { Discord, generateState } from "arctic";
import { Hono } from "hono";
import { setCookie } from "hono/cookie";
import { Config } from "../../../../config";
import { type OAuthProvider, handleOAuthCallback } from "./authUtils";

export const discord = new Discord(
    process.env.DISCORD_CLIENT_ID!,
    process.env.DISCORD_SECRET_ID!,
    `${process.env.BASE_URL}/api/user/auth/discord/callback`,
);

const stateCookieName = "discord_oauth_state";

const discordProvider: OAuthProvider = {
    name: "Discord",
    validateAuthorizationCode: discord.validateAuthorizationCode,
    getUserInfo: async (accessToken: string) => {
        const response = await fetch("https://discord.com/api/users/@me", {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        const user = await response.json();
        return { id: user.id, username: user.username };
    },
    stateCookieName,
};

export const DiscordRouter = new Hono();

DiscordRouter.get("/", async (c) => {
    if (!Config.accountsEnabled) {
        return c.json({ err: "Account-related features are disabled" }, 403);
    }
    if (!process.env.DISCORD_CLIENT_ID || !process.env.DISCORD_SECRET_ID) {
        return c.json({ err: "Missing Discord credentials" }, 500);
    }
    const state = generateState();

    const url = await discord.createAuthorizationURL(state, {
        scopes: ["identify"],
    });

    setCookie(c, stateCookieName, state, {
        path: "/",
        secure: process.env.NODE_ENV === "production",
        httpOnly: true,
        maxAge: 60 * 10,
        sameSite: "Lax",
    });
    return c.redirect(url.toString());
});

DiscordRouter.get("/callback", (c) => handleOAuthCallback(c, discordProvider));
