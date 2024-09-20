import { GitHub, generateState } from "arctic";
import { Hono } from "hono";
import { setCookie } from "hono/cookie";
import { Config } from "../../../../config";
import { type OAuthProvider, handleOAuthCallback } from "./authUtils";

export const github = new GitHub(
    process.env.GITHUB_CLIENT_ID!,
    process.env.GITHUB_CLIENT_SECRET!,
);

const stateCookieName = "github_oauth_state";

const githubProvider: OAuthProvider = {
    name: "Github",
    validateAuthorizationCode: github.validateAuthorizationCode.bind(github),
    getUserInfo: async (accessToken) => {
        const response = await fetch("https://api.github.com/user", {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        const user = await response.json();
        return { id: user.id, username: user.login };
    },
    stateCookieName,
};

export const GithubRouter = new Hono();

GithubRouter.get("/", async (c) => {
    if (!Config.accountsEnabled) {
        return c.json({ err: "Account-related features are disabled" }, 403);
    }
    if (!process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET) {
        return c.json({ err: "Missing GitHub credentials" }, 500);
    }
    const state = generateState();
    const url = await github.createAuthorizationURL(state);
    setCookie(c, stateCookieName, state, {
        path: "/",
        secure: process.env.NODE_ENV === "production",
        httpOnly: true,
        maxAge: 60 * 10,
        sameSite: "Lax",
    });
    return c.redirect(url.toString());
});

GithubRouter.get("/callback", (c) => handleOAuthCallback(c, githubProvider));
