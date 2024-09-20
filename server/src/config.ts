import fs from "fs";
import path from "path";
import type { MapDefs } from "../../shared/defs/mapDefs";
import { GameConfig, TeamMode } from "../../shared/gameConfig";
import { util } from "../../shared/utils/util";
import type { Vec2 } from "../../shared/utils/v2";

/**
 * Default server config
 */

export const Config = {
    devServer: {
        host: "127.0.0.1",
        port: 8001,
    },

    apiServer: {
        host: "0.0.0.0",
        port: 8000,
    },

    gameServer: {
        host: "0.0.0.0",
        port: 8001,
        apiServerUrl: "http://127.0.0.1:8000",
    },

    accountsEnabled: true,

    apiKey: "Kongregate Sucks",

    modes: [
        { mapName: "main", teamMode: TeamMode.Solo, enabled: true },
        { mapName: "main", teamMode: TeamMode.Duo, enabled: true },
        { mapName: "main", teamMode: TeamMode.Squad, enabled: true },
    ],

    regions: {},

    debug: {
        spawnMode: "default",
    },

    thisRegion: "local",

    gameTps: 100,
    netSyncTps: 33,

    perfLogging: {
        enabled: true,
        time: 10,
    },

    gameConfig: {},
} satisfies ConfigType as ConfigType;

const runningOnVite = process.argv.toString().includes("vite");
const isProduction = process.env["NODE_ENV"] === "production" && !runningOnVite;

if (!isProduction) {
    util.mergeDeep(Config, {
        regions: {
            local: {
                https: false,
                address: `${Config.devServer.host}:${Config.devServer.port}`,
                l10n: "index-local",
            },
        },
    });
}

const configPath = path.join(__dirname, isProduction ? "../../" : "", "../../");

function loadConfig(fileName: string, create?: boolean) {
    const path = `${configPath}${fileName}`;

    let loaded = false;
    if (fs.existsSync(path)) {
        const localConfig = JSON.parse(fs.readFileSync(path).toString());
        util.mergeDeep(Config, localConfig);
        loaded = true;
    } else if (create) {
        console.log("Config file doesn't exist... creating");
        fs.writeFileSync(path, JSON.stringify({}, null, 2));
    }

    util.mergeDeep(GameConfig, Config.gameConfig);
    return loaded;
}

// try loading old config file first for backwards compatibility
if (!loadConfig("resurviv-config.json")) {
    loadConfig("survev-config.json", true);
}

type DeepPartial<T> = T extends object
    ? {
          [P in keyof T]?: DeepPartial<T[P]>;
      }
    : T;

interface ServerConfig {
    host: string;
    port: number;

    /**
     * HTTPS/SSL options. Not used if running locally or with nginx.
     */
    ssl?: {
        keyFile: string;
        certFile: string;
    };
}
export interface ConfigType {
    devServer: ServerConfig;

    apiServer: ServerConfig;
    gameServer: ServerConfig & {
        apiServerUrl: string;
    };

    /**
     * used to hide/disable account-related features in both client and server.
     */
    readonly accountsEnabled: boolean;

    /**
     * API key used for game server and API server to communicate
     */
    apiKey: string;

    regions: Record<
        string,
        {
            https: boolean;
            address: string;
            l10n: string;
        }
    >;

    thisRegion: string;

    modes: Array<{
        mapName: keyof typeof MapDefs;
        teamMode: TeamMode;
        enabled: boolean;
    }>;

    /**
     * Server tick rate
     */
    gameTps: number;
    netSyncTps: number;

    /**
     * Server logging
     */
    perfLogging: {
        enabled: boolean;
        /**
         * Seconds between each game performance log
         */
        time: number;
    };

    debug: {
        spawnMode: "default" | "fixed";
        // spawn pos for fixed, defaults to map center if not set
        spawnPos?: Vec2;
    };

    /**
     * Game config overrides
     * @NOTE don't modify values used by client since this only applies to server
     */
    gameConfig: DeepPartial<typeof GameConfig>;
}
