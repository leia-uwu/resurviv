import { randomBytes } from "crypto";
import { platform } from "os";
import NanoTimer from "nanotimer";
import { App, SSLApp, type TemplatedApp, type WebSocket } from "uWebSockets.js";
import { version } from "../../package.json";
import { GameConfig } from "../../shared/gameConfig";
import { Config } from "./config";
import { Game, type ServerGameConfig } from "./game/game";
import type { Group } from "./game/group";
import type { Player } from "./game/objects/player";
import { Logger } from "./utils/logger";
import { forbidden, readPostedJSON, returnJson } from "./utils/serverHelpers";

export interface FindGameBody {
    region: string;
    zones: string[];
    version: number;
    playerCount: number;
    autoFill: boolean;
    gameModeIdx: number;
}

export type FindGameResponse = {
    res: Array<
        | {
              zone: string;
              gameId: string;
              useHttps: boolean;
              hosts: string[];
              addrs: string[];
              data: string;
          }
        | { err: string }
    >;
};

export interface GameSocketData {
    readonly gameID: string;
    sendMsg: (msg: ArrayBuffer | Uint8Array) => void;
    closeSocket: () => void;
    player?: Player;
}

export class GameServer {
    readonly logger = new Logger("GameServer");
    readonly gamesById = new Map<string, Game>();
    readonly games: Game[] = [];

    readonly region = Config.regions[Config.thisRegion];
    readonly regionId = Config.thisRegion;

    init(app: TemplatedApp): void {
        setInterval(() => {
            const memoryUsage = process.memoryUsage().rss;

            const perfString = `Memory usage: ${Math.round((memoryUsage / 1024 / 1024) * 100) / 100} MB`;

            this.logger.log(perfString);
        }, 60000);

        // setInterval on windows sucks
        // and doesn't give accurate timings
        if (platform() === "win32") {
            new NanoTimer().setInterval(
                () => {
                    this.update();
                },
                "",
                `${1000 / Config.gameTps}m`
            );

            new NanoTimer().setInterval(
                () => {
                    this.netSync();
                },
                "",
                `${1000 / Config.netSyncTps}m`
            );
        } else {
            setInterval(() => {
                this.update();
            }, 1000 / Config.gameTps);

            setInterval(() => {
                this.netSync();
            }, 1000 / Config.netSyncTps);
        }

        this.newGame(Config.modes[0]);

        const server = this;

        app.ws("/play", {
            idleTimeout: 30,
            /**
             * Upgrade the connection to WebSocket.
             */
            upgrade(res, req, context) {
                res.onAborted((): void => {});

                const searchParams = new URLSearchParams(req.getQuery());
                const gameID = server.validateGameId(searchParams);
                if (gameID !== false) {
                    res.upgrade(
                        {
                            gameID
                        },
                        req.getHeader("sec-websocket-key"),
                        req.getHeader("sec-websocket-protocol"),
                        req.getHeader("sec-websocket-extensions"),
                        context
                    );
                } else {
                    forbidden(res);
                }
            },

            /**
             * Handle opening of the socket.
             * @param socket The socket being opened.
             */
            open(socket: WebSocket<GameSocketData>) {
                socket.getUserData().sendMsg = (data) => {
                    socket.send(data, true, false);
                };
                socket.getUserData().closeSocket = () => {
                    socket.close();
                };
                server.onOpen(socket.getUserData());
            },

            /**
             * Handle messages coming from the socket.
             * @param socket The socket in question.
             * @param message The message to handle.
             */
            message(socket: WebSocket<GameSocketData>, message) {
                server.onMessage(socket.getUserData(), message);
            },

            /**
             * Handle closing of the socket.
             * @param socket The socket being closed.
             */
            close(socket: WebSocket<GameSocketData>) {
                server.onClose(socket.getUserData());
            }
        });
    }

    update(): void {
        for (let i = 0; i < this.games.length; i++) {
            const game = this.games[i];
            if (game.stopped) {
                this.games.splice(i, 1);
                this.gamesById.delete(game.id);
                continue;
            }
            game.update();
        }
    }

    netSync(): void {
        for (let i = 0; i < this.games.length; i++) {
            this.games[i].netSync();
        }
    }

    async newGame(config: ServerGameConfig): Promise<Game> {
        const id = randomBytes(20).toString("hex");
        const game = new Game(id, config);
        await game.init();
        this.games.push(game);
        this.gamesById.set(id, game);
        return game;
    }

    async findGame(body: FindGameBody) {
        let response: FindGameResponse["res"][0] = {
            zone: "",
            data: "",
            gameId: "",
            useHttps: true,
            hosts: [],
            addrs: []
        };

        if (body.region === this.regionId) {
            response.hosts.push(this.region.address);
            response.addrs.push(this.region.address);
            response.useHttps = this.region.https;

            let game = this.games
                .filter((game) => {
                    return game.canJoin() && game.gameModeIdx === body.gameModeIdx;
                })
                .sort((a, b) => {
                    return a.startedTime - b.startedTime;
                })[0];

            if (!game) {
                const mode = Config.modes[body.gameModeIdx];

                if (!mode || !mode.enabled) {
                    response = {
                        err: "Invalid game mode idx"
                    };
                } else {
                    game = await this.newGame({
                        teamMode: mode.teamMode,
                        mapName: mode.mapName
                    });
                }
            }

            if (game && !("err" in response)) {
                response.gameId = game.id;

                const mode = Config.modes[body.gameModeIdx];
                if (mode.teamMode > 1) {
                    let group: Group | undefined;
                    let hash: string;
                    let autoFill: boolean;

                    const team = game.getSmallestTeam();

                    if (body.autoFill) {
                        group = [...game.groups.values()].filter((group) => {
                            const sameTeamId =
                                team && team.teamId == group.players[0].teamId;
                            return (
                                (team ? sameTeamId : true) &&
                                group.autoFill &&
                                group.players.length < mode.teamMode
                            );
                        })[0];
                    }

                    if (group) {
                        hash = group.hash;
                        autoFill = group.autoFill;
                    } else {
                        hash = randomBytes(20).toString("hex");
                        autoFill = body.autoFill;
                    }

                    response.data = hash;
                    game.groupDatas.push({
                        hash,
                        autoFill
                    });
                }
            }
        } else {
            this.logger.warn("/api/find_game: Invalid region");
            response = {
                err: "Invalid Region"
            };
        }
        return { res: [response] };
    }

    validateGameId(params: URLSearchParams): false | string {
        //
        // Validate game ID
        //
        const gameId = params.get("gameId");
        if (!gameId) {
            return false;
        }
        if (!this.gamesById.get(gameId)?.canJoin()) {
            return false;
        }
        return gameId;
    }

    onOpen(data: GameSocketData): void {
        const game = this.gamesById.get(data.gameID);
        if (game === undefined) {
            data.closeSocket();
        }
    }

    onMessage(data: GameSocketData, message: ArrayBuffer | Buffer) {
        const game = this.gamesById.get(data.gameID);
        if (!game) {
            data.closeSocket();
            return;
        }
        try {
            game.handleMsg(message, data);
        } catch (e) {
            game.logger.warn("Error parsing message:", e);
        }
    }

    onClose(data: GameSocketData): void {
        const game = this.gamesById.get(data.gameID);
        const player = data.player;
        if (game === undefined || player === undefined) return;
        game.logger.log(`"${player.name}" left`);
        player.disconnected = true;
        if (player.group) player.group.checkPlayers();
        if (player.timeAlive < GameConfig.player.minActiveTime) {
            player.game.playerBarn.removePlayer(player);
        }
    }

    getPlayerCount() {
        return this.games.reduce((a, b) => {
            return a + (b ? b.playerBarn.players.length : 0);
        }, 0);
    }

    async fetchApiServer(route: string, body: object) {
        const url = `${Config.gameServer.apiServerUrl}/${route}`;
        const data = fetch(url, {
            body: JSON.stringify({
                ...body,
                apiKey: Config.apiKey
            }),
            method: "post",
            headers: {
                "Content-type": "application/json"
            }
        }).catch(console.error);
        return data;
    }

    sendData() {
        try {
            this.fetchApiServer("api/update_region", {
                playerCount: this.getPlayerCount()
            });
        } catch (error) {
            this.logger.warn("Failed to send game data to api server, error: ", error);
        }
    }
}

if (process.argv.includes("--game-server")) {
    const server = new GameServer();

    const app = Config.gameServer.ssl
        ? SSLApp({
              key_file_name: Config.gameServer.ssl.keyFile,
              cert_file_name: Config.gameServer.ssl.certFile
          })
        : App();

    server.init(app);

    app.post("/api/find_game", async (res) => {
        readPostedJSON(
            res,
            async (body: FindGameBody & { apiKey: string }) => {
                try {
                    if (body.apiKey !== Config.apiKey) {
                        forbidden(res);
                        return;
                    }
                    returnJson(res, await server.findGame(body));
                } catch (err) {
                    console.error("Find game error:", err);
                    returnJson(res, {
                        res: [
                            {
                                err: "Failed finding game"
                            }
                        ]
                    });
                }
            },
            () => {
                server.logger.warn("/api/find_game: Error retrieving body");
                returnJson(res, {
                    res: [
                        {
                            err: "Error retriving body"
                        }
                    ]
                });
            }
        );
    });

    app.listen(Config.gameServer.host, Config.gameServer.port, () => {
        server.logger.log(`Resurviv Game Server v${version}`);
        server.logger.log(
            `Listening on ${Config.gameServer.host}:${Config.gameServer.port}`
        );
        server.logger.log("Press Ctrl+C to exit.");

        server.init(app);

        setInterval(() => {
            server.sendData();
        }, 10 * 1000);
    });
}
