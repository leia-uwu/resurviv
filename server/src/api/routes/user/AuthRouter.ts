import { Hono } from "hono";
import { GithubRouter } from "./auth/github";
import { MockRouter } from "./auth/mock";

export const AuthRouter = new Hono();

AuthRouter.route("/github", GithubRouter);
AuthRouter.route("/mock", MockRouter);
