import type { Hono } from "hono";
import type { UpgradeWebSocket } from "hono/ws";
import { GIT_VERSION } from "../utils/gitRevision";
import { Config, type ConfigType } from "./../config";
import type { FindGameBody, FindGameResponse } from "./../gameServer";
import { TeamMenu } from "./../teamMenu";
import { Logger } from "./../utils/logger";

export class Region {
    data: ConfigType["regions"][string];
    playerCount = 0;

    constructor(readonly id: string) {
        this.data = Config.regions[this.id];
    }

    async fetch<Data extends object>(endPoint: string, body: object) {
        const url = `http${this.data.https ? "s" : ""}://${this.data.address}/${endPoint}`;

        return new Promise<Data>((resolve) => {
            fetch(url, {
                body: JSON.stringify({
                    ...body,
                    apiKey: Config.apiKey,
                }),
                method: "post",
                headers: {
                    "Content-type": "application/json",
                },
            })
                .catch(console.error)
                .then((response) => {
                    if (response?.ok) {
                        return response.json();
                    }
                    return [{ err: "Error connecting to region, is it down?" }];
                })
                .then((json) => {
                    resolve(json);
                })
                .catch((error) => {
                    console.error(error);
                    return [{ err: "Error parsing region response JSON" }];
                });
        });
    }
}

export interface RegionData {
    playerCount: number;
}

export class ApiServer {
    readonly logger = new Logger("Server");

    teamMenu = new TeamMenu(this);

    regions: Record<string, Region> = {};

    constructor() {
        for (const region in Config.regions) {
            this.regions[region] = new Region(region);
        }
    }

    init(app: Hono, upgradeWebSocket: UpgradeWebSocket) {
        this.teamMenu.init(app, upgradeWebSocket);

        app.get("/api/site_info", (c) => {
            return c.json(this.getSiteInfo(), 200);
        });
    }

    getSiteInfo() {
        const data = {
            modes: Config.modes,
            pops: {} as Record<
                string,
                {
                    playerCount: number;
                    l10n: string;
                }
            >,
            youtube: { name: "", link: "" },
            twitch: [],
            country: "US",
            gitRevision: GIT_VERSION,
        };

        for (const region in this.regions) {
            data.pops[region] = {
                playerCount: this.regions[region].playerCount,
                l10n: Config.regions[region].l10n,
            };
        }
        return data;
    }

    getUserProfile() {
        return { err: "" };
    }

    updateRegion(regionId: string, regionData: RegionData) {
        const region = this.regions[regionId];
        region.playerCount = regionData.playerCount;
    }

    async findGame(body: FindGameBody): Promise<FindGameResponse> {
        if (body.region in this.regions) {
            return await this.regions[body.region].fetch<FindGameResponse>(
                "api/find_game",
                body,
            );
        }
        this.logger.warn("/api/find_game: Invalid region");
        return {
            res: [{ err: "Invalid Region" }],
        };
    }
}
