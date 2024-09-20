import { Hono } from "hono";
import { createBunWebSocket } from "hono/bun";
import { cors } from "hono/cors";
import type { Session, User } from "lucia";
import { version } from "../../../package.json";
import { ApiServer } from "../api/apiServer";
import { Config } from "../config";
import type { FindGameBody } from "../gameServer";
import { GIT_VERSION } from "../utils/gitRevision";
import type { RegionData } from "./apiServer";
import { AuthRouter } from "./routes/user/AuthRouter";
import { UserRouter } from "./routes/user/UserRouter";

export type Context = {
    Variables: {
        user: User | null;
        session: Session | null;
    };
};

export const server = new ApiServer();
const app = new Hono();
const { upgradeWebSocket, websocket } = createBunWebSocket();

// all api routes for now, this should be okey?
app.use(
    "/api/*",
    cors({
        origin: "*",
        allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allowHeaders: ["Origin", "Content-Type", "Accept", "X-Requested-With"],
        maxAge: 3600,
    }),
);

app.route("/api/user/", UserRouter);
app.route("/api/user/auth/", AuthRouter);

server.init(app, upgradeWebSocket);

app.post("/api/find_game", async (c) => {
    try {
        const body: FindGameBody = await c.req.json();
        const data = await server.findGame(body);
        return c.json(data, 200);
    } catch (_e) {
        server.logger.warn("/api/find_game: Error retrieving body");
        return c.json(
            {
                res: [
                    {
                        err: "Error retriving body",
                    },
                ],
            },
            400,
        );
    }
});

app.post("/api/update_region", async (c) => {
    try {
        const body: {
            apiKey: string;
            regionId: string;
            data: RegionData;
        } = await c.req.json();

        if (body.apiKey !== Config.apiKey || !(body.regionId in server.regions)) {
            return c.json({}, 403);
        }

        server.updateRegion(body.regionId, body.data);
        return c.json({}, 200);
    } catch (_e) {
        return c.json({}, 500);
    }
});

Bun.serve({
    fetch: app.fetch,
    websocket,
    port: Config.apiServer.port,
});

server.logger.log(`Survev API Server v${version} - GIT ${GIT_VERSION}`);
server.logger.log(`Listening on ${Config.apiServer.host}:${Config.apiServer.port}`);
server.logger.log("Press Ctrl+C to exit.");
