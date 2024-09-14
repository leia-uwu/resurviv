import type { MapDefs } from "../../../shared/defs/mapDefs";
import { TeamMode } from "../../../shared/gameConfig";
import * as net from "../../../shared/net/net";
import { Config } from "../config";
import type { GameSocketData } from "../gameServer";
import { Logger } from "../utils/logger";
import { ContextManager } from "./contextManager";
import { Grid } from "./grid";
import { Group } from "./group";
import { GameMap } from "./map";
import { AirdropBarn } from "./objects/airdrop";
import { BulletBarn } from "./objects/bullet";
import { DeadBodyBarn } from "./objects/deadBody";
import { DecalBarn } from "./objects/decal";
import { ExplosionBarn } from "./objects/explosion";
import { type GameObject, ObjectRegister } from "./objects/gameObject";
import { Gas } from "./objects/gas";
import { LootBarn } from "./objects/loot";
import { PlaneBarn } from "./objects/plane";
import { Emote, PlayerBarn } from "./objects/player";
import { ProjectileBarn } from "./objects/projectile";
import { SmokeBarn } from "./objects/smoke";
import { PluginManager } from "./pluginManager";
import { Team } from "./team";

export interface ServerGameConfig {
    readonly mapName: keyof typeof MapDefs;
    readonly teamMode: TeamMode;
}

export type GroupData = {
    hash: string;
    autoFill: boolean;
};

export class Game {
    started = false;
    stopped = false;
    allowJoin = true;
    over = false;
    startedTime = 0;
    id: string;
    teamMode: TeamMode;
    gameModeIdx: number;
    isTeamMode: boolean;
    config: ServerGameConfig;
    pluginManager = new PluginManager(this);
    contextManager: ContextManager;

    grid: Grid<GameObject>;
    objectRegister: ObjectRegister;

    teams: Team[] = [];
    groups = new Map<string, Group>();
    groupDatas: GroupData[] = [];

    get aliveCount(): number {
        return this.playerBarn.livingPlayers.length;
    }

    get trueAliveCount(): number {
        return this.playerBarn.livingPlayers.filter((p) => !p.disconnected).length;
    }

    get trueGroupsAliveCount(): number {
        return [...this.groups.values()].filter((group) => !group.allDeadOrDisconnected)
            .length;
    }

    getAliveGroups(): Group[] {
        return [...this.groups.values()].filter(
            (group) => group.livingPlayers.length > 0,
        );
    }

    getAliveTeams(): Team[] {
        return this.teams.filter((team) => team.livingPlayers.length > 0);
    }

    /**
     * All msgs created this tick that will be sent to all players
     * cached in a single stream
     */
    msgsToSend = new net.MsgStream(new ArrayBuffer(4096));

    playerBarn = new PlayerBarn(this);
    lootBarn = new LootBarn(this);
    deadBodyBarn = new DeadBodyBarn(this);
    decalBarn = new DecalBarn(this);
    projectileBarn = new ProjectileBarn(this);
    bulletBarn = new BulletBarn(this);
    smokeBarn = new SmokeBarn(this);
    airdropBarn = new AirdropBarn(this);

    explosionBarn = new ExplosionBarn(this);
    planeBarn = new PlaneBarn(this);

    map: GameMap;
    gas: Gas;

    now!: number;

    perfTicker = 0;
    tickTimes: number[] = [];

    logger: Logger;

    start = Date.now();
    constructor(id: string, config: ServerGameConfig) {
        this.id = id;
        this.logger = new Logger(`Game #${this.id.substring(0, 4)}`);
        this.logger.log("Creating");

        this.config = config;

        this.teamMode = config.teamMode;
        this.gameModeIdx = Math.floor(this.teamMode / 2);
        this.isTeamMode = this.teamMode !== TeamMode.Solo;

        this.map = new GameMap(this);
        this.grid = new Grid(this.map.width, this.map.height);
        this.objectRegister = new ObjectRegister(this.grid);

        this.gas = new Gas(this);

        this.contextManager = new ContextManager(this);

        if (this.map.factionMode) {
            for (let i = 1; i <= this.map.mapDef.gameMode.factions!; i++) {
                this.addTeam(i);
            }
        }
    }

    async init() {
        await this.pluginManager.loadPlugins();
        this.pluginManager.emit("gameCreated", this);
        this.map.init();

        this.allowJoin = true;
        this.logger.log(`Created in ${Date.now() - this.start} ms`);
    }

    update(): void {
        const now = Date.now();
        if (!this.now) this.now = now;
        const dt = (now - this.now) / 1000;
        this.now = now;

        if (this.started) this.startedTime += dt;

        //
        // Update modules
        //
        this.gas.update(dt);
        this.playerBarn.update(dt);
        this.map.update();
        this.lootBarn.update(dt);
        this.bulletBarn.update(dt);
        this.projectileBarn.update(dt);
        this.explosionBarn.update();
        this.smokeBarn.update(dt);
        this.airdropBarn.update(dt);
        this.deadBodyBarn.update(dt);
        this.decalBarn.update(dt);
        this.planeBarn.update(dt);

        if (Config.perfLogging.enabled) {
            // Record performance and start the next tick
            // THIS TICK COUNTER IS WORKING CORRECTLY!
            // It measures the time it takes to calculate a tick, not the time between ticks.
            const tickTime = Date.now() - this.now;
            this.tickTimes.push(tickTime);

            this.perfTicker += dt;
            if (this.perfTicker >= Config.perfLogging.time) {
                this.perfTicker = 0;
                const mspt =
                    this.tickTimes.reduce((a, b) => a + b) / this.tickTimes.length;

                this.logger.log(
                    `Avg ms/tick: ${mspt.toFixed(2)} | Load: ${((mspt / (1000 / Config.gameTps)) * 100).toFixed(1)}%`,
                );
                this.tickTimes = [];
            }
        }
    }

    netSync() {
        // serialize objects and send msgs
        this.objectRegister.serializeObjs();
        this.playerBarn.sendMsgs();

        //
        // reset stuff
        //
        this.playerBarn.flush();
        this.bulletBarn.flush();
        this.airdropBarn.flush();
        this.objectRegister.flush();
        this.explosionBarn.flush();
        this.gas.flush();
        this.msgsToSend.stream.index = 0;
    }

    canJoin(): boolean {
        return (
            this.aliveCount < this.map.mapDef.gameMode.maxPlayers &&
            !this.over &&
            this.gas.stage < 2
        );
    }

    nextTeam(currentTeam: Group) {
        const aliveTeams = Array.from(this.groups.values()).filter(
            (t) => !t.allDeadOrDisconnected,
        );
        const currentTeamIndex = aliveTeams.indexOf(currentTeam);
        const newIndex = (currentTeamIndex + 1) % aliveTeams.length;
        return aliveTeams[newIndex];
    }

    prevTeam(currentTeam: Group) {
        const aliveTeams = Array.from(this.groups.values()).filter(
            (t) => !t.allDeadOrDisconnected,
        );
        const currentTeamIndex = aliveTeams.indexOf(currentTeam);
        return aliveTeams.at(currentTeamIndex - 1) ?? currentTeam;
    }

    handleMsg(buff: ArrayBuffer | Buffer, socketData: GameSocketData): void {
        const msgStream = new net.MsgStream(buff);
        const type = msgStream.deserializeMsgType();
        const stream = msgStream.stream;

        const player = socketData.player;

        if (type === net.MsgType.Join && !player) {
            const joinMsg = new net.JoinMsg();
            joinMsg.deserialize(stream);
            this.playerBarn.addPlayer(socketData, joinMsg);
            return;
        }

        if (!player) {
            socketData.closeSocket();
            return;
        }

        switch (type) {
            case net.MsgType.Input: {
                const inputMsg = new net.InputMsg();
                inputMsg.deserialize(stream);
                player.handleInput(inputMsg);
                break;
            }
            case net.MsgType.Emote: {
                const emoteMsg = new net.EmoteMsg();
                emoteMsg.deserialize(stream);

                if (player.dead) break;

                this.playerBarn.emotes.push(
                    new Emote(player.__id, emoteMsg.pos, emoteMsg.type, emoteMsg.isPing),
                );
                break;
            }
            case net.MsgType.DropItem: {
                const dropMsg = new net.DropItemMsg();
                dropMsg.deserialize(stream);
                player.dropItem(dropMsg);
                break;
            }
            case net.MsgType.Spectate: {
                const spectateMsg = new net.SpectateMsg();
                spectateMsg.deserialize(stream);
                player.spectate(spectateMsg);
                break;
            }
        }
    }

    sendMsg(type: net.MsgType, msg: net.Msg) {
        this.msgsToSend.serializeMsg(type, msg);
    }

    /** if game over, return group that won */
    isTeamGameOver(): Group | undefined {
        const groupAlives = [...this.groups.values()].filter(
            (group) => !group.allDeadOrDisconnected,
        );

        if (groupAlives.length <= 1) {
            return groupAlives[0];
        }
    }

    checkGameOver(): void {
        if (this.over) return;
        const didGameEnd: boolean = this.contextManager.handleGameEnd();
        if (didGameEnd) {
            this.over = true;
            setTimeout(() => {
                this.stop();
            }, 750);
        }
    }

    getSmallestTeam() {
        if (!this.map.factionMode) return undefined;

        return this.teams.reduce((smallest, current) => {
            if (current.livingPlayers.length < smallest.livingPlayers.length) {
                return current;
            }
            return smallest;
        }, this.teams[0]);
    }

    addTeam(teamId: number) {
        const team = new Team(teamId);
        this.teams.push(team);
    }

    addGroup(hash: string, autoFill: boolean) {
        const groupId = this.playerBarn.groupIdAllocator.getNextId();
        // let teamId = groupId;
        if (this.map.factionMode) {
            // teamId = util.randomInt(1, 2);
            // teamId = util.randomInt(1, this.map.mapDef.gameMode.factions ?? 2);
        }
        const group = new Group(hash, groupId, autoFill);
        // const group = new Group(hash, groupId, teamId, autoFill);
        this.groups.set(hash, group);
        return group;
    }

    stop(): void {
        if (this.stopped) return;
        this.stopped = true;
        this.allowJoin = false;
        for (const player of this.playerBarn.players) {
            if (!player.disconnected) {
                player.socketData.closeSocket();
            }
        }
        this.logger.log("Game Ended");
    }
}
