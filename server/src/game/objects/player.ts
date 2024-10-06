import { GameObjectDefs, type LootDef } from "../../../../shared/defs/gameObjectDefs";
import type { EmoteDef } from "../../../../shared/defs/gameObjects/emoteDefs";
import {
    type BackpackDef,
    type BoostDef,
    type ChestDef,
    GEAR_TYPES,
    type HealDef,
    type HelmetDef,
    SCOPE_LEVELS,
    type ScopeDef,
} from "../../../../shared/defs/gameObjects/gearDefs";
import { type GunDef, GunDefs } from "../../../../shared/defs/gameObjects/gunDefs";
import { type MeleeDef, MeleeDefs } from "../../../../shared/defs/gameObjects/meleeDefs";
import type { OutfitDef } from "../../../../shared/defs/gameObjects/outfitDefs";
import type { RoleDef } from "../../../../shared/defs/gameObjects/roleDefs";
import {
    type ThrowableDef,
    ThrowableDefs,
} from "../../../../shared/defs/gameObjects/throwableDefs";
import { UnlockDefs } from "../../../../shared/defs/gameObjects/unlockDefs";
import {
    type Action,
    type Anim,
    GameConfig,
    type HasteType,
} from "../../../../shared/gameConfig";
import * as net from "../../../../shared/net/net";
import { ObjectType } from "../../../../shared/net/objectSerializeFns";
import { type Circle, coldet } from "../../../../shared/utils/coldet";
import { collider } from "../../../../shared/utils/collider";
import { math } from "../../../../shared/utils/math";
import { assert, util } from "../../../../shared/utils/util";
import { type Vec2, v2 } from "../../../../shared/utils/v2";
import { IDAllocator } from "../../utils/IDAllocator";
import { checkForBadWords } from "../../utils/serverHelpers";
import type { Game } from "../game";
import { Group } from "../group";
import { Team } from "../team";
import { WeaponManager, throwableList } from "../weaponManager";
import { BaseGameObject, type DamageParams, type GameObject } from "./gameObject";
import type { Loot } from "./loot";
import type { Obstacle } from "./obstacle";

export class Emote {
    playerId: number;
    pos: Vec2;
    type: string;
    isPing: boolean;
    itemType = "";

    constructor(playerId: number, pos: Vec2, type: string, isPing: boolean) {
        this.playerId = playerId;
        this.pos = pos;
        this.type = type;
        this.isPing = isPing;
    }
}

export class PlayerBarn {
    players: Player[] = [];
    livingPlayers: Player[] = [];
    newPlayers: Player[] = [];
    deletedPlayers: number[] = [];
    groupIdAllocator = new IDAllocator(8);
    aliveCountDirty = false;

    socketIdToPlayer = new Map<string, Player>();

    emotes: Emote[] = [];

    killLeaderDirty = false;
    killLeader?: Player;

    medics: Player[] = [];

    scheduledRoles: Array<{
        role: string;
        time: number;
    }> = [];

    teams: Team[] = [];
    groups: Group[] = [];
    groupsByHash = new Map<string, Group>();

    constructor(readonly game: Game) {}

    randomPlayer(player?: Player) {
        const livingPlayers = player
            ? this.livingPlayers.filter((p) => p != player)
            : this.livingPlayers;
        return livingPlayers[util.randomInt(0, livingPlayers.length - 1)];
    }

    addPlayer(socketId: string, joinMsg: net.JoinMsg) {
        if (!this.game.joinTokens.has(joinMsg.matchPriv)) {
            this.game.closeSocket(socketId);
            return;
        }

        if (joinMsg.protocol !== GameConfig.protocolVersion) {
            const disconnectMsg = new net.DisconnectMsg();
            disconnectMsg.reason = "index-invalid-protocol";
            const stream = new net.MsgStream(new ArrayBuffer(128));
            stream.serializeMsg(net.MsgType.Disconnect, disconnectMsg);
            this.game.sendSocketMsg(socketId, stream.getBuffer());
            setTimeout(() => {
                this.game.closeSocket(socketId);
            }, 1);
        }

        let team = this.getSmallestTeam();

        let group: Group | undefined;

        if (this.game.isTeamMode) {
            const joinData = this.game.joinTokens.get(joinMsg.matchPriv)!;

            group = this.groupsByHash.get(joinMsg.matchPriv);

            if (!group && joinData.autoFill) {
                group = this.groups.find((group) => {
                    const sameTeamId = team && team.teamId == group.players[0].teamId;
                    return (
                        (team ? sameTeamId : true) &&
                        group.autoFill &&
                        group.avaliableSlots >= joinData.playerCount &&
                        group.players.length < this.game.teamMode
                    );
                });

                if (group) {
                    group.avaliableSlots -= joinData.playerCount;
                }
            }

            if (!group || (group && group.players.length > this.game.teamMode)) {
                group = this.addGroup(joinMsg.matchPriv, joinData.autoFill);
            } else {
                team = group.players[0].team;
            }
        }

        const pos: Vec2 = this.game.map.getSpawnPos(group, team);

        const player = new Player(this.game, pos, socketId, joinMsg);

        this.socketIdToPlayer.set(socketId, player);

        if (team && group) {
            team.addPlayer(player);
            group.addPlayer(player);
        } else if (!team && group) {
            group.addPlayer(player);
            player.teamId = group.groupId;
        } else if (team && !group) {
            team.addPlayer(player);
            player.groupId = this.groupIdAllocator.getNextId();
        } else {
            player.groupId = this.groupIdAllocator.getNextId();
            player.teamId = player.groupId;
        }
        if (player.game.map.factionMode) {
            player.playerStatusDirty = true;
        }

        this.game.logger.log(`Player ${player.name} joined`);

        this.newPlayers.push(player);
        this.game.objectRegister.register(player);
        this.players.push(player);
        this.livingPlayers.push(player);
        if (!this.game.modeManager.isSolo) {
            this.livingPlayers.sort((a, b) => a.teamId - b.teamId);
        }
        this.aliveCountDirty = true;
        this.game.pluginManager.emit("playerJoin", player);

        if (!this.game.started) {
            this.game.started = this.game.modeManager.isGameStarted();
            if (this.game.started) {
                this.game.gas.advanceGasStage();
            }
        }

        this.game.updateData();

        return player;
    }

    update(dt: number) {
        for (let i = 0; i < this.players.length; i++) {
            this.players[i].update(dt);
        }

        // update scheduled roles
        for (let i = this.scheduledRoles.length - 1; i >= 0; i--) {
            const scheduledRole = this.scheduledRoles[i];
            scheduledRole.time -= dt;
            if (scheduledRole.time <= 0) {
                this.scheduledRoles.splice(i, 1);
                i--;

                const fullAliveContext = this.game.modeManager.getAlivePlayersContext();
                for (let i = 0; i < fullAliveContext.length; i++) {
                    const promotablePlayers = fullAliveContext[i].filter((p) => !p.role);
                    if (promotablePlayers.length == 0) continue;

                    const randomPlayer =
                        promotablePlayers[
                            util.randomInt(0, promotablePlayers.length - 1)
                        ];
                    randomPlayer.promoteToRole(scheduledRole.role);
                }
            }
        }
    }

    removePlayer(player: Player) {
        this.players.splice(this.players.indexOf(player), 1);
        const livingIdx = this.livingPlayers.indexOf(player);
        if (livingIdx !== -1) {
            this.livingPlayers.splice(livingIdx, 1);
            this.aliveCountDirty = true;
        }
        this.deletedPlayers.push(player.__id);
        player.destroy();
        if (player.group) {
            player.group.removePlayer(player);

            if (player.group.players.length <= 0) {
                this.groups.splice(this.groups.indexOf(player.group), 1);
                this.groupsByHash.delete(player.group.hash);
            }
        }
        if (this.game.isTeamMode) {
            this.livingPlayers.sort((a, b) => a.teamId - b.teamId);
        }

        this.game.checkGameOver();
        this.game.updateData();
    }

    sendMsgs() {
        for (let i = 0; i < this.players.length; i++) {
            const player = this.players[i];
            if (player.disconnected) continue;
            player.sendMsgs();
        }
    }

    flush() {
        this.newPlayers.length = 0;
        this.deletedPlayers.length = 0;
        this.emotes.length = 0;
        this.aliveCountDirty = false;
        this.killLeaderDirty = false;

        for (let i = 0; i < this.players.length; i++) {
            const player = this.players[i];
            player.healthDirty = false;
            player.boostDirty = false;
            player.zoomDirty = false;
            player.actionDirty = false;
            player.inventoryDirty = false;
            player.weapsDirty = false;
            player.spectatorCountDirty = false;
            player.activeIdDirty = false;
            player.groupStatusDirty = false;
        }
    }

    /**
     * called everytime gas.circleIdx is incremented for efficiency purposes
     * schedules all roles that need to be assigned for the respective circleIdx
     */
    scheduleRoleAssignments(): void {
        const roles = this.game.map.mapDef.gameConfig.roles;
        assert(
            roles,
            '"roles" property is undefined in chosen map definition, cannot call this function',
        );

        const rolesToSchedule = roles.timings.filter(
            (timing) => this.game.gas.circleIdx == timing.circleIdx,
        );

        for (let i = 0; i < rolesToSchedule.length; i++) {
            const roleObj = rolesToSchedule[i];
            const roleStr =
                roleObj.role instanceof Function ? roleObj.role() : roleObj.role;
            this.scheduledRoles.push({
                role: roleStr,
                time: roleObj.wait,
            });
        }
    }

    isTeamGameOver(): boolean {
        const groupAlives = [...this.groups.values()].filter(
            (group) => !group.allDeadOrDisconnected,
        );

        if (groupAlives.length <= 1) {
            true;
        }

        return false;
    }

    getAliveGroups(): Group[] {
        return [...this.groups.values()].filter(
            (group) => group.livingPlayers.length > 0,
        );
    }

    getAliveTeams(): Team[] {
        return this.teams.filter((team) => team.livingPlayers.length > 0);
    }

    getSmallestTeam() {
        if (!this.game.map.factionMode) return undefined;

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
        const groupId = this.groupIdAllocator.getNextId();
        const group = new Group(hash, groupId, autoFill, this.game.teamMode);
        this.groups.push(group);
        this.groupsByHash.set(hash, group);
        return group;
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

    getPlayerWithHighestKills(): Player | undefined {
        return this.game.playerBarn.livingPlayers
            .filter((p) => p.kills >= GameConfig.player.killLeaderMinKills)
            .sort((a, b) => b.kills - a.kills)[0];
    }
}

export class Player extends BaseGameObject {
    override readonly __type = ObjectType.Player;

    bounds = collider.createAabbExtents(
        v2.create(0, 0),
        v2.create(GameConfig.player.maxVisualRadius, GameConfig.player.maxVisualRadius),
    );

    scale = 1;

    get hasScale(): boolean {
        return this.scale !== 1;
    }

    get rad(): number {
        return GameConfig.player.radius * this.scale;
    }

    set rad(rad: number) {
        this.collider.rad = rad;
        this.rad = rad;
    }

    get playerId() {
        return this.__id;
    }

    dir = v2.create(0, 0);

    posOld = v2.create(0, 0);
    dirOld = v2.create(0, 0);

    collider: Circle;

    healthDirty = true;
    boostDirty = true;
    zoomDirty = true;
    actionDirty = false;
    inventoryDirty = true;
    weapsDirty = true;
    spectatorCountDirty = false;
    activeIdDirty = true;

    team: Team | undefined = undefined;
    group: Group | undefined = undefined;

    /**
     * set true if any member on the team changes health or disconnects
     */
    groupStatusDirty = false;

    setGroupStatuses() {
        if (!this.game.isTeamMode) return;

        const teammates = this.group!.players;
        for (const t of teammates) {
            t.groupStatusDirty = true;
        }
    }

    /**
     * for updating player and teammate locations in the minimap client UI
     */
    playerStatusDirty = false;
    playerStatusTicker = 0;

    private _health: number = GameConfig.player.health;

    get health(): number {
        return this._health;
    }

    set health(health: number) {
        if (this._health === health) return;
        this._health = health;
        this._health = math.clamp(this._health, 0, GameConfig.player.health);
        this.healthDirty = true;
        this.setGroupStatuses();
    }

    private _boost: number = 0;

    get boost(): number {
        return this._boost;
    }

    set boost(boost: number) {
        if (this._boost === boost) return;
        if (this.downed && boost > 0) return; // can't gain adren while knocked, can only set it to zero
        this._boost = boost;
        this._boost = math.clamp(this._boost, 0, 100);
        this.boostDirty = true;
    }

    speed: number = 0;
    moveVel = v2.create(0, 0);

    shotSlowdownTimer: number = 0;

    freeSwitchTimer: number = 0;

    indoors = false;
    insideZoomRegion = false;

    private _zoom: number = 0;

    get zoom(): number {
        return this._zoom;
    }

    set zoom(zoom: number) {
        if (zoom === this._zoom) return;
        assert(zoom !== 0);
        this._zoom = zoom;
        this.zoomDirty = true;
    }

    scopeZoomRadius: Record<string, number>;

    scope = "1xscope";

    inventory: Record<string, number> = {};

    get curWeapIdx() {
        return this.weaponManager.curWeapIdx;
    }

    weapons: WeaponManager["weapons"];

    get activeWeapon() {
        return this.weaponManager.activeWeapon;
    }

    _disconnected = false;

    get disconnected(): boolean {
        return this._disconnected;
    }

    set disconnected(disconnected: boolean) {
        if (this.disconnected === disconnected) return;

        this._disconnected = disconnected;
        this.setGroupStatuses();
    }

    private _spectatorCount = 0;
    set spectatorCount(spectatorCount: number) {
        if (this._spectatorCount === spectatorCount) return;
        this._spectatorCount = spectatorCount;
        this._spectatorCount = math.clamp(this._spectatorCount, 0, 255); // byte size limit
        this.spectatorCountDirty = true;
    }

    get spectatorCount(): number {
        return this._spectatorCount;
    }

    /** true when player starts spectating new player, only stays true for that given tick */
    startedSpectating: boolean = false;

    private _spectating?: Player;

    get spectating(): Player | undefined {
        return this._spectating;
    }

    set spectating(player: Player | undefined) {
        if (player === this) {
            throw new Error(
                `Player ${player.name} tried spectate themselves (how tf did this happen?)`,
            );
        }
        if (this._spectating === player) return;

        if (this._spectating) {
            this._spectating.spectatorCount--;
            this._spectating.spectators.delete(this);
        }
        if (player) {
            player.spectatorCount++;
            player.spectators.add(this);
        }

        this._spectating = player;
        this.startedSpectating = true;
    }

    spectators = new Set<Player>();

    outfit: string;
    /** "backpack00" is no backpack, "backpack03" is the max level backpack */
    backpack: string;
    /** "" is no helmet, "helmet03" is the max level helmet */
    helmet: string;
    /** "" is no chest, "chest03" is the max level chest */
    chest: string;

    getGearLevel(type: string): number {
        if (!type) {
            // not wearing any armor, level 0
            return 0;
        }
        return (GameObjectDefs[type] as BackpackDef | HelmetDef | ChestDef).level;
    }

    layer = 0;
    aimLayer = 0;
    dead = false;
    downed = false;

    downedCount = 0;
    bleedTicker = 0;
    playerBeingRevived: Player | undefined;

    animType: Anim = GameConfig.Anim.None;
    animSeq = 0;
    private _animTicker = 0;
    private _animCb?: () => void;

    distSinceLastCrawl = 0;

    actionType: Action = GameConfig.Action.None;
    actionSeq = 0;
    action = { time: 0, duration: 0, targetId: 0 };

    timeUntilHidden = -1; // for showing on enemy minimap in 50v50

    /**
     * specifically for reloading single shot guns to keep reloading until maxClip is reached
     */
    reloadAgain = false;

    wearingPan = false;
    healEffect = false;
    //if hit by snowball or potato, slowed down for "x" seconds
    frozenTicker = 0;
    frozen = false;
    frozenOri = 0;

    private _hasteTicker = 0;
    hasteType: HasteType = GameConfig.HasteType.None;
    hasteSeq = 0;

    actionItem = "";

    hasRoleHelmet = false;
    role = "";
    isKillLeader = false;

    promoteToRole(role: string) {
        if (!GameObjectDefs[role]) return;

        if (role === "kill_leader") {
            this.handleKillLeaderRole();
        } else {
            this.handleFactionModeRoles(role);
            this.hasRoleHelmet = true;
        }

        const msg = new net.RoleAnnouncementMsg();
        msg.role = role;
        msg.assigned = true;
        msg.playerId = this.__id;
        this.game.broadcastMsg(net.MsgType.RoleAnnouncement, msg);
    }

    handleKillLeaderRole(): void {
        if (this.isKillLeader) return;
        if (this.game.map.mapDef.gameMode.sniperMode) {
            this.role = "kill_leader";
            this.setDirty();
        }
        this.isKillLeader = true;
        if (this.game.playerBarn.killLeader) {
            this.game.playerBarn.killLeader.isKillLeader = false;
        }
        this.game.playerBarn.killLeader = this;
        this.game.playerBarn.killLeaderDirty = true;
    }

    lastBreathActive = false;
    private _lastBreathTicker = 0;

    bugleTickerActive = false;
    private _bugleTicker = 0;

    handleFactionModeRoles(role: string): void {
        if (this.role === role) return;

        const def = GameObjectDefs[role] as RoleDef;

        switch (role) {
            case "bugler":
                break;
            case "leader":
                break;
            case "lieutenant":
                break;
            case "last_man":
                this.health = 100;
                this.boost = 100;
                this.giveHaste(GameConfig.HasteType.Windwalk, 5);
                break;
            case "grenadier":
                break;
            case "medic":
                // TODO: this should be based on aoe_heal perk not role
                this.game.playerBarn.medics.push(this);
                break;
        }

        if (def.defaultItems) {
            //for non faction modes where teamId > 2, just cycles between blue and red teamId
            const clampedTeamId = ((this.teamId - 1) % 2) + 1;

            //inventory
            for (const [key, value] of Object.entries(def.defaultItems.inventory)) {
                if (value == 0) continue; //prevents overwriting existing inventory
                this.inventory[key] = value;
            }

            //outfit
            const newOutfit = def.defaultItems.outfit;
            if (newOutfit instanceof Function) {
                this.outfit = newOutfit(clampedTeamId);
            } else {
                //string
                if (newOutfit) this.outfit = newOutfit;
            }

            //armor
            this.scope = def.defaultItems.scope;
            if (this.helmet && !this.hasRoleHelmet)
                this.dropArmor(this.helmet, GameObjectDefs[this.helmet] as LootDef);
            this.helmet =
                def.defaultItems.helmet instanceof Function
                    ? def.defaultItems.helmet(clampedTeamId)
                    : def.defaultItems.helmet;

            if (def.defaultItems.chest) {
                if (this.chest) {
                    this.dropArmor(this.chest, GameObjectDefs[this.chest] as LootDef);
                }
                this.chest = def.defaultItems.chest;
            }
            this.backpack = def.defaultItems.backpack;

            //weapons
            for (let i = 0; i < def.defaultItems.weapons.length; i++) {
                const weaponOrWeaponFunc = def.defaultItems.weapons[i];
                const trueWeapon =
                    weaponOrWeaponFunc instanceof Function
                        ? weaponOrWeaponFunc(clampedTeamId)
                        : weaponOrWeaponFunc;

                if (!trueWeapon.type) {
                    //prevents overwriting existing weapons
                    if (!this.weapons[i].type) {
                        continue;
                    }

                    const curWeapDef = GameObjectDefs[this.weapons[i].type];
                    if (curWeapDef.type == "gun") {
                        // refills the ammo of the existing weapon
                        this.weapons[i].ammo = this.weaponManager.getTrueAmmoStats(
                            curWeapDef as GunDef,
                        ).trueMaxClip;
                    }
                    continue;
                }

                const trueWeapDef = GameObjectDefs[trueWeapon.type] as LootDef;
                if (trueWeapDef && trueWeapDef.type == "gun") {
                    if (this.weapons[i].type) this.weaponManager.dropGun(i);

                    if (trueWeapon.fillInv) {
                        const ammoType = trueWeapDef.ammo;
                        this.inventory[ammoType] =
                            GameConfig.bagSizes[ammoType][
                                this.getGearLevel(this.backpack)
                            ];
                    }
                } else if (trueWeapDef && trueWeapDef.type == "melee") {
                    if (this.weapons[i].type) this.weaponManager.dropMelee();
                }
                this.weaponManager.setWeapon(i, trueWeapon.type, trueWeapon.ammo);
            }
        }

        if (def.perks) {
            for (let i = this.perks.length - 1; i >= 0; i--)
                this.removePerk(this.perks[i].type);
            for (let i = 0; i < def.perks.length; i++) {
                const perkOrPerkFunc = def.perks[i];
                const perkType =
                    perkOrPerkFunc instanceof Function
                        ? perkOrPerkFunc()
                        : perkOrPerkFunc;
                this.addPerk(perkType, false);
            }
        }
        this.role = role;
        this.inventoryDirty = true;
        this.setDirty();
    }

    perks: Array<{ type: string; droppable: boolean }> = [];

    perkTypes: string[] = [];

    addPerk(type: string, droppable = false) {
        this.perks.push({
            type,
            droppable,
        });
        this.perkTypes.push(type);

        if (type == "leadership") {
            this.boost = 100;
            this.scale += 0.25;
        } else if (type == "steelskin") {
            this.scale += 0.4;
        } else if (type == "flak_jacket") {
            this.scale += 0.2;
        } else if (type == "small_arms") {
            this.scale -= 0.25;
        }
    }

    removePerk(type: string): void {
        const idx = this.perks.findIndex((perk) => perk.type === type);
        this.perks.splice(idx, 1);
        this.perkTypes.splice(this.perkTypes.indexOf(type), 1);

        if (type == "leadership") {
            this.scale -= 0.25;
        } else if (type == "steelskin") {
            this.scale -= 0.4;
        } else if (type == "flak_jacket") {
            this.scale -= 0.2;
        } else if (type == "small_arms") {
            this.scale += 0.25;
        }
    }

    get hasPerks(): boolean {
        return this.perks.length > 0;
    }

    hasPerk(type: string) {
        return this.perkTypes.includes(type);
    }

    hasActivePan() {
        return (
            this.wearingPan ||
            (this.activeWeapon == "pan" && this.animType !== GameConfig.Anim.Melee)
        );
    }

    getPanSegment() {
        const type = this.wearingPan ? "unequipped" : "equipped";
        return MeleeDefs.pan.reflectSurface![type];
    }

    socketId: string;

    ack = 0;

    name: string;
    isMobile: boolean;

    teamId = 1;
    groupId = 0;

    loadout = {
        heal: "heal_basic",
        boost: "boost_basic",
        emotes: [...GameConfig.defaultEmoteLoadout],
    };

    damageTaken = 0;
    damageDealt = 0;
    kills = 0;
    timeAlive = 0;

    msgsToSend: Array<{ type: number; msg: net.Msg }> = [];

    weaponManager = new WeaponManager(this);
    recoilTicker = 0;

    // to disable auto pickup for some seconds after dropping something
    mobileDropTicker = 0;

    obstacleOutfit?: Obstacle;

    constructor(game: Game, pos: Vec2, socketId: string, joinMsg: net.JoinMsg) {
        super(game, pos);

        this.socketId = socketId;

        this.name = joinMsg.name.trim();
        if (this.name === "" || checkForBadWords(this.name)) {
            this.name = "Player";
        }
        this.isMobile = joinMsg.isMobile;

        this.weapons = this.weaponManager.weapons;
        const defaultItems = GameConfig.player.defaultItems;

        function assertType(type: string, category: string, acceptNoItem: boolean) {
            if (!type && acceptNoItem) return;
            const def = GameObjectDefs[type];
            assert(def, `Invalid item type for ${category}: ${type}`);
            assert(
                def.type === category,
                `Invalid type ${type}, expected ${category} item`,
            );
        }

        for (let i = 0; i < GameConfig.WeaponSlot.Count; i++) {
            const weap = defaultItems.weapons[i];
            let type = weap.type || this.weapons[i].type;
            if (!type) continue;
            assertType(type, GameConfig.WeaponType[i], true);
            this.weaponManager.setWeapon(i, type, weap.ammo ?? 0);
        }

        for (const key in GameConfig.bagSizes) {
            this.inventory[key] = defaultItems.inventory[key] ?? 0;
        }

        this.chest = defaultItems.chest;
        assertType(this.chest, "chest", true);

        this.scope = defaultItems.scope;
        assertType(this.scope, "scope", false);
        this.inventory[this.scope] = 1;

        this.helmet = defaultItems.helmet;
        assertType(this.helmet, "helmet", true);

        this.backpack = defaultItems.backpack;
        assertType(this.backpack, "backpack", false);

        for (const perk of defaultItems.perks) {
            assertType(perk.type, "perk", false);
            this.addPerk(perk.type, perk.droppable);
        }

        /**
         * Checks if an item is present in the player's loadout
         */
        const isItemInLoadout = (item: string, category: string) => {
            if (!UnlockDefs.unlock_default.unlocks.includes(item)) return false;

            const def = GameObjectDefs[item];
            if (!def || def.type !== category) return false;

            return true;
        };

        if (
            isItemInLoadout(joinMsg.loadout.outfit, "outfit") &&
            joinMsg.loadout.outfit !== "outfitBase"
        ) {
            this.outfit = joinMsg.loadout.outfit;
        } else {
            this.outfit = defaultItems.outfit;
        }

        if (
            isItemInLoadout(joinMsg.loadout.melee, "melee") &&
            joinMsg.loadout.melee != "fists"
        ) {
            this.weapons[GameConfig.WeaponSlot.Melee].type = joinMsg.loadout.melee;
        }

        const loadout = this.loadout;

        if (isItemInLoadout(joinMsg.loadout.heal, "heal")) {
            loadout.heal = joinMsg.loadout.heal;
        }
        if (isItemInLoadout(joinMsg.loadout.boost, "boost")) {
            loadout.boost = joinMsg.loadout.boost;
        }

        const emotes = joinMsg.loadout.emotes;
        for (let i = 0; i < emotes.length; i++) {
            const emote = emotes[i];
            if (i > GameConfig.EmoteSlot.Count) break;

            if (emote === "" || !isItemInLoadout(emote, "emote")) {
                continue;
            }

            loadout.emotes[i] = emote;
        }

        // createCircle clones the position
        // so set it manually to link both
        this.collider = collider.createCircle(this.pos, this.rad);
        this.collider.pos = this.pos;

        this.scopeZoomRadius =
            GameConfig.scopeZoomRadius[this.isMobile ? "mobile" : "desktop"];

        this.zoom = this.scopeZoomRadius[this.scope];

        this.weaponManager.showNextThrowable();
    }

    override serializeFull(): void {
        if (!this.activeWeapon) {
            console.error(
                "Invalid active weapon, curIdx:",
                this.curWeapIdx,
                "lastIdx:",
                this.weaponManager.lastWeaponIdx,
                "weaps:",
                this.weapons,
            );
            this.weapons[GameConfig.WeaponSlot.Melee].type ||= "fists";
            this.weaponManager.setCurWeapIndex(
                GameConfig.WeaponSlot.Melee,
                undefined,
                undefined,
                true,
            );
        }
        super.serializeFull();
    }

    visibleObjects = new Set<GameObject>();

    update(dt: number): void {
        if (this.dead) return;
        this.timeAlive += dt;

        if (this.game.map.factionMode) {
            this.timeUntilHidden -= dt;
        }

        //
        // Boost logic
        //
        if (this.boost > 0 && !this.hasPerk("leadership")) {
            this.boost -= 0.375 * dt;
        }
        if (this.boost > 0 && this.boost <= 25) this.health += 0.5 * dt;
        else if (this.boost > 25 && this.boost <= 50) this.health += 1.25 * dt;
        else if (this.boost > 50 && this.boost <= 87.5) this.health += 1.5 * dt;
        else if (this.boost > 87.5 && this.boost <= 100) this.health += 1.75 * dt;

        //
        // Action logic
        //
        if (
            this.game.modeManager.isReviving(this) ||
            this.game.modeManager.isBeingRevived(this)
        ) {
            if (
                this.playerBeingRevived &&
                v2.distance(this.pos, this.playerBeingRevived.pos) >
                    GameConfig.player.reviveRange
            ) {
                this.cancelAction();
            }
        } else if (this.downed) {
            this.bleedTicker += dt;
            if (this.bleedTicker >= GameConfig.player.bleedTickRate) {
                const bleedDamageMult = this.game.map.mapDef.gameConfig.bleedDamageMult;
                const multiplier =
                    bleedDamageMult != 1 ? this.downedCount * bleedDamageMult : 1;
                this.damage({
                    amount: this.game.map.mapDef.gameConfig.bleedDamage * multiplier,
                    damageType: GameConfig.DamageType.Bleeding,
                    dir: this.dir,
                });
                this.bleedTicker = 0;
            }
        }

        if (this.game.gas.doDamage && this.game.gas.isInGas(this.pos)) {
            this.damage({
                amount: this.game.gas.damage,
                damageType: GameConfig.DamageType.Gas,
                dir: this.dir,
            });
        }

        if (this.reloadAgain) {
            this.reloadAgain = false;
            this.weaponManager.tryReload();
        }

        // handle heal and boost actions

        if (this.actionType !== GameConfig.Action.None) {
            this.action.time += dt;
            this.action.time = math.clamp(
                this.action.time,
                0,
                net.Constants.ActionMaxDuration,
            );

            if (this.action.time >= this.action.duration) {
                if (this.actionType === GameConfig.Action.UseItem) {
                    const itemDef = GameObjectDefs[this.actionItem] as HealDef | BoostDef;
                    if ("heal" in itemDef) {
                        this.applyActionFunc((target: Player) => {
                            target.health += itemDef.heal;
                        });
                    }
                    if ("boost" in itemDef) {
                        this.applyActionFunc((target: Player) => {
                            target.boost += itemDef.boost;
                        });
                    }
                    this.inventory[this.actionItem]--;
                    this.inventoryDirty = true;
                } else if (this.isReloading()) {
                    this.weaponManager.reload();
                } else if (
                    this.actionType === GameConfig.Action.Revive &&
                    this.playerBeingRevived
                ) {
                    this.applyActionFunc((target: Player) => {
                        if (!target.downed) return;
                        target.downed = false;
                        target.health = GameConfig.player.reviveHealth;
                        if (target.hasPerk("leadership")) target.boost = 100;
                        target.setDirty();
                        target.setGroupStatuses();
                        this.game.pluginManager.emit("playerRevived", target);
                    });
                }

                this.cancelAction();

                if (
                    (this.curWeapIdx == GameConfig.WeaponSlot.Primary ||
                        this.curWeapIdx == GameConfig.WeaponSlot.Secondary) &&
                    this.weapons[this.curWeapIdx].ammo == 0
                ) {
                    this.weaponManager.tryReload();
                }
            }
        }

        //
        // Animation logic
        //
        if (this.animType !== GameConfig.Anim.None) {
            this._animTicker -= dt;

            if (this._animTicker <= 0) {
                this.animType = GameConfig.Anim.None;
                this._animTicker = 0;
                this.animSeq++;
                this.setDirty();
                this._animCb?.();
            }
        }

        //
        // Projectile slowdown logic
        //
        if (this.frozen) {
            this.frozenTicker -= dt;

            if (this.frozenTicker <= 0) {
                this.frozenTicker = 0;
                this.frozen = false;
                this.setDirty();
            }
        }

        //
        // Haste logic
        //
        if (this.hasteType != GameConfig.HasteType.None) {
            this._hasteTicker -= dt;

            if (this._hasteTicker <= 0) {
                this.hasteType = GameConfig.HasteType.None;
                this._hasteTicker = 0;
                this.hasteSeq++;
                this.setDirty();
            }
        }

        //
        // Last breath logic
        //
        if (this.lastBreathActive) {
            this._lastBreathTicker -= dt;

            if (this._lastBreathTicker <= 0) {
                this.lastBreathActive = false;
                this._lastBreathTicker = 0;

                this.scale -= 0.2;
            }
        }

        //
        // Bugler logic
        //
        if (this.bugleTickerActive) {
            this._bugleTicker -= dt;

            if (this._bugleTicker <= 0) {
                this.bugleTickerActive = false;
                this._bugleTicker = 0;

                const bugle = this.weapons.find((w) => w.type == "bugle");
                if (bugle) {
                    bugle.ammo++;
                    if (
                        bugle.ammo <
                        this.weaponManager.getTrueAmmoStats(
                            GameObjectDefs["bugle"] as GunDef,
                        ).trueMaxClip
                    ) {
                        this.bugleTickerActive = true;
                        this._bugleTicker = 8;
                    }
                }
                this.weapsDirty = true;
            }
        }

        if (this.game.isTeamMode || this.game.map.factionMode) {
            this.playerStatusTicker += dt;
            for (const spectator of this.spectators) {
                spectator.playerStatusTicker += dt;
            }
        }

        //
        // Calculate new speed, position and check for collision with obstacles
        //
        const movement = v2.create(0, 0);

        if (this.touchMoveActive && this.touchMoveLen) {
            movement.x = this.touchMoveDir.x;
            movement.y = this.touchMoveDir.y;
        } else {
            if (this.moveUp) movement.y++;
            if (this.moveDown) movement.y--;
            if (this.moveLeft) movement.x--;
            if (this.moveRight) movement.x++;

            if (movement.x * movement.y !== 0) {
                // If the product is non-zero, then both of the components must be non-zero
                movement.x *= Math.SQRT1_2;
                movement.y *= Math.SQRT1_2;
            }
        }

        this.posOld = v2.copy(this.pos);

        this.recalculateSpeed();
        this.moveVel = v2.mul(movement, this.speed);

        let objs!: GameObject[];

        const steps = Math.round(math.max(this.speed * dt + 5, 5));

        const speedToAdd = (this.speed / steps) * dt;
        for (let i = 0; i < steps; i++) {
            objs = this.game.grid.intersectCollider(this.collider);

            v2.set(this.pos, v2.add(this.pos, v2.mul(movement, speedToAdd)));

            for (let j = 0; j < objs.length; j++) {
                const obj = objs[j];
                if (obj.__type !== ObjectType.Obstacle) continue;
                if (!obj.collidable) continue;
                if (obj.dead) continue;
                if (!util.sameLayer(obj.layer, this.layer)) continue;

                const collision = collider.intersectCircle(
                    obj.collider,
                    this.pos,
                    this.rad,
                );
                if (collision) {
                    v2.set(
                        this.pos,
                        v2.add(this.pos, v2.mul(collision.dir, collision.pen + 0.001)),
                    );
                }
            }
        }

        this.pickupTicker -= dt;

        //
        // Mobile auto interaction
        //
        this.mobileDropTicker -= dt;
        if (this.isMobile && this.mobileDropTicker <= 0) {
            const closestLoot = this.getClosestLoot();

            if (closestLoot) {
                const itemDef = GameObjectDefs[closestLoot.type];
                switch (itemDef.type) {
                    case "gun":
                        const freeSlot = this.getFreeGunSlot(closestLoot);
                        if (
                            freeSlot.slot &&
                            freeSlot.slot !== this.curWeapIdx &&
                            !this.weapons[freeSlot.slot].type
                        ) {
                            this.pickupLoot(closestLoot);
                        }
                        break;
                    case "melee": {
                        if (this.weapons[GameConfig.WeaponSlot.Melee].type === "fists") {
                            this.pickupLoot(closestLoot);
                        }
                        break;
                    }
                    case "perk": {
                        if (!this.perks.find((perk) => perk.droppable)) {
                            this.pickupLoot(closestLoot);
                        }
                        break;
                    }
                    case "outfit": {
                        break;
                    }
                    case "helmet":
                    case "chest":
                    case "backpack": {
                        const thisLevel = this.getGearLevel(this[itemDef.type]);
                        const thatLevel = this.getGearLevel(closestLoot.type);
                        if (thisLevel < thatLevel) {
                            this.pickupLoot(closestLoot);
                        }
                        break;
                    }
                    default:
                        if (
                            GameConfig.bagSizes[closestLoot.type] &&
                            this.inventory[closestLoot.type] >=
                                GameConfig.bagSizes[closestLoot.type][
                                    this.getGearLevel(this.backpack)
                                ]
                        ) {
                            break;
                        }
                        this.pickupLoot(closestLoot);
                        break;
                }
            }

            const obstacles = this.getInteractableObstacles();
            for (let i = 0; i < obstacles.length; i++) {
                const obstacle = obstacles[i];
                if (obstacle.isDoor && !obstacle.door.open) {
                    obstacle.interact(this);
                }
            }
        }

        //
        // Scope zoom, heal regions and and auto open doors logic
        //

        let finalZoom = this.scopeZoomRadius[this.scope];
        let lowestZoom = this.scopeZoomRadius["1xscope"];

        let layer = this.layer > 2 ? 0 : this.layer;
        this.indoors = false;

        let zoomRegionZoom = lowestZoom;
        let insideNoZoomRegion = true;
        let insideSmoke = false;

        for (let i = 0; i < objs.length; i++) {
            const obj = objs[i];
            if (obj.__type === ObjectType.Building) {
                if (!util.sameLayer(layer, obj.layer)) continue;

                if (obj.healRegions) {
                    const healRegion = obj.healRegions.find((hr) => {
                        return coldet.testPointAabb(
                            this.pos,
                            hr.collision.min,
                            hr.collision.max,
                        );
                    });

                    if (healRegion && !this.game.gas.isInGas(this.pos)) {
                        this.health += healRegion.healRate * dt;
                    }
                }

                if (obj.ceilingDead) continue;

                for (let i = 0; i < obj.zoomRegions.length; i++) {
                    const zoomRegion = obj.zoomRegions[i];

                    if (
                        zoomRegion.zoomIn &&
                        coldet.testCircleAabb(
                            this.collider.pos,
                            this.collider.rad,
                            zoomRegion.zoomIn.min,
                            zoomRegion.zoomIn.max,
                        )
                    ) {
                        this.indoors = true;
                        this.insideZoomRegion = true;
                        insideNoZoomRegion = false;
                        if (zoomRegion.zoom) {
                            zoomRegionZoom = zoomRegion.zoom;
                        }
                    }

                    if (
                        zoomRegion.zoomOut &&
                        coldet.testCircleAabb(
                            this.collider.pos,
                            this.collider.rad,
                            zoomRegion.zoomOut.min,
                            zoomRegion.zoomOut.max,
                        )
                    ) {
                        insideNoZoomRegion = false;
                        if (this.insideZoomRegion) {
                            if (zoomRegion.zoom) {
                                zoomRegionZoom = zoomRegion.zoom;
                            }
                        }
                    }
                }
            } else if (obj.__type === ObjectType.Obstacle) {
                if (!util.sameLayer(this.layer, obj.layer)) continue;
                if (!(obj.isDoor && obj.door.autoOpen)) continue;

                const res = collider.intersectCircle(
                    obj.collider,
                    this.pos,
                    this.rad + obj.interactionRad,
                );
                if (res) {
                    obj.interact(this, true);
                }
            } else if (obj.__type === ObjectType.Smoke) {
                if (!util.sameLayer(this.layer, obj.layer)) continue;
                if (coldet.testCircleCircle(this.pos, this.rad, obj.pos, obj.rad)) {
                    insideSmoke = true;
                }
            }
        }

        if (this.insideZoomRegion) {
            finalZoom = zoomRegionZoom;
        }
        if (insideSmoke || this.downed) {
            finalZoom = lowestZoom;
        }
        this.zoom = finalZoom;

        if (insideNoZoomRegion) {
            this.insideZoomRegion = false;
        }

        //
        // Calculate layer
        //
        const originalLayer = this.layer;
        const rot = Math.atan2(this.dir.y, this.dir.x);
        const ori = math.radToOri(rot);
        const stair = this.checkStairs(objs!, this.rad);
        if (stair) {
            if (ori === stair.downOri) {
                this.aimLayer = 3;
            } else if (ori === stair.upOri) {
                this.aimLayer = 2;
            } else {
                this.aimLayer = this.layer;
            }
        } else {
            this.aimLayer = this.layer;
        }
        if (this.layer !== originalLayer) {
            this.setDirty();
        }

        //
        // Final position calculation: clamp to map bounds and set dirty if changed
        //
        this.game.map.clampToMapBounds(this.pos, this.rad);

        if (!v2.eq(this.pos, this.posOld)) {
            this.setPartDirty();
            this.game.grid.updateObject(this);

            //
            // Halloween obstacle skin
            //
            if (this.obstacleOutfit) {
                this.obstacleOutfit.pos = v2.copy(this.pos);
                this.obstacleOutfit.updateCollider();
                this.obstacleOutfit.setPartDirty();
            }
        }

        //
        // Downed logic
        //
        if (this.downed) {
            this.distSinceLastCrawl += v2.distance(this.posOld, this.pos);

            if (this.animType === GameConfig.Anim.None && this.distSinceLastCrawl > 3) {
                let anim: number = GameConfig.Anim.CrawlForward;

                if (!v2.eq(this.dir, movement, 1)) {
                    anim = GameConfig.Anim.CrawlBackward;
                }

                this.playAnim(anim, GameConfig.player.crawlTime);
                this.distSinceLastCrawl = 0;
            }
        }

        //
        // Weapon stuff
        //
        this.weaponManager.update(dt);

        this.shotSlowdownTimer -= dt;
        if (this.shotSlowdownTimer <= 0) {
            this.shotSlowdownTimer = 0;
        }
    }

    private _firstUpdate = true;

    msgStream = new net.MsgStream(new ArrayBuffer(65536));
    sendMsgs(): void {
        const msgStream = this.msgStream;
        const game = this.game;
        const playerBarn = game.playerBarn;
        msgStream.stream.index = 0;

        if (this._firstUpdate) {
            const joinedMsg = new net.JoinedMsg();
            joinedMsg.teamMode = this.game.teamMode;
            joinedMsg.playerId = this.__id;
            joinedMsg.started = game.started;
            joinedMsg.teamMode = game.teamMode;
            joinedMsg.emotes = this.loadout.emotes;
            this.sendMsg(net.MsgType.Joined, joinedMsg);

            const mapStream = game.map.mapStream.stream;

            msgStream.stream.writeBytes(mapStream, 0, mapStream.byteIndex);
        }

        if (playerBarn.aliveCountDirty || this._firstUpdate) {
            const aliveMsg = new net.AliveCountsMsg();
            this.game.modeManager.updateAliveCounts(aliveMsg.teamAliveCounts);
            msgStream.serializeMsg(net.MsgType.AliveCounts, aliveMsg);
        }

        const updateMsg = new net.UpdateMsg();

        updateMsg.ack = this.ack;

        if (game.gas.dirty || this._firstUpdate) {
            updateMsg.gasDirty = true;
            updateMsg.gasData = game.gas;
        }

        if (game.gas.timeDirty || this._firstUpdate) {
            updateMsg.gasTDirty = true;
            updateMsg.gasT = game.gas.gasT;
        }

        let player: Player;
        if (this.spectating == undefined) {
            // not spectating anyone
            player = this;
        } else if (this.spectating.dead) {
            // was spectating someone but they died so find new player to spectate
            player = this.spectating.killedBy
                ? this.spectating.killedBy
                : playerBarn.randomPlayer();
            if (player === this) {
                player = playerBarn.randomPlayer();
            }
            this.spectating = player;
        } else {
            // spectating someone currently who is still alive
            player = this.spectating;
        }

        const radius = player.zoom + 4;
        const rect = coldet.circleToAabb(player.pos, radius);

        const newVisibleObjects = game.grid.intersectColliderSet(rect);
        // client crashes if active player is not visible
        // so make sure its always added to visible objects
        newVisibleObjects.add(this);

        for (const obj of this.visibleObjects) {
            if (!newVisibleObjects.has(obj)) {
                updateMsg.delObjIds.push(obj.__id);
            }
        }

        for (const obj of newVisibleObjects) {
            if (
                !this.visibleObjects.has(obj) ||
                game.objectRegister.dirtyFull[obj.__id]
            ) {
                updateMsg.fullObjects.push(obj);
            } else if (game.objectRegister.dirtyPart[obj.__id]) {
                updateMsg.partObjects.push(obj);
            }
        }

        this.visibleObjects = newVisibleObjects;

        updateMsg.activePlayerId = player.__id;
        if (this.startedSpectating) {
            updateMsg.activePlayerIdDirty = true;

            // build the active player data object manually
            // To avoid setting the spectating player fields to dirty
            updateMsg.activePlayerData = {
                healthDirty: true,
                health: player.health,
                boostDirty: true,
                boost: player.boost,
                zoomDirty: true,
                zoom: player.zoom,
                actionDirty: true,
                action: player.action,
                inventoryDirty: true,
                inventory: player.inventory,
                scope: player.scope,
                weapsDirty: true,
                curWeapIdx: player.curWeapIdx,
                weapons: player.weapons,
                spectatorCountDirty: true,
                spectatorCount: player.spectatorCount,
            };
            this.startedSpectating = false;
        } else {
            updateMsg.activePlayerIdDirty = player.activeIdDirty;
            updateMsg.activePlayerData = player;
        }

        updateMsg.playerInfos = player._firstUpdate
            ? playerBarn.players
            : playerBarn.newPlayers;
        updateMsg.deletedPlayerIds = playerBarn.deletedPlayers;

        if (
            player.playerStatusDirty ||
            player.playerStatusTicker >
                net.getPlayerStatusUpdateRate(this.game.map.factionMode)
        ) {
            updateMsg.playerStatus.players =
                this.game.modeManager.getPlayerStatuses(player);
            updateMsg.playerStatusDirty = true;
            player.playerStatusTicker = 0;
        }

        if (player.groupStatusDirty) {
            const teamPlayers = player.group!.players;
            for (const p of teamPlayers) {
                updateMsg.groupStatus.players.push({
                    health: p.health,
                    disconnected: p.disconnected,
                });
            }
            updateMsg.groupStatusDirty = true;
        }

        for (let i = 0; i < playerBarn.emotes.length; i++) {
            const emote = playerBarn.emotes[i];
            const emotePlayer = game.objectRegister.getById(emote.playerId) as
                | Player
                | undefined;
            if (emotePlayer) {
                const seeNormalEmote =
                    !emote.isPing && player.visibleObjects.has(emotePlayer);

                const partOfGroup = emotePlayer.groupId === player.groupId;

                if ((GameObjectDefs[emote.type] as EmoteDef)?.teamOnly && !partOfGroup) {
                    continue;
                }

                const isTeamLeader =
                    emotePlayer.role == "leader" && emotePlayer.teamId === player.teamId;
                const seePing =
                    (emote.isPing || emote.itemType) && (partOfGroup || isTeamLeader);
                // HACK: Potato mode forces players to send potato emotes
                if (
                    this.game.map.potatoMode &&
                    !emote.isPing &&
                    emote.type !== "emote_loot"
                )
                    emote.type = "emote_potato";
                if (seeNormalEmote || seePing) {
                    updateMsg.emotes.push(emote);
                }
            } else if (emote.playerId === 0 && emote.isPing) {
                // map pings generated by the game like airdrops
                updateMsg.emotes.push(emote);
            }
        }

        let newBullets = [];
        const extendedRadius = 1.1 * radius;
        const radiusSquared = extendedRadius * extendedRadius;

        const bullets = game.bulletBarn.newBullets;
        for (let i = 0; i < bullets.length; i++) {
            const bullet = bullets[i];
            if (
                v2.lengthSqr(v2.sub(bullet.pos, player.pos)) < radiusSquared ||
                v2.lengthSqr(v2.sub(bullet.clientEndPos, player.pos)) < radiusSquared ||
                coldet.intersectSegmentCircle(
                    bullet.pos,
                    bullet.clientEndPos,
                    player.pos,
                    extendedRadius,
                )
            ) {
                newBullets.push(bullet);
            }
        }
        if (newBullets.length > 255) {
            this.game.logger.warn("Too many new bullets created!", newBullets.length);
            newBullets = newBullets.slice(0, 255);
        }

        updateMsg.bullets = newBullets;

        for (let i = 0; i < game.explosionBarn.newExplosions.length; i++) {
            const explosion = game.explosionBarn.newExplosions[i];
            const rad = explosion.rad + extendedRadius;
            if (v2.lengthSqr(v2.sub(explosion.pos, player.pos)) < rad * rad) {
                updateMsg.explosions.push(explosion);
            }
        }
        if (updateMsg.explosions.length > 255) {
            this.game.logger.warn(
                "Too many new explosions created!",
                updateMsg.explosions.length,
            );
            updateMsg.explosions = updateMsg.explosions.slice(0, 255);
        }

        const planes = this.game.planeBarn.planes;
        for (let i = 0; i < planes.length; i++) {
            const plane = planes[i];
            if (coldet.testCircleAabb(plane.pos, plane.rad, rect.min, rect.max)) {
                updateMsg.planes.push(plane);
            }
        }

        if (playerBarn.killLeaderDirty || this._firstUpdate) {
            updateMsg.killLeaderDirty = true;
            updateMsg.killLeaderId = playerBarn.killLeader?.__id ?? 0;
            updateMsg.killLeaderKills = playerBarn.killLeader?.kills ?? 0;
        }

        msgStream.serializeMsg(net.MsgType.Update, updateMsg);

        for (let i = 0; i < this.msgsToSend.length; i++) {
            const msg = this.msgsToSend[i];
            msgStream.serializeMsg(msg.type, msg.msg);
        }

        this.msgsToSend.length = 0;

        const globalMsgStream = this.game.msgsToSend.stream;
        msgStream.stream.writeBytes(globalMsgStream, 0, globalMsgStream.byteIndex);

        this.sendData(msgStream.getBuffer());
        this._firstUpdate = false;
    }

    spectate(spectateMsg: net.SpectateMsg): void {
        const spectatablePlayers = this.game.modeManager.getSpectatablePlayers(this);
        let playerToSpec: Player | undefined;
        switch (true) {
            case spectateMsg.specBegin:
                const groupExistsOrAlive =
                    this.game.isTeamMode && this.group!.livingPlayers.length > 0;
                if (groupExistsOrAlive) {
                    playerToSpec =
                        spectatablePlayers[
                            util.randomInt(0, spectatablePlayers.length - 1)
                        ];
                } else {
                    let attempts = 0;
                    const getAliveKiller = (
                        killer: Player | undefined,
                    ): Player | undefined => {
                        attempts++;
                        if (attempts > 80) return undefined;

                        if (!killer) return undefined;
                        if (!killer.dead) return killer;
                        if (
                            killer.killedBy &&
                            killer.killedBy != this &&
                            killer.killedBy !== killer
                        ) {
                            return getAliveKiller(killer.killedBy);
                        }

                        return undefined;
                    };
                    const aliveKiller = getAliveKiller(this.killedBy);
                    playerToSpec =
                        aliveKiller ??
                        spectatablePlayers[
                            util.randomInt(0, spectatablePlayers.length - 1)
                        ];
                }
                break;
            case spectateMsg.specNext:
            case spectateMsg.specPrev:
                const nextOrPrev = +spectateMsg.specNext - +spectateMsg.specPrev;
                playerToSpec = util.wrappedArrayIndex(
                    spectatablePlayers,
                    spectatablePlayers.indexOf(this.spectating!) + nextOrPrev,
                );
                break;
        }
        this.spectating = playerToSpec;
    }

    damage(params: DamageParams) {
        if (this._health < 0) this._health = 0;
        if (this.dead) return;

        const sourceIsPlayer = params.source?.__type === ObjectType.Player;

        // teammates can't deal damage to each other
        if (sourceIsPlayer && params.source !== this) {
            if (
                (params.source as Player).groupId === this.groupId &&
                !this.disconnected
            ) {
                return;
            }
            if (
                this.game.map.factionMode &&
                (params.source as Player).teamId === this.teamId
            ) {
                return;
            }
        }

        let finalDamage = params.amount!;

        // ignore armor for gas and bleeding damage
        if (
            params.damageType !== GameConfig.DamageType.Gas &&
            params.damageType !== GameConfig.DamageType.Bleeding &&
            params.damageType !== GameConfig.DamageType.Airdrop
        ) {
            const gameSourceDef = GameObjectDefs[params.gameSourceType ?? ""];

            if (this.hasPerk("flak_jacket")) {
                const isExplosion =
                    gameSourceDef &&
                    (gameSourceDef.type === "explosion" ||
                        (gameSourceDef.type === "bullet" && gameSourceDef.shrapnel));
                finalDamage *= isExplosion ? 0.1 : 0.9;
            }

            if (this.hasPerk("steelskin")) finalDamage *= 0.5;

            let isHeadShot = false;

            if (gameSourceDef && "headshotMult" in gameSourceDef) {
                isHeadShot = gameSourceDef.headshotMult > 1 && Math.random() < 0.15;

                if (isHeadShot) {
                    finalDamage *= gameSourceDef.headshotMult;
                }
            }

            const chest = GameObjectDefs[this.chest] as ChestDef;
            if (chest && !isHeadShot) {
                finalDamage -= finalDamage * chest.damageReduction;
            }

            const helmet = GameObjectDefs[this.helmet] as HelmetDef;
            if (helmet) {
                finalDamage -=
                    finalDamage * (helmet.damageReduction * (isHeadShot ? 1 : 0.3));
            }
        }

        if (this._health - finalDamage < 0) finalDamage = this.health;

        this.game.pluginManager.emit("playerDamage", { ...params, player: this });

        this.damageTaken += finalDamage;
        if (sourceIsPlayer && params.source !== this) {
            (params.source as Player).damageDealt += finalDamage;
        }

        this.health -= finalDamage;

        if (this.game.isTeamMode) {
            this.setGroupStatuses();
        }

        if (this._health === 0) {
            if (!this.downed && this.hasPerk("self_revive")) {
                this.down(params);
            } else {
                this.game.modeManager.handlePlayerDeath(this, params);
            }
        }
    }

    /**
     * adds gameover message to "this.msgsToSend" for the player and all their spectators
     */
    addGameOverMsg(winningTeamId: number = 0): void {
        const targetPlayer = this.spectating ?? this;
        let stats: net.PlayerStatsMsg["playerStats"][] = [targetPlayer];

        if (this.group) {
            stats = this.group.players;
        }

        const aliveCount = this.game.modeManager.aliveCount();

        if (this.game.modeManager.showStatsMsg(targetPlayer)) {
            for (const stat of stats) {
                const statsMsg = new net.PlayerStatsMsg();
                statsMsg.playerStats = stat;

                this.msgsToSend.push({ type: net.MsgType.PlayerStats, msg: statsMsg });

                for (const spectator of this.spectators) {
                    spectator.msgsToSend.push({
                        type: net.MsgType.PlayerStats,
                        msg: statsMsg,
                    });
                }
            }
        } else {
            const gameOverMsg = new net.GameOverMsg();
            gameOverMsg.playerStats = stats;
            gameOverMsg.teamRank =
                winningTeamId == targetPlayer.teamId ? 1 : aliveCount + 1; //gameover msg sent after alive count updated
            gameOverMsg.teamId = targetPlayer.teamId;
            gameOverMsg.winningTeamId = winningTeamId;
            gameOverMsg.gameOver = !!winningTeamId;
            this.msgsToSend.push({ type: net.MsgType.GameOver, msg: gameOverMsg });

            for (const spectator of this.spectators) {
                spectator.msgsToSend.push({
                    type: net.MsgType.GameOver,
                    msg: gameOverMsg,
                });
            }
        }
    }

    downedBy: Player | undefined;
    /** downs a player */
    down(params: DamageParams): void {
        this.downed = true;
        this.downedCount++;
        this.boost = 0;
        this.health = 100;
        this.animType = GameConfig.Anim.None;
        this.setDirty();

        this.shootStart = false;
        this.shootHold = false;
        this.cancelAction();

        this.weaponManager.throwThrowable();

        //
        // Send downed msg
        //
        const downedMsg = new net.KillMsg();
        downedMsg.damageType = params.damageType;
        downedMsg.itemSourceType = params.gameSourceType ?? "";
        downedMsg.mapSourceType = params.mapSourceType ?? "";
        downedMsg.targetId = this.__id;
        downedMsg.downed = true;

        if (params.source instanceof Player) {
            this.downedBy = params.source;
            downedMsg.killerId = params.source.__id;
            downedMsg.killCreditId = params.source.__id;
        }

        this.game.broadcastMsg(net.MsgType.Kill, downedMsg);
    }

    private _assignNewSpectate() {
        if (this.spectatorCount == 0) return;

        let player: Player;
        if (!this.game.isTeamMode) {
            // solo
            player =
                this.killedBy && this.killedBy != this
                    ? this.killedBy
                    : this.game.playerBarn.randomPlayer();
        } else if (this.group) {
            if (!this.group.checkAllDeadOrDisconnected(this)) {
                // team alive
                player = this.group.randomPlayer(this);
            } else {
                // team dead
                if (
                    this.killedBy &&
                    this.killedBy != this &&
                    this.group.checkAllDeadOrDisconnected(this) // only spectate player's killer if all the players teammates are dead, otherwise spec teammates
                ) {
                    player = this.killedBy;
                } else {
                    player = this.group.randomPlayer(this);
                }
            }
        }

        // loop through all of this object's spectators and change who they're spectating to the new selected player
        for (const spectator of this.spectators) {
            if (
                this.game.isTeamMode &&
                this.game.playerBarn.isTeamGameOver() &&
                this.group!.players.includes(spectator)
            ) {
                //inverted logic
                //if the game is over and the spectator is on the player who died's team...
                //then you keep them spectating their dead teammate instead of the winner...
                //so the proper stats show in the game over msg
            } else {
                spectator.spectating = player!;
            }
        }
    }

    killedBy: Player | undefined;

    kill(params: DamageParams): void {
        if (this.dead) return;
        if (this.downed) this.downed = false;
        this.dead = true;
        this.boost = 0;
        this.actionType = GameConfig.Action.None;
        this.actionSeq++;
        this.hasteType = GameConfig.HasteType.None;
        this.hasteSeq++;
        this.animType = GameConfig.Anim.None;
        this.animSeq++;
        this.setDirty();

        this.shootHold = false;

        this.game.playerBarn.aliveCountDirty = true;
        this.game.playerBarn.livingPlayers.splice(
            this.game.playerBarn.livingPlayers.indexOf(this),
            1,
        );

        this.group?.checkPlayers();

        if (this.team) {
            this.team.livingPlayers.splice(this.team.livingPlayers.indexOf(this), 1);
        }

        if (this.weaponManager.cookingThrowable) {
            this.weaponManager.throwThrowable(true);
        }

        //
        // Send kill msg
        //
        const killMsg = new net.KillMsg();
        killMsg.damageType = params.damageType;
        killMsg.itemSourceType = params.gameSourceType ?? "";
        killMsg.mapSourceType = params.mapSourceType ?? "";
        killMsg.targetId = this.__id;
        killMsg.killed = true;

        if (params.source instanceof Player) {
            const source = params.source;
            this.killedBy = source;
            if (source !== this) {
                source.kills++;

                if (source.isKillLeader) {
                    this.game.playerBarn.killLeaderDirty = true;
                }

                if (source.hasPerk("takedown")) {
                    source.health += 25;
                    source.boost += 25;
                    source.giveHaste(GameConfig.HasteType.Takedown, 3);
                }
            }

            killMsg.killerId = source.__id;
            killMsg.killCreditId = source.__id;
            killMsg.killerKills = source.kills;
        }

        if (this.hasPerk("final_bugle")) {
            this.initLastBreath();
        }

        if (
            this.hasPerk("martyrdom") ||
            this.role == "grenadier" ||
            this.role == "demo"
        ) {
            const martyrNadeType = "martyr_nade";
            const throwableDef = GameObjectDefs[martyrNadeType] as ThrowableDef;
            for (let i = 0; i < 12; i++) {
                const velocity = v2.mul(v2.randomUnit(), util.random(2, 5));
                this.game.projectileBarn.addProjectile(
                    this.playerId,
                    martyrNadeType,
                    this.pos,
                    1,
                    this.layer,
                    velocity,
                    throwableDef.fuseTime,
                    GameConfig.DamageType.Player,
                );
            }
        }

        if (this.game.map.factionMode && this.team!.livingPlayers.length <= 2) {
            const last1 = this.team!.livingPlayers[0];
            const last2 = this.team!.livingPlayers[1];

            if (last1 && last1.role != "last_man") {
                last1.promoteToRole("last_man");
            }

            if (last2 && last2.role != "last_man") {
                last2.promoteToRole("last_man");
            }
        }

        this.game.broadcastMsg(net.MsgType.Kill, killMsg);

        if (this.role && this.role !== "kill_leader") {
            const roleMsg = new net.RoleAnnouncementMsg();
            roleMsg.role = this.role;
            roleMsg.assigned = false;
            roleMsg.killed = true;
            roleMsg.playerId = this.__id;
            roleMsg.killerId = params.source?.__id ?? 0;
            this.game.broadcastMsg(net.MsgType.RoleAnnouncement, roleMsg);
        }

        if (this.isKillLeader) {
            const roleMsg = new net.RoleAnnouncementMsg();
            roleMsg.role = "kill_leader";
            roleMsg.assigned = false;
            roleMsg.killed = true;
            roleMsg.playerId = this.__id;
            roleMsg.killerId = params.source?.__id ?? 0;
            this.game.broadcastMsg(net.MsgType.RoleAnnouncement, roleMsg);
        }

        if (this.game.map.mapDef.gameMode.killLeaderEnabled) {
            const killLeader = this.game.playerBarn.killLeader;

            let killLeaderKills = 0;

            if (killLeader && !killLeader.dead) {
                killLeaderKills = killLeader.kills;
            }

            const newKillLeader = this.game.playerBarn.getPlayerWithHighestKills();
            if (
                killLeader !== newKillLeader &&
                params.source &&
                newKillLeader === params.source &&
                newKillLeader.kills > killLeaderKills
            ) {
                if (killLeader) {
                    killLeader.role = "";
                }

                params.source.promoteToRole("kill_leader");
            }
        }

        if (this.isKillLeader) {
            this.game.playerBarn.killLeader = undefined;
            this.game.playerBarn.killLeaderDirty = true;
            this.isKillLeader = false;
        }

        this.game.pluginManager.emit("playerKill", { ...params, player: this });

        //
        // Give spectators someone new to spectate
        //

        this._assignNewSpectate();

        //
        // Send game over message to player
        //
        this.addGameOverMsg();

        this.game.deadBodyBarn.addDeadBody(this.pos, this.__id, this.layer, params.dir);

        //
        // Kill outfit obstacle
        //
        if (this.obstacleOutfit) {
            this.obstacleOutfit.kill(params);
        }

        //
        // drop loot
        //

        for (let i = 0; i < GameConfig.WeaponSlot.Count; i++) {
            const weap = this.weapons[i];
            if (!weap.type) continue;
            const def = GameObjectDefs[weap.type];
            switch (def.type) {
                case "gun":
                    this.weaponManager.dropGun(i);
                    weap.type = "";
                    break;
                case "melee":
                    if (def.noDropOnDeath || weap.type === "fists") break;
                    this.game.lootBarn.addLoot(weap.type, this.pos, this.layer, 1);
                    weap.type = "fists";
                    break;
                case "throwable":
                    weap.type = "";
                    break;
            }
        }
        this.weaponManager.setCurWeapIndex(GameConfig.WeaponSlot.Melee);

        for (const item in GameConfig.bagSizes) {
            // const def = GameObjectDefs[item] as AmmoDef | HealDef;
            if (item == "1xscope") {
                continue;
            }

            if (this.inventory[item] > 0) {
                this.game.lootBarn.addLoot(
                    item,
                    this.pos,
                    this.layer,
                    this.inventory[item],
                );
            }
        }

        for (const item of GEAR_TYPES) {
            const type = this[item];
            if (!type) continue;
            const def = GameObjectDefs[type] as HelmetDef | ChestDef | BackpackDef;
            if (!!(def as ChestDef).noDrop || def.level < 1) continue;
            this.game.lootBarn.addLoot(type, this.pos, this.layer, 1);
        }

        if (this.outfit) {
            const def = GameObjectDefs[this.outfit] as OutfitDef;
            if (!def.noDropOnDeath && !def.noDrop) {
                this.game.lootBarn.addLoot(this.outfit, this.pos, this.layer, 1);
            }
        }

        for (let i = this.perks.length - 1; i >= 0; i--) {
            const perk = this.perks[i];
            if (perk.droppable) {
                this.game.lootBarn.addLoot(perk.type, this.pos, this.layer, 1);
            }
        }
        this.perks.length = 0;
        this.perkTypes.length = 0;

        // death emote
        if (this.loadout.emotes[GameConfig.EmoteSlot.Death] != "") {
            this.game.playerBarn.emotes.push(
                new Emote(
                    this.__id,
                    this.pos,
                    this.loadout.emotes[GameConfig.EmoteSlot.Death],
                    false,
                ),
            );
        }

        // Building gore region (club pool)
        const objs = this.game.grid.intersectCollider(this.collider);
        for (const obj of objs) {
            if (
                obj.__type === ObjectType.Building &&
                obj.goreRegion &&
                coldet.testCircleAabb(
                    this.pos,
                    this.rad,
                    obj.goreRegion.min,
                    obj.goreRegion.max,
                )
            ) {
                obj.onGoreRegionKill();
            }
        }

        // Potato mode swap
        if (this.game.map.potatoMode && params.source instanceof Player) {
            (params.source as Player).potatoModeWeaponSwitch(params.gameSourceType);
        }

        // Check for game over
        this.game.checkGameOver();

        // send data to parent process
        this.game.updateData();
    }

    isReloading() {
        return (
            this.actionType == GameConfig.Action.Reload ||
            this.actionType == GameConfig.Action.ReloadAlt
        );
    }

    /** returns player to revive if can revive */
    getPlayerToRevive(): Player | undefined {
        if (this.actionType != GameConfig.Action.None) {
            // action in progress
            return;
        }
        if (!this.game.modeManager.canRevive(this)) {
            return;
        }

        // const downedTeammates = this.group!.getAliveTeammates(this).filter(
        //     (t) => t.downed
        // );
        const nearbyDownedTeammates = this.game.grid
            .intersectCollider(
                collider.createCircle(this.pos, GameConfig.player.reviveRange),
            )
            .filter(
                (obj): obj is Player =>
                    obj.__type == ObjectType.Player &&
                    obj.teamId == this.teamId &&
                    obj.downed,
            );

        let playerToRevive: Player | undefined;
        let closestDist = Number.MAX_VALUE;
        for (const teammate of nearbyDownedTeammates) {
            if (!util.sameLayer(this.layer, teammate.layer)) {
                continue;
            }
            const dist = v2.distance(this.pos, teammate.pos);
            if (dist <= GameConfig.player.reviveRange && dist < closestDist) {
                playerToRevive = teammate;
                closestDist = dist;
            }
        }

        return playerToRevive;
    }

    revive(playerToRevive: Player | undefined) {
        if (!playerToRevive) return;

        this.playerBeingRevived = playerToRevive;
        if (this.downed && this.hasPerk("self_revive")) {
            this.doAction(
                "",
                GameConfig.Action.Revive,
                GameConfig.player.reviveDuration,
                this.__id,
            );
        } else {
            playerToRevive.doAction(
                "",
                GameConfig.Action.Revive,
                GameConfig.player.reviveDuration,
            );
            this.doAction(
                "",
                GameConfig.Action.Revive,
                GameConfig.player.reviveDuration,
                playerToRevive.__id,
            );
            this.playAnim(GameConfig.Anim.Revive, GameConfig.player.reviveDuration);
        }
    }

    isAffectedByAOE(medic: Player): boolean {
        const effectRange =
            medic.actionType == GameConfig.Action.Revive
                ? GameConfig.player.medicReviveRange
                : GameConfig.player.medicHealRange;

        return (
            this.game.modeManager.getIdContext(medic) ==
                this.game.modeManager.getIdContext(this) &&
            !!util.sameLayer(medic.layer, this.layer) &&
            v2.lengthSqr(v2.sub(medic.pos, this.pos)) <= effectRange * effectRange
        );
    }

    /** for the medic role in 50v50 */
    getAOEPlayers(): Player[] {
        const effectRange =
            this.actionType == GameConfig.Action.Revive
                ? GameConfig.player.medicReviveRange
                : GameConfig.player.medicHealRange;

        return this.game.grid
            .intersectCollider(
                //includes self
                collider.createCircle(this.pos, effectRange),
            )
            .filter(
                (obj): obj is Player =>
                    obj.__type == ObjectType.Player && obj.isAffectedByAOE(this),
            );
    }

    useHealingItem(item: string): void {
        const itemDef = GameObjectDefs[item];
        assert(itemDef.type === "heal", `Invalid heal item ${item}`);

        if (
            (!this.hasPerk("aoe_heal") && this.health == itemDef.maxHeal) ||
            this.actionType == GameConfig.Action.UseItem
        ) {
            return;
        }
        if (!this.inventory[item]) {
            return;
        }

        this.cancelAction();
        this.doAction(
            item,
            GameConfig.Action.UseItem,
            (this.hasPerk("aoe_heal") ? 0.75 : 1) * itemDef.useTime,
        );
    }

    applyActionFunc(actionFunc: (target: Player) => void): void {
        if (this.hasPerk("aoe_heal")) {
            let aoePlayers = this.getAOEPlayers();

            //aoe doesnt heal/give boost to downed players
            if (this.actionType == GameConfig.Action.UseItem) {
                aoePlayers = aoePlayers.filter((p) => !p.downed);
            }

            for (let i = 0; i < aoePlayers.length; i++) {
                const aoePlayer = aoePlayers[i];
                actionFunc(aoePlayer);
            }
        } else {
            const target =
                this.actionType === GameConfig.Action.Revive && this.playerBeingRevived
                    ? this.playerBeingRevived
                    : this;
            actionFunc(target);
        }
    }

    useBoostItem(item: string): void {
        const itemDef = GameObjectDefs[item];
        assert(itemDef.type === "boost", `Invalid boost item ${item}`);

        if (this.actionType == GameConfig.Action.UseItem) {
            return;
        }
        if (!this.inventory[item]) {
            return;
        }

        this.cancelAction();
        this.doAction(
            item,
            GameConfig.Action.UseItem,
            (this.hasPerk("aoe_heal") ? 0.75 : 1) * itemDef.useTime,
        );
    }

    moveLeft = false;
    moveRight = false;
    moveUp = false;
    moveDown = false;
    shootStart = false;
    shootHold = false;
    portrait = false;
    touchMoveActive = false;
    touchMoveDir = v2.create(1, 0);
    touchMoveLen = 255;
    toMouseDir = v2.create(1, 0);
    toMouseLen = 0;

    shouldAcceptInput(input: number): boolean {
        if (this.downed) {
            const isAcceptedInput =
                [GameConfig.Input.Interact, GameConfig.Input.Revive].includes(input) ||
                //cancel inputs can only be accepted if player is reviving (themselves)
                //otherwise it doesnt make sense for a player to be able to cancel another player's revive
                (input == GameConfig.Input.Cancel &&
                    this.game.modeManager.isReviving(this));

            return this.hasPerk("self_revive") && isAcceptedInput;
        }

        return true;
    }

    handleInput(msg: net.InputMsg): void {
        this.ack = msg.seq;

        if (this.dead) return;

        if (!v2.eq(this.dir, msg.toMouseDir)) {
            this.setPartDirty();
            this.dirOld = v2.copy(this.dir);
            this.dir = msg.toMouseDir;
        }
        this.shootHold = msg.shootHold;

        this.moveLeft = msg.moveLeft;
        this.moveRight = msg.moveRight;
        this.moveUp = msg.moveUp;
        this.moveDown = msg.moveDown;
        this.portrait = msg.portrait;
        this.touchMoveActive = msg.touchMoveActive;
        this.touchMoveDir = msg.touchMoveDir;
        this.touchMoveLen = msg.touchMoveLen;

        if (msg.shootStart) {
            this.shootStart = true;
        }
        this.toMouseLen = msg.toMouseLen;

        // HACK? client for some reason sends Interact followed by Cancel on mobile
        // so we ignore the cancel request when reviving a player
        let ignoreCancel = false;

        for (let i = 0; i < msg.inputs.length; i++) {
            const input = msg.inputs[i];
            if (!this.shouldAcceptInput(input)) continue;
            switch (input) {
                case GameConfig.Input.StowWeapons:
                case GameConfig.Input.EquipMelee:
                    this.weaponManager.setCurWeapIndex(GameConfig.WeaponSlot.Melee);
                    break;
                case GameConfig.Input.EquipPrimary:
                    this.weaponManager.setCurWeapIndex(GameConfig.WeaponSlot.Primary);
                    break;
                case GameConfig.Input.EquipSecondary:
                    this.weaponManager.setCurWeapIndex(GameConfig.WeaponSlot.Secondary);
                    break;
                case GameConfig.Input.EquipThrowable:
                    if (this.curWeapIdx === GameConfig.WeaponSlot.Throwable) {
                        this.weaponManager.throwThrowable(true);
                        this.weaponManager.showNextThrowable();
                    } else {
                        this.weaponManager.setCurWeapIndex(
                            GameConfig.WeaponSlot.Throwable,
                        );
                    }
                    break;
                case GameConfig.Input.EquipPrevWeap:
                    {
                        const curIdx = this.curWeapIdx;

                        for (
                            let i = curIdx;
                            i < curIdx + GameConfig.WeaponSlot.Count;
                            i++
                        ) {
                            const idx = math.mod(i, GameConfig.WeaponSlot.Count);
                            if (this.weapons[idx].type) {
                                this.weaponManager.setCurWeapIndex(idx);
                            }
                        }
                    }
                    break;
                case GameConfig.Input.EquipNextWeap:
                    {
                        const curIdx = this.curWeapIdx;

                        for (
                            let i = curIdx;
                            i > curIdx - GameConfig.WeaponSlot.Count;
                            i--
                        ) {
                            const idx = math.mod(i, GameConfig.WeaponSlot.Count);
                            if (this.weapons[idx].type) {
                                this.weaponManager.setCurWeapIndex(idx);
                            }
                        }
                    }
                    break;
                case GameConfig.Input.EquipLastWeap:
                    this.weaponManager.setCurWeapIndex(this.weaponManager.lastWeaponIdx);
                    break;
                case GameConfig.Input.EquipOtherGun:
                    if (
                        this.curWeapIdx == GameConfig.WeaponSlot.Primary ||
                        this.curWeapIdx == GameConfig.WeaponSlot.Secondary
                    ) {
                        const otherGunSlotIdx = this.curWeapIdx ^ 1;
                        const isOtherGunSlotFull: number =
                            +!!this.weapons[otherGunSlotIdx].type; //! ! converts string to boolean, + coerces boolean to number
                        this.weaponManager.setCurWeapIndex(
                            isOtherGunSlotFull
                                ? otherGunSlotIdx
                                : GameConfig.WeaponSlot.Melee,
                        );
                    } else if (
                        this.curWeapIdx == GameConfig.WeaponSlot.Melee &&
                        (this.weapons[GameConfig.WeaponSlot.Primary].type ||
                            this.weapons[GameConfig.WeaponSlot.Secondary].type)
                    ) {
                        this.weaponManager.setCurWeapIndex(
                            +!this.weapons[GameConfig.WeaponSlot.Primary].type,
                        );
                    } else if (this.curWeapIdx == GameConfig.WeaponSlot.Throwable) {
                        const bothSlotsEmpty =
                            !this.weapons[GameConfig.WeaponSlot.Primary].type &&
                            !this.weapons[GameConfig.WeaponSlot.Secondary].type;
                        if (bothSlotsEmpty) {
                            this.weaponManager.setCurWeapIndex(
                                GameConfig.WeaponSlot.Melee,
                            );
                        } else {
                            const index = this.weapons[GameConfig.WeaponSlot.Primary].type
                                ? GameConfig.WeaponSlot.Primary
                                : GameConfig.WeaponSlot.Secondary;
                            this.weaponManager.setCurWeapIndex(index);
                        }
                    }

                    break;
                case GameConfig.Input.Interact: {
                    const loot = this.getClosestLoot();
                    const obstacles = this.getInteractableObstacles();
                    const playerToRevive = this.getPlayerToRevive();

                    const interactables = [loot, ...obstacles, playerToRevive];

                    for (let i = 0; i < interactables.length; i++) {
                        const interactable = interactables[i];
                        if (!interactable) continue;
                        if (interactable.__type === ObjectType.Player) {
                            this.revive(playerToRevive);
                            ignoreCancel = true;
                        } else {
                            this.interactWith(interactable);
                        }
                    }
                    break;
                }
                case GameConfig.Input.Loot: {
                    const loot = this.getClosestLoot();
                    if (loot) {
                        this.interactWith(loot);
                    }
                    break;
                }
                case GameConfig.Input.Use: {
                    const obstacles = this.getInteractableObstacles();
                    for (let i = 0; i < obstacles.length; i++) {
                        obstacles[i].interact(this);
                    }
                    break;
                }
                case GameConfig.Input.Reload:
                    this.weaponManager.tryReload();
                    break;
                case GameConfig.Input.Cancel:
                    if (ignoreCancel) {
                        break;
                    }
                    this.cancelAction();
                    break;
                case GameConfig.Input.EquipNextScope: {
                    const scopeIdx = SCOPE_LEVELS.indexOf(this.scope);

                    for (let i = scopeIdx + 1; i < SCOPE_LEVELS.length; i++) {
                        const nextScope = SCOPE_LEVELS[i];

                        if (!this.inventory[nextScope]) continue;
                        this.scope = nextScope;
                        this.inventoryDirty = true;
                        break;
                    }
                    break;
                }
                case GameConfig.Input.EquipPrevScope: {
                    const scopeIdx = SCOPE_LEVELS.indexOf(this.scope);

                    for (let i = scopeIdx - 1; i >= 0; i--) {
                        const prevScope = SCOPE_LEVELS[i];

                        if (!this.inventory[prevScope]) continue;
                        this.scope = prevScope;
                        this.inventoryDirty = true;
                        break;
                    }
                    break;
                }
                case GameConfig.Input.SwapWeapSlots: {
                    const primary = {
                        ...this.weapons[GameConfig.WeaponSlot.Primary],
                    };
                    const secondary = {
                        ...this.weapons[GameConfig.WeaponSlot.Secondary],
                    };

                    this.weapons[GameConfig.WeaponSlot.Primary] = secondary;
                    this.weapons[GameConfig.WeaponSlot.Secondary] = primary;

                    // curWeapIdx's setter method already sets dirty.weapons
                    if (
                        this.curWeapIdx == GameConfig.WeaponSlot.Primary ||
                        this.curWeapIdx == GameConfig.WeaponSlot.Secondary
                    ) {
                        this.weaponManager.setCurWeapIndex(
                            this.curWeapIdx ^ 1,
                            false,
                            false,
                        );
                    } else {
                        this.weapsDirty = true;
                    }
                    break;
                }
                case GameConfig.Input.Revive: {
                    const playerToRevive = this.getPlayerToRevive();
                    this.revive(playerToRevive);
                }
            }
        }

        //no exceptions for any perks or roles
        if (this.downed) return;

        switch (msg.useItem) {
            case "bandage":
            case "healthkit":
                this.useHealingItem(msg.useItem);
                break;
            case "soda":
            case "painkiller":
                this.useBoostItem(msg.useItem);
                break;
            case "1xscope":
            case "2xscope":
            case "4xscope":
            case "8xscope":
            case "15xscope":
                if (this.inventory[msg.useItem]) {
                    this.scope = msg.useItem;
                    this.inventoryDirty = true;
                }
                break;
        }
    }

    getClosestLoot(): Loot | undefined {
        const objs = this.game.grid.intersectCollider(
            collider.createCircle(this.pos, this.rad + 5),
        );

        let closestLoot: Loot | undefined;
        let closestDist = Number.MAX_VALUE;

        for (let i = 0; i < objs.length; i++) {
            const loot = objs[i];
            if (loot.__type !== ObjectType.Loot) continue;
            if (loot.destroyed) continue;
            if (
                util.sameLayer(loot.layer, this.layer) &&
                (loot.ownerId == 0 || loot.ownerId == this.__id)
            ) {
                const pos = loot.pos;
                const rad = this.isMobile
                    ? this.rad + loot.rad * GameConfig.player.touchLootRadMult
                    : this.rad + loot.rad;
                const toPlayer = v2.sub(this.pos, pos);
                const distSq = v2.lengthSqr(toPlayer);
                if (distSq < rad * rad && distSq < closestDist) {
                    closestDist = distSq;
                    closestLoot = loot;
                }
            }
        }

        return closestLoot;
    }

    getInteractableObstacles(): Obstacle[] {
        const objs = this.game.grid.intersectCollider(
            collider.createCircle(this.pos, this.rad + 5),
        );

        let obstacles: Array<{ pen: number; obstacle: Obstacle }> = [];

        for (let i = 0; i < objs.length; i++) {
            const obstacle = objs[i];
            if (obstacle.__type !== ObjectType.Obstacle) continue;
            if (!obstacle.dead && util.sameLayer(obstacle.layer, this.layer)) {
                if (obstacle.interactionRad > 0) {
                    const res = collider.intersectCircle(
                        obstacle.collider,
                        this.pos,
                        obstacle.interactionRad + this.rad,
                    );
                    if (res) {
                        obstacles.push({
                            pen: res.pen,
                            obstacle,
                        });
                    }
                }
            }
        }
        return obstacles.sort((a, b) => a.pen - b.pen).map((o) => o.obstacle);
    }

    interactWith(obj: GameObject): void {
        switch (obj.__type) {
            case ObjectType.Loot:
                this.pickupLoot(obj);
                break;
            case ObjectType.Obstacle:
                obj.interact(this);
                break;
        }
    }

    getFreeGunSlot(obj: Loot) {
        const gunSlots = [GameConfig.WeaponSlot.Primary, GameConfig.WeaponSlot.Secondary];

        // first loop to find dual wieldable guns
        for (const slot of gunSlots) {
            const slotDef = GameObjectDefs[this.weapons[slot].type] as GunDef | undefined;

            if (slotDef?.dualWieldType && obj.type === this.weapons[slot].type) {
                return {
                    slot,
                    isDual: true,
                    cause: net.PickupMsgType.Success,
                };
            }
        }

        // second loop to find empty slots
        for (const slot of gunSlots) {
            if (this.weapons[slot].type === "") {
                return {
                    slot,
                    isDual: false,
                    cause: net.PickupMsgType.Success,
                };
            }
        }

        // if none are found use active weapon if its a gun
        if (GameConfig.WeaponType[this.curWeapIdx] === "gun") {
            return {
                slot: this.curWeapIdx,
                isDual: false,
                cause:
                    this.activeWeapon === obj.type
                        ? net.PickupMsgType.AlreadyOwned
                        : net.PickupMsgType.Success,
            };
        }

        return {
            slot: null,
            isDual: false,
            cause: net.PickupMsgType.Full,
        };
    }

    pickupTicker = 0;
    pickupLoot(obj: Loot) {
        if (obj.destroyed) return;
        if (this.pickupTicker > 0) return;
        this.pickupTicker = 0.1;
        const def = GameObjectDefs[obj.type];

        let amountLeft = 0;
        let lootToAdd = obj.type;
        let removeLoot = true;
        const pickupMsg = new net.PickupMsg();
        pickupMsg.item = obj.type;
        pickupMsg.type = net.PickupMsgType.Success;

        switch (def.type) {
            case "ammo":
            case "scope":
            case "heal":
            case "boost":
            case "throwable":
                {
                    const backpackLevel = this.getGearLevel(this.backpack);
                    const bagSpace = GameConfig.bagSizes[obj.type]
                        ? GameConfig.bagSizes[obj.type][backpackLevel]
                        : 0;

                    if (this.inventory[obj.type] + obj.count <= bagSpace) {
                        switch (def.type) {
                            case "scope": {
                                const currentScope = GameObjectDefs[
                                    this.scope
                                ] as ScopeDef;
                                if (def.level > currentScope.level) {
                                    // only switch scopes if new scope is highest level player has
                                    this.scope = obj.type;
                                }
                                break;
                            }
                            case "throwable": {
                                if (
                                    throwableList.includes(obj.type) &&
                                    !this.weapons[GameConfig.WeaponSlot.Throwable].type
                                ) {
                                    // fill empty slot with throwable, otherwise just add to inv
                                    if (this.inventory[obj.type] == 0) {
                                        this.weaponManager.setWeapon(
                                            GameConfig.WeaponSlot.Throwable,
                                            obj.type,
                                            0,
                                        );
                                    }
                                }
                                break;
                            }
                        }
                        this.inventory[obj.type] += obj.count;
                        this.inventoryDirty = true;
                    } else {
                        // spawn new loot object to animate the pickup rejection
                        const spaceLeft = bagSpace - this.inventory[obj.type];
                        const amountToAdd = spaceLeft;

                        if (amountToAdd <= 0) {
                            pickupMsg.type = net.PickupMsgType.Full;
                            if (def.type === "scope") {
                                pickupMsg.type = net.PickupMsgType.AlreadyOwned;
                            }
                        } else {
                            this.inventory[obj.type] += amountToAdd;
                            this.inventoryDirty = true;
                            if (
                                def.type === "throwable" &&
                                amountToAdd != 0 &&
                                throwableList.includes(obj.type) &&
                                !this.weapons[GameConfig.WeaponSlot.Throwable].type
                            ) {
                                this.weaponManager.setWeapon(
                                    GameConfig.WeaponSlot.Throwable,
                                    obj.type,
                                    0,
                                );
                                this.setDirty();
                            }
                        }
                        amountLeft = obj.count - amountToAdd;
                    }
                    // this is here because it needs to execute regardless of what happens above
                    // automatically reloads gun if inventory has 0 ammo and ammo is picked up
                    const weaponInfo = GameObjectDefs[this.activeWeapon];
                    if (
                        def.type == "ammo" &&
                        weaponInfo.type === "gun" &&
                        this.weapons[this.curWeapIdx].ammo == 0 &&
                        weaponInfo.ammo == obj.type
                    ) {
                        this.weaponManager.tryReload();
                    }
                }
                break;
            case "melee":
                this.weaponManager.dropMelee();
                this.weaponManager.setWeapon(GameConfig.WeaponSlot.Melee, obj.type, 0);
                break;
            case "gun":
                {
                    amountLeft = 0;
                    removeLoot = true;

                    const freeGunSlot = this.getFreeGunSlot(obj);
                    pickupMsg.type = freeGunSlot.cause;
                    let newGunIdx = freeGunSlot.slot;

                    if (newGunIdx === null) {
                        this.pickupTicker = 0;
                        return;
                    }

                    const oldWeapDef = GameObjectDefs[this.weapons[newGunIdx].type] as
                        | GunDef
                        | undefined;
                    if (oldWeapDef && oldWeapDef.noDrop) {
                        this.pickupTicker = 0;
                        return;
                    }

                    this.pickupTicker = 0.2;

                    let gunType = obj.type;

                    if (def.dualWieldType && freeGunSlot.isDual) {
                        gunType = def.dualWieldType;
                    }

                    this.weaponManager.replaceGun(newGunIdx, gunType);

                    // if "preloaded" gun add ammo to inventory
                    if (obj.isPreloadedGun) {
                        const ammoAmount = def.ammoSpawnCount;
                        const ammoType = def.ammo;
                        const backpackLevel = this.getGearLevel(this.backpack);
                        const bagSpace = GameConfig.bagSizes[ammoType]
                            ? GameConfig.bagSizes[ammoType][backpackLevel]
                            : 0;
                        if (this.inventory[ammoType] + ammoAmount <= bagSpace) {
                            this.inventory[ammoType] += ammoAmount;
                            this.inventoryDirty = true;
                        } else {
                            // spawn new loot object to animate the pickup rejection
                            const spaceLeft = bagSpace - this.inventory[ammoType];
                            const amountToAdd = spaceLeft;
                            this.inventory[ammoType] += amountToAdd;
                            this.inventoryDirty = true;

                            const amountLeft = ammoAmount - amountToAdd;
                            this.dropLoot(ammoType, amountLeft);
                        }
                    }

                    if (
                        newGunIdx === this.curWeapIdx &&
                        this.weapons[newGunIdx].ammo <= 0
                    ) {
                        this.cancelAction();
                        this.weaponManager.scheduleReload(def.switchDelay);
                    }

                    // always select primary slot if melee or secondary is selected
                    if (
                        !freeGunSlot.isDual &&
                        (this.curWeapIdx === GameConfig.WeaponSlot.Melee ||
                            this.curWeapIdx === GameConfig.WeaponSlot.Secondary)
                    ) {
                        this.weaponManager.setCurWeapIndex(newGunIdx); // primary
                    }
                }
                break;
            case "helmet":
                if (this.hasRoleHelmet) {
                    amountLeft = 1;
                    lootToAdd = obj.type;
                    pickupMsg.type = net.PickupMsgType.BetterItemEquipped;
                    break;
                }

            case "chest":
            case "backpack":
                {
                    const objLevel = this.getGearLevel(obj.type);
                    const thisType = this[def.type];
                    const thisLevel = this.getGearLevel(thisType);
                    amountLeft = 1;

                    if (thisType === obj.type) {
                        lootToAdd = obj.type;
                        pickupMsg.type = net.PickupMsgType.AlreadyEquipped;
                    } else if (thisLevel <= objLevel) {
                        lootToAdd = thisType;
                        this[def.type] = obj.type;
                        pickupMsg.type = net.PickupMsgType.Success;
                        this.setDirty();
                    } else {
                        lootToAdd = obj.type;
                        pickupMsg.type = net.PickupMsgType.BetterItemEquipped;
                    }
                    if (this.getGearLevel(lootToAdd) === 0) lootToAdd = "";

                    if (def.type == "helmet" && def.role) {
                        this.promoteToRole(def.role);
                    }
                }
                break;
            case "outfit":
                if (this.role == "leader") {
                    amountLeft = 1;
                    pickupMsg.type = net.PickupMsgType.BetterItemEquipped;
                    break;
                }
                amountLeft = 1;
                lootToAdd = this.outfit;
                pickupMsg.type = net.PickupMsgType.Success;
                this.outfit = obj.type;

                if (def.obstacleType) {
                    if (this.obstacleOutfit) {
                        this.obstacleOutfit.destroy();
                    }

                    this.obstacleOutfit = this.game.map.genOutfitObstacle(
                        def.obstacleType,
                        this,
                    );
                }

                this.setDirty();
                break;
            case "perk":
                if (this.hasPerk(obj.type)) {
                    amountLeft = 1;
                    pickupMsg.type = net.PickupMsgType.AlreadyEquipped;
                    break;
                }

                const perkSlotType = this.perks.find((p) => p.droppable)?.type;
                if (perkSlotType) {
                    amountLeft = 1;
                    lootToAdd = perkSlotType;
                    this.removePerk(perkSlotType);
                    this.addPerk(obj.type, true);
                } else {
                    this.addPerk(obj.type, true);
                }
                this.setDirty();
                break;
        }

        const lootToAddDef = GameObjectDefs[lootToAdd] as LootDef;
        if (
            removeLoot &&
            amountLeft > 0 &&
            lootToAdd !== "" &&
            //if obj you tried picking up can't be picked up and needs to be dropped, "noDrop" is irrelevant
            (obj.type == lootToAdd || !(lootToAddDef as ChestDef).noDrop)
        ) {
            const dir = v2.neg(this.dir);
            this.game.lootBarn.addLootWithoutAmmo(
                lootToAdd,
                v2.add(obj.pos, v2.mul(dir, 0.4)),
                obj.layer,
                amountLeft,
                undefined,
                dir,
            );
        }

        if (removeLoot) {
            obj.destroy();
        }
        this.msgsToSend.push({
            type: net.MsgType.Pickup,
            msg: pickupMsg,
        });
    }

    // in original game, only called on snowball or potato collision
    dropRandomLoot(): void {
        // all possible droppable loot held by the player
        //4 categories: inventory, weapons, armor, perks
        const playerLootTypes: string[] = [];

        for (const [type, count] of Object.entries(this.inventory)) {
            if (count == 0) continue;
            if (type == "1xscope") continue;
            playerLootTypes.push(type);
        }

        for (let i = 0; i < this.weapons.length; i++) {
            if (GameConfig.WeaponType[i] == "throwable") continue;
            const weapon = this.weapons[i];
            if (!weapon.type) continue;
            if (weapon.type == "fists") continue;
            playerLootTypes.push(weapon.type);
        }

        for (let i = 0; i < this.perks.length; i++) {
            const perk = this.perks[i];
            if (!perk.droppable) continue;
            playerLootTypes.push(perk.type);
        }

        for (const armor of [this.helmet, this.chest] as const) {
            if (!armor) continue;
            if ((GameObjectDefs[armor] as ChestDef | HelmetDef).noDrop) continue;
            playerLootTypes.push(armor);
        }

        if (playerLootTypes.length == 0) return;

        const item = playerLootTypes[util.randomInt(0, playerLootTypes.length - 1)];
        const weapIdx = this.weapons.findIndex((w) => w.type == item);

        const dropMsg = new net.DropItemMsg();
        dropMsg.item = item;
        dropMsg.weapIdx = weapIdx;
        this.dropItem(dropMsg);
    }

    dropLoot(type: string, count = 1, useCountForAmmo?: boolean) {
        this.mobileDropTicker = 3;
        this.game.lootBarn.addLoot(
            type,
            this.pos,
            this.layer,
            count,
            useCountForAmmo,
            10,
            v2.neg(this.dir),
        );
    }

    dropArmor(item: string, armorDef: LootDef): boolean {
        if (armorDef.type != "chest" && armorDef.type != "helmet") return false;
        if (armorDef.noDrop) return false;
        if (!this[armorDef.type]) return false;
        this.dropLoot(item, 1);
        this[armorDef.type] = "";
        this.setDirty();
        return true;
    }

    splitUpLoot(item: string, amount: number) {
        const dropCount = Math.floor(amount / 60);
        for (let i = 0; i < dropCount; i++) {
            this.dropLoot(item, 60);
        }
        if (amount % 60 !== 0) {
            this.dropLoot(item, amount % 60);
        }
    }

    dropItem(dropMsg: net.DropItemMsg): void {
        const itemDef = GameObjectDefs[dropMsg.item] as LootDef;
        if (!itemDef) return;
        switch (itemDef.type) {
            case "ammo": {
                const inventoryCount = this.inventory[dropMsg.item];

                if (inventoryCount === 0) return;

                let amountToDrop = Math.max(1, Math.floor(inventoryCount / 2));

                if (itemDef.minStackSize && inventoryCount <= itemDef.minStackSize) {
                    amountToDrop = Math.min(itemDef.minStackSize, inventoryCount);
                } else if (inventoryCount <= 5) {
                    amountToDrop = Math.min(5, inventoryCount);
                }

                this.splitUpLoot(dropMsg.item, amountToDrop);
                this.inventory[dropMsg.item] -= amountToDrop;
                this.inventoryDirty = true;
                break;
            }
            case "scope": {
                if (itemDef.level === 1) break;
                if (!this.inventory[dropMsg.item]) return;
                const scopeLevel = `${itemDef.level}xscope`;
                const scopeIdx = SCOPE_LEVELS.indexOf(scopeLevel);

                this.dropLoot(dropMsg.item, 1);
                this.inventory[scopeLevel] = 0;

                if (this.scope === scopeLevel) {
                    for (let i = scopeIdx; i >= 0; i--) {
                        if (!this.inventory[SCOPE_LEVELS[i]]) continue;
                        this.scope = SCOPE_LEVELS[i];
                        break;
                    }
                }

                this.inventoryDirty = true;
                break;
            }
            case "chest":
            case "helmet": {
                this.dropArmor(dropMsg.item, itemDef);
                break;
            }
            case "heal":
            case "boost": {
                const inventoryCount = this.inventory[dropMsg.item];

                if (inventoryCount === 0) return;

                let amountToDrop = Math.max(1, Math.floor(inventoryCount / 2));

                this.inventory[dropMsg.item] -= amountToDrop;

                this.dropLoot(dropMsg.item, amountToDrop);
                this.inventoryDirty = true;
                break;
            }
            case "gun":
                this.weaponManager.dropGun(dropMsg.weapIdx);
                break;
            case "melee":
                this.weaponManager.dropMelee();
                break;
            case "throwable": {
                if (this.weaponManager.cookingThrowable) return;
                const inventoryCount = this.inventory[dropMsg.item];

                if (inventoryCount === 0) return;

                const amountToDrop = Math.max(1, Math.floor(inventoryCount / 2));

                this.splitUpLoot(dropMsg.item, amountToDrop);

                this.inventory[dropMsg.item] -= amountToDrop;

                if (this.inventory[dropMsg.item] == 0) {
                    this.weaponManager.showNextThrowable();
                }
                this.inventoryDirty = true;
                this.weapsDirty = true;
                break;
            }
            case "perk": {
                const perkSlotType = this.perks.find((p) => p.droppable)?.type;
                if (perkSlotType && perkSlotType == dropMsg.item) {
                    this.dropLoot(dropMsg.item);
                    this.removePerk(dropMsg.item);
                    this.setDirty();
                }
            }
        }

        const reloading = this.isReloading();
        this.cancelAction();

        if (reloading && this.weapons[this.curWeapIdx].ammo == 0) {
            this.weaponManager.tryReload();
        }
    }

    static toAllowedPotatoModeList(
        arr: [string, GunDef | MeleeDef | ThrowableDef][],
        quality = false,
    ) {
        return arr
            .filter(([_, def]) => {
                if (quality) return !def.noPotatoSwap && def.quality === 1;
                return !def.noPotatoSwap;
            })
            .map(([idString, _]) => idString);
    }
    static allowedPotatoModeWeapons = Object.freeze({
        guns: Player.toAllowedPotatoModeList(Object.entries(GunDefs)),
        guns_rare: Player.toAllowedPotatoModeList(Object.entries(GunDefs), true),
        melees: Player.toAllowedPotatoModeList(Object.entries(MeleeDefs)),
        melees_rare: Player.toAllowedPotatoModeList(Object.entries(MeleeDefs), true),
        throwables: Player.toAllowedPotatoModeList(Object.entries(ThrowableDefs)),
        throwables_rare: Player.toAllowedPotatoModeList(
            Object.entries(ThrowableDefs),
            true,
        ),
    });

    potatoModeWeaponSwitch(weaponType: string | undefined) {
        const slot = this.weapons.findIndex((w) => w.type === weaponType);

        if (slot === -1) return;

        let weapon: string | undefined;
        let ammo: number = 0;
        let isThrowable = false;

        switch (GameConfig.WeaponType[slot]) {
            case "gun":
                weapon = util.pickRandomInArr(
                    Player.allowedPotatoModeWeapons[
                        this.hasPerk("rare_potato") ? "guns_rare" : "guns"
                    ],
                );
                const gunDef = GunDefs[weapon];

                ammo = gunDef.maxClip;

                this.inventory[gunDef.ammo] = math.max(
                    this.inventory[gunDef.ammo],
                    gunDef.ammoSpawnCount - ammo,
                );
                this.inventoryDirty = true;

                break;
            case "melee":
                weapon = util.pickRandomInArr(
                    Player.allowedPotatoModeWeapons[
                        this.hasPerk("rare_potato") ? "melees_rare" : "melees"
                    ],
                );
                break;
            case "throwable":
                weapon = util.pickRandomInArr(
                    Player.allowedPotatoModeWeapons[
                        this.hasPerk("rare_potato") ? "throwables_rare" : "throwables"
                    ],
                );

                ammo = math.max(
                    this.inventory[weapon],
                    Math.ceil(
                        GameConfig.bagSizes[weapon][this.getGearLevel(this.backpack)] / 2,
                    ),
                );

                isThrowable = true;
                break;
        }

        if (weapon) {
            if (isThrowable) {
                this.inventory[weapon] = math.max(this.inventory[weapon], ammo);
            } else {
                this.weaponManager.setWeapon(slot, weapon, ammo);
            }
            const emote = new Emote(this.playerId, this.pos, "emote_loot", false);
            emote.itemType = weapon;
            this.game.playerBarn.emotes.push(emote);
            this.shootHold = false;
            this.clampInventory();
            this.inventoryDirty = true;
            this.setDirty();
        }
    }

    clampInventory() {
        for (const type of Object.keys(this.inventory)) {
            if (!GameConfig.bagSizes[type]) continue;
            this.inventory[type] = math.clamp(
                this.inventory[type],
                0,
                GameConfig.bagSizes[type][this.getGearLevel(this.backpack)],
            );
        }
    }

    isOnOtherSide(door: Obstacle): boolean {
        switch (door.ori) {
            case 0:
                return this.pos.x < door.pos.x;
            case 1:
                return this.pos.y < door.pos.y;
            case 2:
                return this.pos.x > door.pos.x;
            case 3:
                return this.pos.y > door.pos.y;
        }
        return false;
    }

    doAction(
        actionItem: string,
        actionType: number,
        duration: number,
        targetId: number = 0,
    ) {
        if (this.actionDirty) {
            // action already in progress
            return;
        }

        this.action.targetId = targetId;
        this.action.duration = duration;
        this.action.time = 0;

        this.actionDirty = true;
        this.actionItem = actionItem;
        this.actionType = actionType;
        this.actionSeq++;
        this.setDirty();
    }

    cancelAction(): void {
        if (this.actionType === GameConfig.Action.None) {
            return;
        }

        if (this.playerBeingRevived) {
            if (this.hasPerk("self_revive") && this.playerBeingRevived == this) {
                this.playerBeingRevived = undefined;
            } else {
                this.playerBeingRevived.cancelAction();
                this.playerBeingRevived = undefined;
                this.cancelAnim();
            }
        }

        this.action.duration = 0;
        this.action.targetId = 0;
        this.action.time = 0;

        this.actionItem = "";
        this.actionType = GameConfig.Action.None;
        this.actionSeq++;
        this.actionDirty = false;
        this.setDirty();
    }

    freeze(frozenOri: number, duration: number): void {
        this.frozenTicker = duration;
        this.frozen = true;
        this.frozenOri = frozenOri;
        this.setDirty();
    }

    initLastBreath(): void {
        const affectedPlayers = this.game.modeManager.getNearbyAlivePlayersContext(
            this,
            60,
        );

        for (const player of affectedPlayers) {
            player.lastBreathActive = true;
            player._lastBreathTicker = 5;

            player.scale += 0.2;
            player.giveHaste(GameConfig.HasteType.Inspire, 5);
        }
    }

    playBugle(): void {
        this.bugleTickerActive = true;
        this._bugleTicker = 8;

        const affectedPlayers = this.game.modeManager.getNearbyAlivePlayersContext(
            this,
            60,
        );

        for (const player of affectedPlayers) {
            player.giveHaste(GameConfig.HasteType.Inspire, 3);
        }
    }

    giveHaste(type: HasteType, duration: number): void {
        this.hasteType = type;
        this.hasteSeq++;
        this._hasteTicker = duration;
        this.setDirty();
    }

    playAnim(type: Anim, duration: number, cb?: () => void): void {
        this.animType = type;
        this.animSeq++;
        this.setDirty();
        this._animTicker = duration;
        this._animCb = cb;
    }

    cancelAnim(): void {
        this.animType = GameConfig.Anim.None;
        this.animSeq++;
        this._animTicker = 0;
        this.setDirty();
    }

    recalculateSpeed(): void {
        // this.speed = this.downed ? GameConfig.player.downedMoveSpeed : GameConfig.player.moveSpeed;

        if (this.actionType == GameConfig.Action.Revive) {
            if (this.action.targetId) {
                // player reviving
                this.speed = GameConfig.player.downedMoveSpeed + 2; // not specified in game config so i just estimated
            } else {
                // player being revived
                this.speed = GameConfig.player.downedRezMoveSpeed;
            }
        } else if (this.downed) {
            this.speed = GameConfig.player.downedMoveSpeed;
        } else {
            this.speed = GameConfig.player.moveSpeed;
        }

        // if melee is selected increase speed
        const weaponDef = GameObjectDefs[this.activeWeapon] as
            | GunDef
            | MeleeDef
            | ThrowableDef;
        if (!this.weaponManager.meleeAttacks.length) {
            let speedBonus = 0;
            if (this.hasPerk("small_arms") && weaponDef.type == "gun") {
                speedBonus += 1;
            }

            this.speed += weaponDef.speed.equip + speedBonus;
        }

        if (this.shotSlowdownTimer > 0 && weaponDef.speed.attack !== undefined) {
            this.speed += weaponDef.speed.attack;
        }

        // if player is on water decrease speed
        const isOnWater = this.game.map.isOnWater(this.pos, this.layer);
        if (isOnWater) this.speed -= GameConfig.player.waterSpeedPenalty;

        // increase speed when adrenaline is above 50%
        if (this.boost >= 50) {
            this.speed += GameConfig.player.boostMoveSpeed;
        }

        if (this.animType === GameConfig.Anim.Cook) {
            this.speed -= GameConfig.player.cookSpeedPenalty;
        }

        if (this.hasteType != GameConfig.HasteType.None) {
            this.speed += GameConfig.player.hasteSpeedBonus;
        }

        if (this.frozen) {
            this.speed -= GameConfig.player.frozenSpeedPenalty;
        }

        // decrease speed if shooting or popping adren or heals
        // field_medic perk doesn't slow you down while you heal
        if (
            this.shotSlowdownTimer > 0 ||
            (!this.hasPerk("field_medic") && this.actionType == GameConfig.Action.UseItem)
        ) {
            this.speed *= 0.5;
        }
    }

    sendMsg(type: number, msg: net.AbstractMsg, bytes = 128): void {
        const stream = new net.MsgStream(new ArrayBuffer(bytes));
        stream.serializeMsg(type, msg);
        this.sendData(stream.getBuffer());
    }

    sendData(buffer: ArrayBuffer | Uint8Array): void {
        this.game.sendSocketMsg(this.socketId, buffer);
    }
}
