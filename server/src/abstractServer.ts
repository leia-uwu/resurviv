import { type URLSearchParams } from "url";
import { Config } from "./config";
import { Game } from "./game";
import { type Player } from "./objects/player";
import { Logger } from "./utils/logger";
import { version } from "../../package.json";

export interface PlayerContainer {
    readonly gameID: number
    player?: Player
}

export abstract class AbstractServer {
    readonly logger = new Logger("Server");

    readonly games: Array<Game | undefined> = [];

    init(): void {
        this.logger.log(`Resurviv Server v${version}`);
        this.logger.log(`Listening on ${Config.host}:${Config.port}`);
        this.logger.log("Press Ctrl+C to exit.");

        this.newGame(0);

        setInterval(() => {
            const memoryUsage = process.memoryUsage().rss;

            const perfString = `Server | Memory usage: ${Math.round(memoryUsage / 1024 / 1024 * 100) / 100} MB`;

            this.logger.log(perfString);
        }, 60000);
    }

    tick(): void {
        for (const game of this.games) {
            if (game) game.tick();
        }
    }

    newGame(id?: number): number {
        if (id !== undefined) {
            if (!this.games[id] || this.games[id]?.stopped) {
                this.games[id] = new Game(id, Config);
                return id;
            }
        } else {
            for (let i = 0; i < Config.maxGames; i++) {
                if (!this.games[i] || this.games[i]?.stopped) return this.newGame(i);
            }
        }
        return -1;
    }

    endGame(id: number, createNewGame: boolean): void {
        const game = this.games[id];
        if (game === undefined) return;
        game.end();
        if (createNewGame) {
            this.games[id] = new Game(id, Config);
        } else {
            this.games[id] = undefined;
        }
    }

    canJoin(game?: Game): boolean {
        return game !== undefined && game.aliveCount < game.map.mapDef.gameMode.maxPlayers && !game.over;
    }

    getSiteInfo() {
        const playerCount = this.games.reduce((a, b) => {
            return a + (b ? b.connectedPlayers.size : 0);
        }, 0);

        const data = {
            modes: [
                { mapName: Config.map, teamMode: 1 }
            ],
            pops: {
                local: `${playerCount} players`
            },
            youtube: { name: "", link: "" },
            twitch: [],
            country: "US"
        };
        return data;
    }

    getUserProfile() {
        return { err: "" };
    }

    getMatchHistory() {
        return Array.from({ length: 10 }, (_, i) => ({
            guid: "85d16fd3-be8f-913b-09ce-4ba5c86482aa",
            region: "na",
            map_id: 2,
            team_mode: 2,
            team_count: 1,
            team_total: 13,
            end_time: "2021-11-06T05:01:34.000Z",
            time_alive: 303,
            rank: 1,
            kills: 11,
            team_kills: 11,
            damage_dealt: 1264,
            damage_taken: 227
        }));
    }

    getUserStats() {
        return {
            slug: "olimpiq",
            username: "olimpiq",
            player_icon: "",
            banned: false,
            wins: 4994,
            kills: 92650,
            games: 9998,
            kpg: "9.3",
            modes: [
                {
                    teamMode: 1,
                    games: 1190,
                    wins: 731,
                    kills: 10858,
                    winPct: "61.4",
                    mostKills: 25,
                    mostDamage: 2120,
                    kpg: "9.1",
                    avgDamage: 851,
                    avgTimeAlive: 258
                },
                {
                    teamMode: 2,
                    games: 2645,
                    wins: 1309,
                    kills: 21739,
                    winPct: "49.5",
                    mostKills: 24,
                    mostDamage: 2893,
                    kpg: "8.2",
                    avgDamage: 976,
                    avgTimeAlive: 233
                },
                {
                    teamMode: 4,
                    games: 6163,
                    wins: 2954,
                    kills: 60053,
                    winPct: "47.9",
                    mostKills: 30,
                    mostDamage: 4575,
                    kpg: "9.7",
                    avgDamage: 1373,
                    avgTimeAlive: 246
                }
            ]
        };
    }

    getLeaderboard() {
        return Array.from({ length: 100 }, (_, i) => ({
            slug: "olimpiq",
            username: "Olimpiq",
            region: "eu",
            games: 123,
            val: 25
        }));
    }

    findGame(regionId: string) {
        let response: {
            zone: string
            gameId: number
            useHttps: boolean
            hosts: string[]
            addrs: string[]
            data: string
        } | { err: string } = {
            zone: "",
            data: "",
            gameId: 0,
            useHttps: true,
            hosts: [],
            addrs: []
        };

        const region = (Config.regions[regionId] ?? Config.regions[Config.defaultRegion]);
        if (region !== undefined) {
            response.hosts.push(region.address);
            response.addrs.push(region.address);
            response.useHttps = region.https;

            let foundGame = false;
            for (let gameID = 0; gameID < Config.maxGames; gameID++) {
                const game = this.games[gameID];
                if (this.canJoin(game) && game?.allowJoin) {
                    response.gameId = game.id;
                    foundGame = true;
                    break;
                }
            }
            if (!foundGame) {
                // Create a game if there's a free slot
                const gameID = this.newGame();
                if (gameID !== -1) {
                    response.gameId = gameID;
                } else {
                    // Join the game that most recently started
                    const game = this.games
                        .filter(g => g && !g.over)
                        .reduce((a, b) => (a!).startedTime > (b!).startedTime ? a : b);

                    if (game) response.gameId = game.id;
                    else response = { err: "failed finding game" };
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

    getGameId(params: URLSearchParams): false | number {
        //
        // Validate game ID
        //
        let gameID = Number(params.get("gameID"));
        if (gameID < 0 || gameID > Config.maxGames - 1) gameID = 0;
        if (!this.canJoin(this.games[gameID])) {
            return false;
        }
        return gameID;
    }

    onOpen(data: PlayerContainer, send: (msg: ArrayBuffer | Uint8Array) => void, closeSocket: () => void): void {
        const game = this.games[data.gameID];
        if (game === undefined) return;
        data.player = game.addPlayer(send, closeSocket);
    }

    onMessage(data: PlayerContainer, message: ArrayBuffer | Buffer) {
        try {
            const player = data.player;
            if (player === undefined) return;
            player.game.handleMsg(message, player);
        } catch (e) {
            console.warn("Error parsing message:", e);
        }
    }

    onClose(data: PlayerContainer): void {
        const game = this.games[data.gameID];
        const player = data.player;
        if (game === undefined || player === undefined) return;
        game.logger.log(`"${player.name}" left`);
        game.removePlayer(player);
    }
}
