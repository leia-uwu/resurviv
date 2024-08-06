import { GameObjectDefs, type LootDef } from "../../../../shared/defs/gameObjectDefs";
import {
    type BackpackDef,
    type BoostDef,
    type ChestDef,
    GEAR_TYPES,
    type HealDef,
    type HelmetDef,
    SCOPE_LEVELS,
    type ScopeDef
} from "../../../../shared/defs/gameObjects/gearDefs";
import type { GunDef } from "../../../../shared/defs/gameObjects/gunDefs";
import { type MeleeDef, MeleeDefs } from "../../../../shared/defs/gameObjects/meleeDefs";
import type { OutfitDef } from "../../../../shared/defs/gameObjects/outfitDefs";
import type { RoleDef } from "../../../../shared/defs/gameObjects/roleDefs";
import type { ThrowableDef } from "../../../../shared/defs/gameObjects/throwableDefs";
import { UnlockDefs } from "../../../../shared/defs/gameObjects/unlockDefs";
import { GameConfig } from "../../../../shared/gameConfig";
import * as net from "../../../../shared/net/net";
import { ObjectType } from "../../../../shared/net/objectSerializeFns";
import { type Circle, coldet } from "../../../../shared/utils/coldet";
import { collider } from "../../../../shared/utils/collider";
import { math } from "../../../../shared/utils/math";
import { assert, util } from "../../../../shared/utils/util";
import { type Vec2, v2 } from "../../../../shared/utils/v2";
import type { GameSocketData } from "../../gameServer";
import { IDAllocator } from "../../utils/IDAllocator";
import type { Game } from "../game";
import type { Group } from "../group";
import type { Team } from "../team";
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

    emotes: Emote[] = [];

    killLeaderDirty = false;
    killLeader?: Player;

    constructor(readonly game: Game) {}

    randomPlayer(player?: Player) {
        const livingPlayers = player
            ? this.livingPlayers.filter((p) => p != player)
            : this.livingPlayers;
        return livingPlayers[util.randomInt(0, livingPlayers.length - 1)];
    }

    addPlayer(socketData: GameSocketData, joinMsg: net.JoinMsg) {
        if (joinMsg.protocol !== GameConfig.protocolVersion) {
            const disconnectMsg = new net.DisconnectMsg();
            disconnectMsg.reason = "index-invalid-protocol";
            const stream = new net.MsgStream(new ArrayBuffer(128));
            stream.serializeMsg(net.MsgType.Disconnect, disconnectMsg);
            socketData.sendMsg(stream.getBuffer());
            setTimeout(() => {
                socketData.closeSocket();
            }, 1);
        }

        let team = this.game.getSmallestTeam();

        let group: Group | undefined;

        if (this.game.isTeamMode) {
            const groupData = this.game.groupDatas.find(
                (gd) => gd.hash == joinMsg.matchPriv
            )!;
            if (this.game.groups.has(groupData.hash)) {
                //group already exists
                group = this.game.groups.get(groupData.hash)!;
                team = group.players[0].team;
            } else {
                group = this.game.addGroup(groupData.hash, groupData.autoFill);
            }
        }

        const pos: Vec2 = this.game.map.getSpawnPos(group);

        const player = new Player(this.game, pos, socketData, joinMsg);

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

        this.game.logger.log(`Player ${player.name} joined`);

        socketData.player = player;
        this.newPlayers.push(player);
        this.game.objectRegister.register(player);
        this.players.push(player);
        this.livingPlayers.push(player);
        this.aliveCountDirty = true;
        this.game.pluginManager.emit("playerJoin", player);

        if (!this.game.started) {
            this.game.started = this.game.contextManager.isGameStarted();
            if (this.game.started) {
                this.game.gas.advanceGasStage();
                this.game.planeBarn.schedulePlanes();
            }
        }

        return player;
    }

    update(dt: number) {
        for (let i = 0; i < this.players.length; i++) {
            this.players[i].update(dt);
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
            //potential issue if dead teammates are still in game spectating
            if (player.group.allDeadOrDisconnected) {
                this.game.groups.delete(player.group.hash);
            }
        }

        this.game.checkGameOver();
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
}

export class Player extends BaseGameObject {
    override readonly __type = ObjectType.Player;

    bounds = collider.createAabbExtents(
        v2.create(0, 0),
        v2.create(GameConfig.player.maxVisualRadius, GameConfig.player.maxVisualRadius)
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

    _spectatorCount = 0;
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
                `Player ${player.name} tried spectate themselves (how tf did this happen?)`
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

    bleedTicker = 0;
    playerBeingRevived: Player | undefined;

    animType: number = GameConfig.Anim.None;
    animSeq = 0;
    private _animTicker = 0;
    private _animCb?: () => void;

    distSinceLastCrawl = 0;

    actionType: number = GameConfig.Action.None;
    actionSeq = 0;
    action = { time: 0, duration: 0, targetId: 0 };

    /**
     * specifically for reloading single shot guns to keep reloading until maxClip is reached
     */
    reloadAgain = false;

    wearingPan = false;
    healEffect = false;
    frozen = false;
    frozenOri = 0;

    private _hasteTicker = 0;
    hasteType: number = GameConfig.HasteType.None;
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
        this.game.sendMsg(net.MsgType.RoleAnnouncement, msg);
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
    _lastBreathTicker = 0;

    bugleTickerActive = false;
    _bugleTicker = 0;

    handleFactionModeRoles(role: string): void {
        if (this.role === role) return;

        const def = GameObjectDefs[role] as RoleDef;

        switch (role) {
            case "bugler":
                this.weaponManager.dropGun(1);
                this.weapons[1] = {
                    type: "bugle",
                    ammo: this.weaponManager.getTrueAmmoStats(
                        GameObjectDefs["bugle"] as GunDef
                    ).trueMaxClip,
                    cooldown: 0
                };
                this.weapsDirty = true;

                this.helmet = "helmet03_bugler";
                break;
            case "leader":
                break;
        }

        if (def.defaultItems) {
            for (const [key, value] of Object.entries(def.defaultItems.inventory)) {
                this.inventory[key] = value;
            }

            for (let i = 0; i < def.defaultItems.weapons.length; i++) {
                const weaponOrWeaponFunc = def.defaultItems.weapons[i];
                const trueWeapon =
                    weaponOrWeaponFunc instanceof Function
                        ? weaponOrWeaponFunc(this.teamId)
                        : weaponOrWeaponFunc;

                const gunDef = GameObjectDefs[trueWeapon.type] as GunDef;
                if (gunDef && gunDef.type == "gun") {
                    if (this.weapons[i].type) this.weaponManager.dropGun(i);

                    if (trueWeapon.fillInv) {
                        const ammoType = gunDef.ammo;
                        this.inventory[ammoType] = GameConfig.bagSizes[ammoType][3];
                    }
                }
                this.weapons[i].type = trueWeapon.type;
                this.weapons[i].ammo = trueWeapon.ammo;
            }

            this.scope = def.defaultItems.scope;
            this.helmet = def.defaultItems.helmet;
            this.chest = def.defaultItems.chest;
            this.backpack = def.defaultItems.backpack;
        }

        if (def.perks) {
            for (let i = 0; i < def.perks.length; i++) this.addPerk(def.perks[i], false);
        }
        this.role = role;
        this.setDirty();
    }

    perks: Array<{ type: string; droppable: boolean }> = [];

    perkTypes: string[] = [];

    addPerk(type: string, droppable = false) {
        this.perks.push({
            type,
            droppable
        });
        this.perkTypes.push(type);

        if (type == "leadership") {
            this.boost = 100;
            this.scale *= 1.25;
        }
    }

    removePerk(type: string): void {
        const idx = this.perks.findIndex((perk) => perk.type === type);
        this.perks.splice(idx, 1);
        this.perkTypes.splice(this.perkTypes.indexOf(type), 1);
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

    socketData: GameSocketData;

    name: string;
    isMobile: boolean;

    teamId = 1;
    groupId = 0;

    loadout = {
        heal: "heal_basic",
        boost: "boost_basic",
        emotes: GameConfig.defaultEmoteLoadout
    };

    damageTaken = 0;
    damageDealt = 0;
    kills = 0;
    timeAlive = 0;

    msgsToSend: Array<{ type: number; msg: net.Msg }> = [];

    weaponManager = new WeaponManager(this);
    recoilTicker = 0;

    constructor(game: Game, pos: Vec2, socketData: GameSocketData, joinMsg: net.JoinMsg) {
        super(game, pos);

        this.socketData = socketData;

        this.name = joinMsg.name;
        if (this.name.trim() === "") {
            this.name = "Player";
        }
        this.isMobile = joinMsg.isMobile;

        this.weapons = this.weaponManager.weapons;
        const defaultItems = GameConfig.player.defaultItems;

        /**
         * Checks if an item is present in the player's loadout
         */
        const isItemInLoadout = (item: string, category: string) => {
            if (!UnlockDefs.unlock_default.unlocks.includes(item)) return false;

            const def = GameObjectDefs[item];
            if (!def || def.type !== category) return false;

            return true;
        };

        if (isItemInLoadout(joinMsg.loadout.outfit, "outfit")) {
            this.outfit = joinMsg.loadout.outfit;
        } else {
            this.outfit = defaultItems.outfit;
        }

        if (isItemInLoadout(joinMsg.loadout.melee, "melee")) {
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

        function assertType(type: string, category: string, acceptNoItem: boolean) {
            if (!type && acceptNoItem) return;
            const def = GameObjectDefs[type];
            assert(def, `Invalid item type for ${category}: ${type}`);
            assert(
                def.type === category,
                `Invalid type ${type}, expected ${def.type} item`
            );
        }

        for (let i = 0; i < GameConfig.WeaponSlot.Count; i++) {
            const weap = defaultItems.weapons[i];
            assertType(weap.type, GameConfig.WeaponType[i], true);

            this.weapons[i] = {
                type: weap.type ?? this.weapons[i].type,
                ammo: weap.ammo ?? 0,
                cooldown: 0
            };
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

        this.scopeZoomRadius =
            GameConfig.scopeZoomRadius[this.isMobile ? "mobile" : "desktop"];

        this.zoom = this.scopeZoomRadius[this.scope];

        this.weaponManager.showNextThrowable();
    }

    visibleObjects = new Set<GameObject>();

    update(dt: number): void {
        if (this.dead) return;

        this.timeAlive += dt;

        const movement = v2.create(0, 0);

        if (this.game.startedTime >= GameConfig.player.gracePeriodTime) {
            this.posOld = v2.copy(this.pos);

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
        }

        if (this.boost > 0 && !this.hasPerk("leadership")) {
            this.boost -= 0.375 * dt;
        }
        if (this.boost > 0 && this.boost <= 25) this.health += 0.5 * dt;
        else if (this.boost > 25 && this.boost <= 50) this.health += 1.25 * dt;
        else if (this.boost > 50 && this.boost <= 87.5) this.health += 1.5 * dt;
        else if (this.boost > 87.5 && this.boost <= 100) this.health += 1.75 * dt;

        if (this.game.isTeamMode && this.actionType == GameConfig.Action.Revive) {
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
                this.damage({
                    amount: this.game.map.mapDef.gameConfig.bleedDamage,
                    damageType: GameConfig.DamageType.Bleeding,
                    dir: this.dir
                });
                this.bleedTicker = 0;
            }
        }

        if (this.game.gas.doDamage && this.game.gas.isInGas(this.pos)) {
            this.damage({
                amount: this.game.gas.damage,
                damageType: GameConfig.DamageType.Gas,
                dir: this.dir
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
                net.Constants.ActionMaxDuration
            );

            if (this.action.time >= this.action.duration) {
                if (this.actionType === GameConfig.Action.UseItem) {
                    const itemDef = GameObjectDefs[this.actionItem] as HealDef | BoostDef;
                    if ("heal" in itemDef) this.health += itemDef.heal;
                    if ("boost" in itemDef) this.boost += itemDef.boost;
                    this.inventory[this.actionItem]--;
                    this.inventoryDirty = true;
                } else if (this.isReloading()) {
                    this.weaponManager.reload();
                } else if (
                    this.actionType === GameConfig.Action.Revive &&
                    this.playerBeingRevived
                ) {
                    // player who got revived
                    this.playerBeingRevived.downed = false;
                    this.playerBeingRevived.health = GameConfig.player.reviveHealth;
                    this.playerBeingRevived.setDirty();
                    this.playerBeingRevived.setGroupStatuses();
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

        if (this.hasteType != GameConfig.HasteType.None) {
            this._hasteTicker -= dt;

            if (this._hasteTicker <= 0) {
                this.hasteType = GameConfig.HasteType.None;
                this._hasteTicker = 0;
                this.hasteSeq++;
                this.setDirty();
            }
        }

        if (this.lastBreathActive) {
            this._lastBreathTicker -= dt;

            if (this._lastBreathTicker <= 0) {
                this.lastBreathActive = false;
                this._lastBreathTicker = 0;

                this.scale -= 0.2;
            }
        }

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
                            GameObjectDefs["bugle"] as GunDef
                        ).trueMaxClip
                    ) {
                        this.bugleTickerActive = true;
                        this._bugleTicker = 8;
                    }
                }
                this.weapsDirty = true;
            }
        }

        if (this.game.isTeamMode) {
            this.playerStatusTicker += dt;
            for (const spectator of this.spectators) {
                spectator.playerStatusTicker += dt;
            }
        }

        this.recalculateSpeed();
        this.moveVel = v2.mul(movement, this.speed);

        v2.set(this.pos, v2.add(this.pos, v2.mul(movement, this.speed * dt)));
        let objs!: GameObject[];

        for (let i = 0, collided = true; i < 5 && collided; i++) {
            objs = this.game.grid.intersectCollider(this.collider);
            collided = false;

            for (let j = 0; j < objs.length; j++) {
                const obj = objs[j];
                if (
                    obj.__type === ObjectType.Obstacle &&
                    obj.collidable &&
                    util.sameLayer(obj.layer, this.layer) &&
                    !obj.dead
                ) {
                    const collision = collider.intersectCircle(
                        obj.collider,
                        this.pos,
                        this.rad
                    );
                    if (collision) {
                        v2.set(
                            this.pos,
                            v2.add(this.pos, v2.mul(collision.dir, collision.pen + 0.001))
                        );
                        collided = true;
                        break;
                    }
                }
            }
        }

        const scopeZoom = this.scopeZoomRadius[this.scope];
        let finalZoom = this.scopeZoomRadius["1xscope"];
        let onSmoke = false;
        let collidesWithZoomOut = false;

        let layer = this.layer > 2 ? 0 : this.layer;

        for (let i = 0; i < objs.length; i++) {
            const obj = objs[i];
            if (obj.__type === ObjectType.Building) {
                if (!util.sameLayer(layer, obj.layer)) continue;

                if (obj.healRegions) {
                    const healRegion = obj.healRegions.find((hr) => {
                        return coldet.testCircleAabb(
                            this.pos,
                            this.rad,
                            hr.collision.min,
                            hr.collision.max
                        );
                    });

                    if (healRegion && !this.game.gas.isInGas(this.pos)) {
                        this.health += healRegion.healRate * dt;
                    }
                }

                if (obj.ceilingDead) continue;

                for (let i = 0; i < obj.zoomRegions.length; i++) {
                    const zoomRegion = obj.zoomRegions[i];

                    if (zoomRegion.zoomIn) {
                        if (
                            coldet.testCircleAabb(
                                this.pos,
                                this.rad,
                                zoomRegion.zoomIn.min,
                                zoomRegion.zoomIn.max
                            )
                        ) {
                            this.indoors = true;
                            finalZoom = zoomRegion.zoom ? zoomRegion.zoom : finalZoom;
                        }
                    }

                    if (zoomRegion.zoomOut && this.indoors) {
                        if (
                            coldet.testCircleAabb(
                                this.pos,
                                this.rad,
                                zoomRegion.zoomOut.min,
                                zoomRegion.zoomOut.max
                            )
                        ) {
                            collidesWithZoomOut = true;
                        }
                    }
                }
            } else if (obj.__type === ObjectType.Obstacle) {
                if (!util.sameLayer(this.layer, obj.layer)) continue;
                if (!(obj.isDoor && obj.door.autoOpen)) continue;

                const res = collider.intersectCircle(
                    obj.collider,
                    this.pos,
                    this.rad + obj.interactionRad
                );
                if (res) {
                    obj.interact(this, true);
                }
            } else if (obj.__type === ObjectType.Smoke) {
                if (coldet.testCircleCircle(this.pos, this.rad, obj.pos, obj.rad)) {
                    onSmoke = true;
                }
            }
        }

        this.zoom = this.indoors ? finalZoom : scopeZoom;
        if (onSmoke || (this.downed && !GameConfig.player.keepZoomWhileDowned))
            this.zoom = this.scopeZoomRadius["1xscope"];
        if (!collidesWithZoomOut) this.indoors = false;

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

        this.game.map.clampToMapBounds(this.pos, this.rad);

        if (!v2.eq(this.pos, this.posOld)) {
            this.setPartDirty();
            this.game.grid.updateObject(this);
        }

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
            this.game.contextManager.updateAliveCounts(aliveMsg.teamAliveCounts);
            msgStream.serializeMsg(net.MsgType.AliveCounts, aliveMsg);
        }

        const updateMsg = new net.UpdateMsg();

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
                spectatorCount: player.spectatorCount
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

        if (player.group) {
            if (
                player.playerStatusDirty ||
                this.playerStatusTicker >
                    net.getPlayerStatusUpdateRate(this.game.map.factionMode)
            ) {
                const players = this.game.contextManager.getPlayerStatusPlayers(player)!;
                for (let i = 0; i < players.length; i++) {
                    const p = players[i];
                    updateMsg.playerStatus.players.push({
                        hasData: p.playerStatusDirty,
                        pos: p.pos,
                        visible: true,
                        dead: p.dead,
                        downed: p.downed,
                        role: p.role
                    });
                }
                updateMsg.playerStatusDirty = true;
                this.playerStatusTicker = 0;
            }
        }

        if (player.groupStatusDirty) {
            const teamPlayers = player.group!.players;
            for (const p of teamPlayers) {
                updateMsg.groupStatus.players.push({
                    health: p.health,
                    disconnected: p.disconnected
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
                if (
                    ((emote.isPing || emote.itemType) &&
                        emotePlayer.groupId === this.groupId) ||
                    (this.visibleObjects.has(emotePlayer) && !emote.isPing)
                ) {
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
                    this.pos,
                    extendedRadius
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
                updateMsg.explosions.length
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

    /** incremented when next, decremented when prev, when it reaches this.spectating.team.getAlivePlayers().length-1, switch to next team */
    enemyTeamCycleCount = 0;

    /**
     * the main purpose of this function is to asynchronously set "spectating"
     * so there can be an if statement inside the update() func that handles the rest of the logic syncrhonously
     */
    spectate(spectateMsg: net.SpectateMsg): void {
        let playerToSpec: Player | undefined;
        const spectatablePlayers = this.game.playerBarn.livingPlayers;
        if (!this.game.isTeamMode) {
            // solos
            if (spectateMsg.specBegin) {
                playerToSpec =
                    this.killedBy && this.killedBy != this
                        ? this.killedBy
                        : this.game.playerBarn.randomPlayer(this);
            } else if (spectateMsg.specNext && this.spectating) {
                const playerBeingSpecIndex = spectatablePlayers.indexOf(this.spectating);
                const newIndex = (playerBeingSpecIndex + 1) % spectatablePlayers.length;
                playerToSpec = spectatablePlayers[newIndex];
            } else if (spectateMsg.specPrev && this.spectating) {
                const playerBeingSpecIndex = spectatablePlayers.indexOf(this.spectating);
                const newIndex =
                    playerBeingSpecIndex == 0
                        ? spectatablePlayers.length - 1
                        : playerBeingSpecIndex - 1;
                playerToSpec = spectatablePlayers[newIndex];
            }
        } else if (this.group) {
            if (!this.group.checkAllDeadOrDisconnected(this)) {
                // team still alive
                if (spectateMsg.specBegin) {
                    playerToSpec = this.group.randomPlayer(this);
                } else if (spectateMsg.specNext && this.spectating) {
                    playerToSpec = this.group.nextPlayer(this.spectating);
                } else if (spectateMsg.specPrev && this.spectating) {
                    playerToSpec = this.group.prevPlayer(this.spectating);
                }
            } else {
                // team dead
                let specType: Group["prevPlayer"] | Group["nextPlayer"] | undefined;
                if (spectateMsg.specBegin) {
                    playerToSpec =
                        this.killedBy && this.killedBy != this
                            ? this.killedBy
                            : this.game.playerBarn.randomPlayer(this);
                } else if (spectateMsg.specNext && this.spectating) {
                    specType = this.spectating.group!.nextPlayer.bind(
                        this.spectating.group
                    );
                    this.enemyTeamCycleCount++;
                } else if (spectateMsg.specPrev && this.spectating) {
                    specType = this.spectating.group!.prevPlayer.bind(
                        this.spectating.group
                    );
                    this.enemyTeamCycleCount--;
                }

                if (this.spectating) {
                    if (
                        this.enemyTeamCycleCount >=
                        this.spectating.group!.getAlivePlayers().length
                    ) {
                        playerToSpec = this.game
                            .nextTeam(this.spectating.group!)
                            .randomPlayer(this);
                        this.enemyTeamCycleCount = 0;
                    } else if (
                        Math.abs(this.enemyTeamCycleCount) >=
                        this.spectating.group!.getAlivePlayers().length
                    ) {
                        playerToSpec = this.game
                            .prevTeam(this.spectating.group!)
                            .randomPlayer(this);
                        this.enemyTeamCycleCount = 0;
                    } else if (specType) {
                        playerToSpec = specType(this.spectating);
                    }
                }
            }
        }
        this.spectating = playerToSpec;
    }

    damage(params: DamageParams) {
        if (this._health < 0) this._health = 0;
        if (this.dead) return;

        const sourceIsPlayer = params.source?.__type === ObjectType.Player;

        // teammates can't deal damage to each other
        if (sourceIsPlayer && params.source !== this) {
            if ((params.source as Player).groupId === this.groupId) {
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
            let isHeadShot = false;

            const gameSourceDef = GameObjectDefs[params.gameSourceType ?? ""];

            if (gameSourceDef && "headshotMult" in gameSourceDef) {
                const headshotBlacklist = GameConfig.gun.headshotBlacklist;
                isHeadShot =
                    !(headshotBlacklist.length == 1 && headshotBlacklist[0] == "all") &&
                    !headshotBlacklist.includes(params.gameSourceType ?? "") &&
                    gameSourceDef.headshotMult > 1 &&
                    Math.random() < 0.15;

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
            if (!this.game.isTeamMode) {
                // solos
                this.kill(params);
                return;
            }

            // Teams
            const group = this.group!;

            // TODO: fix for faction mode
            if (this.downed) {
                const finishedByTeammate =
                    this.downedBy &&
                    sourceIsPlayer &&
                    this.downedBy.groupId === (params.source as Player).groupId;

                const bledOut =
                    this.downedBy && params.damageType == GameConfig.DamageType.Bleeding;

                if (finishedByTeammate || bledOut) {
                    params.source = this.downedBy;
                }

                this.kill(params);
                return;
            }

            const allDeadOrDisconnected = group.checkAllDeadOrDisconnected(this);
            const allDowned = group.checkAllDowned(this);

            if (allDeadOrDisconnected || allDowned) {
                group.allDeadOrDisconnected = true; // must set before any kill() calls so the gameovermsgs are accurate
                this.kill(params);
                if (allDowned) {
                    group.killAllTeammates();
                }
            } else {
                this.down(params);
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

        const aliveCount = this.game.contextManager.aliveCount();

        if (this.game.contextManager.showStatsMsg(targetPlayer)) {
            for (const stat of stats) {
                const statsMsg = new net.PlayerStatsMsg();
                statsMsg.playerStats = stat;

                this.msgsToSend.push({ type: net.MsgType.PlayerStats, msg: statsMsg });

                for (const spectator of this.spectators) {
                    spectator.msgsToSend.push({
                        type: net.MsgType.PlayerStats,
                        msg: statsMsg
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
                    msg: gameOverMsg
                });
            }
        }
    }

    downedBy: Player | undefined;
    /** downs a player */
    down(params: DamageParams): void {
        this.downed = true;
        this.boost = 0;
        this.health = 100;
        this.animType = 0;
        this.setDirty();

        this.shootStart = false;
        this.shootHold = false;
        this.cancelAction();

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

        this.game.sendMsg(net.MsgType.Kill, downedMsg);
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
                this.game.isTeamGameOver() &&
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
        this.actionType = 0;
        this.hasteType = 0;
        this.animType = 0;
        this.setDirty();

        this.shootHold = false;

        this.game.playerBarn.aliveCountDirty = true;
        this.game.playerBarn.livingPlayers.splice(
            this.game.playerBarn.livingPlayers.indexOf(this),
            1
        );
        if (this.group) {
            this.group.checkPlayers();
        }
        if (this.team) {
            this.team.livingPlayers.splice(this.team.livingPlayers.indexOf(this), 1);
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

                if (this.game.map.mapDef.gameMode.killLeaderEnabled) {
                    const killLeader = this.game.playerBarn.killLeader;
                    if (
                        source.kills >= GameConfig.player.killLeaderMinKills &&
                        source.kills > (killLeader?.kills ?? 0)
                    ) {
                        if (killLeader) {
                            killLeader.role = "";
                        }
                        source.promoteToRole("kill_leader");
                    }
                    if (source.isKillLeader) {
                        this.game.playerBarn.killLeaderDirty = true;
                    }
                }
            }

            killMsg.killerId = source.__id;
            killMsg.killCreditId = source.__id;
            killMsg.killerKills = source.kills;

            if (source.hasPerk("takedown")) {
                source.health += 25;
                source.boost += 25;
                source.giveHaste(GameConfig.HasteType.Takedown, 3);
            }
        }

        if (this.hasPerk("final_bugle")) {
            this.initLastBreath();
        }

        this.game.sendMsg(net.MsgType.Kill, killMsg);

        if (this.role && this.role !== "kill_leader") {
            const roleMsg = new net.RoleAnnouncementMsg();
            roleMsg.role = this.role;
            roleMsg.assigned = false;
            roleMsg.killed = true;
            roleMsg.playerId = this.__id;
            roleMsg.killerId = params.source?.__id ?? 0;
            this.game.sendMsg(net.MsgType.RoleAnnouncement, roleMsg);
        }
        if (this.isKillLeader) {
            this.game.playerBarn.killLeader = undefined;
            this.game.playerBarn.killLeaderDirty = true;
            this.isKillLeader = false;

            const roleMsg = new net.RoleAnnouncementMsg();
            roleMsg.role = "kill_leader";
            roleMsg.assigned = false;
            roleMsg.killed = true;
            roleMsg.playerId = this.__id;
            roleMsg.killerId = params.source?.__id ?? 0;
            this.game.sendMsg(net.MsgType.RoleAnnouncement, roleMsg);

            const newKillLeader = this.game.playerBarn.livingPlayers
                .filter((p) => p.kills >= GameConfig.player.killLeaderMinKills)
                .sort((a, b) => a.kills - b.kills)[0];
            if (newKillLeader) {
                newKillLeader.promoteToRole("kill_leader");
            }
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
        // drop loot
        //

        for (let i = 0; i < GameConfig.WeaponSlot.Count; i++) {
            const weap = this.weapons[i];
            if (!weap.type) continue;
            const def = GameObjectDefs[weap.type];
            switch (def.type) {
                case "gun":
                    this.weaponManager.dropGun(i);
                    break;
                case "melee":
                    if (def.noDropOnDeath || weap.type === "fists") break;
                    this.game.lootBarn.addLoot(weap.type, this.pos, this.layer, 1);
                    break;
            }
        }

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
                    this.inventory[item]
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
            if (!def.noDropOnDeath) {
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
                    false
                )
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
                    obj.goreRegion.max
                )
            ) {
                obj.onGoreRegionKill();
            }
        }

        // Check for game over
        this.game.checkGameOver();
    }

    isReloading() {
        return (
            this.actionType == GameConfig.Action.Reload ||
            this.actionType == GameConfig.Action.ReloadAlt
        );
    }

    /** returns player to revive if can revive */
    canRevive(): Player | undefined {
        if (this.actionType != GameConfig.Action.None) {
            // action in progress
            return;
        }
        if (!this.game.isTeamMode) {
            // can only revive in teams modes
            return;
        }

        const downedTeammates = this.group!.getAliveTeammates(this).filter(
            (t) => t.downed
        );

        let playerToRevive: Player | undefined;
        let closestDist = Number.MAX_VALUE;
        for (const teammate of downedTeammates) {
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
        playerToRevive.doAction(
            "",
            GameConfig.Action.Revive,
            GameConfig.player.reviveDuration
        );
        this.doAction(
            "",
            GameConfig.Action.Revive,
            GameConfig.player.reviveDuration,
            playerToRevive.__id
        );
        this.playAnim(GameConfig.Anim.Revive, GameConfig.player.reviveDuration);
    }

    useHealingItem(item: string): void {
        const itemDef = GameObjectDefs[item];
        if (itemDef.type !== "heal") {
            throw new Error(`Invalid heal item ${item}`);
        }
        if (
            this.health == itemDef.maxHeal ||
            this.actionType == GameConfig.Action.UseItem
        ) {
            return;
        }
        if (!this.inventory[item]) {
            return;
        }

        this.cancelAction();
        this.doAction(item, GameConfig.Action.UseItem, itemDef.useTime);
    }

    useBoostItem(item: string): void {
        const itemDef = GameObjectDefs[item];
        if (itemDef.type !== "boost") {
            throw new Error(`Invalid boost item ${item}`);
        }

        if (this.actionType == GameConfig.Action.UseItem) {
            return;
        }
        if (!this.inventory[item]) {
            return;
        }

        this.cancelAction();
        this.doAction(item, GameConfig.Action.UseItem, itemDef.useTime);
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

    handleInput(msg: net.InputMsg): void {
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

        if (this.downed) {
            // return over here since player is still allowed to move and look around, just can't do anything else
            return;
        }

        for (let i = 0; i < msg.inputs.length; i++) {
            const input = msg.inputs[i];
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
                        this.weaponManager.showNextThrowable();
                    } else {
                        this.weaponManager.setCurWeapIndex(
                            GameConfig.WeaponSlot.Throwable
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
                                : GameConfig.WeaponSlot.Melee
                        );
                    } else if (
                        this.curWeapIdx == GameConfig.WeaponSlot.Melee &&
                        (this.weapons[GameConfig.WeaponSlot.Primary].type ||
                            this.weapons[GameConfig.WeaponSlot.Secondary].type)
                    ) {
                        this.weaponManager.setCurWeapIndex(
                            +!this.weapons[GameConfig.WeaponSlot.Primary].type
                        );
                    } else if (this.curWeapIdx == GameConfig.WeaponSlot.Throwable) {
                        const bothSlotsEmpty =
                            !this.weapons[GameConfig.WeaponSlot.Primary].type &&
                            !this.weapons[GameConfig.WeaponSlot.Secondary].type;
                        if (bothSlotsEmpty) {
                            this.weaponManager.setCurWeapIndex(
                                GameConfig.WeaponSlot.Melee
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
                    const obstacle = this.getClosestObstacle();
                    const playerToRevive = this.canRevive();

                    const interactables = [loot, obstacle, playerToRevive];

                    for (let i = 0; i < interactables.length; i++) {
                        const interactable = interactables[i];
                        if (!interactable) continue;
                        if (interactable.__type === ObjectType.Player) {
                            this.revive(playerToRevive);
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
                    const obstacle = this.getClosestObstacle();
                    if (obstacle) obstacle.interact(this);
                    break;
                }
                case GameConfig.Input.Reload:
                    this.weaponManager.tryReload();
                    break;
                case GameConfig.Input.UseBandage:
                    this.useHealingItem("bandage");
                    break;
                case GameConfig.Input.UseHealthKit:
                    this.useHealingItem("healthkit");
                    break;
                case GameConfig.Input.UsePainkiller:
                    this.useBoostItem("soda");
                    break;
                case GameConfig.Input.UseSoda:
                    this.useBoostItem("painkiller");
                    break;
                case GameConfig.Input.Cancel:
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
                        ...this.weapons[GameConfig.WeaponSlot.Primary]
                    };
                    const secondary = {
                        ...this.weapons[GameConfig.WeaponSlot.Secondary]
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
                            false
                        );
                    } else {
                        this.weapsDirty = true;
                    }
                    break;
                }
                case GameConfig.Input.Revive: {
                    const playerToRevive = this.canRevive();
                    this.revive(playerToRevive);
                }
            }
        }

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
            collider.createCircle(this.pos, this.rad + 5)
        );

        let closestLoot: Loot | undefined;
        let closestDist = Number.MAX_VALUE;

        for (let i = 0; i < objs.length; i++) {
            const loot = objs[i];
            if (loot.__type !== ObjectType.Loot) continue;
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

    getClosestObstacle(): Obstacle | undefined {
        const objs = this.game.grid.intersectCollider(
            collider.createCircle(this.pos, this.rad + 5)
        );

        let closestObj: Obstacle | undefined;
        let closestPen = 0;

        for (let i = 0; i < objs.length; i++) {
            const obstacle = objs[i];
            if (obstacle.__type !== ObjectType.Obstacle) continue;
            if (!obstacle.dead && util.sameLayer(obstacle.layer, this.layer)) {
                if (obstacle.interactionRad > 0) {
                    const res = collider.intersectCircle(
                        obstacle.collider,
                        this.pos,
                        obstacle.interactionRad + this.rad
                    );
                    if (res && res.pen >= closestPen) {
                        closestObj = obstacle;
                        closestPen = res.pen;
                    }
                }
            }
        }
        return closestObj;
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
        let availSlot = -1;
        let cause = net.PickupMsgType.Success;
        let indexOf = -1;
        let isDualWield = false;
        const gunSlots = [GameConfig.WeaponSlot.Primary, GameConfig.WeaponSlot.Secondary];
        for (const slot of gunSlots) {
            const slotDef = GameObjectDefs[this.weapons[slot].type] as GunDef | undefined;
            const dualWield =
                slotDef?.dualWieldType && obj.type === this.weapons[slot].type;
            if (this.weapons[slot].type === obj.type) {
                indexOf = slot;
            }
            if (this.weapons[slot].type === "" || dualWield) {
                availSlot = slot;
                isDualWield = dualWield || false;
                break;
            }
            if (
                this.weapons[slot].type === obj.type &&
                !dualWield &&
                (slot as number) == gunSlots.length - 1
            ) {
                cause = net.PickupMsgType.AlreadyOwned;
                break;
            }
        }
        return {
            availSlot,
            isDualWield,
            cause,
            indexOf
        };
    }

    pickupLoot(obj: Loot) {
        if (obj.destroyed) return;
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
                                if (throwableList.includes(obj.type)) {
                                    // fill empty slot with throwable, otherwise just add to inv
                                    if (this.inventory[obj.type] == 0) {
                                        this.weapons[
                                            GameConfig.WeaponSlot.Throwable
                                        ].type = obj.type;
                                        this.weapsDirty = true;
                                        this.setDirty();
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
                                this.weapons[GameConfig.WeaponSlot.Throwable].type =
                                    obj.type;
                                this.weapsDirty = true;
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
                this.weapons[GameConfig.WeaponSlot.Melee].type = obj.type;
                this.weapsDirty = true;
                if (this.curWeapIdx === GameConfig.WeaponSlot.Melee) this.setDirty();
                break;
            case "gun":
                {
                    amountLeft = 0;
                    removeLoot = true;

                    const freeGunSlot = this.getFreeGunSlot(obj);
                    pickupMsg.type = freeGunSlot.cause;
                    let newGunIdx = freeGunSlot.availSlot;

                    if (freeGunSlot.availSlot == -1) {
                        newGunIdx = this.curWeapIdx;
                        if (
                            this.curWeapIdx in
                                [
                                    GameConfig.WeaponSlot.Primary,
                                    GameConfig.WeaponSlot.Secondary
                                ] &&
                            obj.type != this.weapons[this.curWeapIdx].type
                        ) {
                            const gunToDropDef = GameObjectDefs[
                                this.activeWeapon
                            ] as GunDef;
                            if (gunToDropDef.noDrop) return;

                            this.weaponManager.dropGun(this.curWeapIdx, false);
                            this.weapons[this.curWeapIdx].type = obj.type;
                            this.cancelAction();
                            this.weaponManager.tryReload();
                            this.weapsDirty = true;
                        } else {
                            removeLoot = false;
                            pickupMsg.type = net.PickupMsgType.Full;
                        }
                    } else if (freeGunSlot.isDualWield) {
                        this.weapons[freeGunSlot.availSlot].type = def.dualWieldType!;
                        this.weapsDirty = true;
                        if (
                            freeGunSlot.availSlot === this.curWeapIdx &&
                            this.isReloading()
                        ) {
                            this.cancelAction();
                            if (!this.weapons[freeGunSlot.availSlot].ammo) {
                                this.weaponManager.tryReload();
                            }
                        }
                    } else {
                        this.weapons[freeGunSlot.availSlot].type = obj.type;
                        this.weapsDirty = true;
                    }

                    // always select primary slot if melee or secondary is selected
                    if (
                        this.curWeapIdx === GameConfig.WeaponSlot.Melee ||
                        this.curWeapIdx === GameConfig.WeaponSlot.Secondary
                    ) {
                        this.weaponManager.setCurWeapIndex(newGunIdx); // primary
                    }

                    this.setDirty();
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
                }
                break;
            case "outfit":
                amountLeft = 1;
                lootToAdd = this.outfit;
                pickupMsg.type = net.PickupMsgType.Success;
                this.outfit = obj.type;
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
            !(lootToAddDef as ChestDef).noDrop
        ) {
            const angle = Math.atan2(this.dir.y, this.dir.x);
            const invertedAngle = (angle + Math.PI) % (2 * Math.PI);
            const newPos = v2.add(
                obj.pos,
                v2.create(0.4 * Math.cos(invertedAngle), 0.4 * Math.sin(invertedAngle))
            );
            this.game.lootBarn.addLootWithoutAmmo(
                lootToAdd,
                newPos,
                obj.layer,
                amountLeft
            );
        }

        if (removeLoot) {
            obj.destroy();
        }
        this.msgsToSend.push({
            type: net.MsgType.Pickup,
            msg: pickupMsg
        });
    }

    dropItem(dropMsg: net.DropItemMsg): void {
        const itemDef = GameObjectDefs[dropMsg.item] as LootDef;
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

                this.game.lootBarn.splitUpLoot(
                    this,
                    dropMsg.item,
                    amountToDrop,
                    this.dir
                );
                this.inventory[dropMsg.item] -= amountToDrop;
                this.inventoryDirty = true;
                break;
            }
            case "scope": {
                if (itemDef.level === 1) break;
                if (!this.inventory[dropMsg.item]) return;
                const scopeLevel = `${itemDef.level}xscope`;
                const scopeIdx = SCOPE_LEVELS.indexOf(scopeLevel);

                this.game.lootBarn.addLoot(
                    dropMsg.item,
                    this.pos,
                    this.layer,
                    1,
                    undefined,
                    -4,
                    this.dir
                );
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
                if (itemDef.noDrop) return;
                if (!this[itemDef.type]) return;
                this.game.lootBarn.addLoot(
                    dropMsg.item,
                    this.pos,
                    this.layer,
                    1,
                    undefined,
                    -4,
                    this.dir
                );
                this[itemDef.type] = "";
                this.setDirty();
                break;
            }
            case "heal":
            case "boost": {
                const inventoryCount = this.inventory[dropMsg.item];

                if (inventoryCount === 0) return;

                let amountToDrop = Math.max(1, Math.floor(inventoryCount / 2));

                this.inventory[dropMsg.item] -= amountToDrop;

                this.game.lootBarn.addLoot(
                    dropMsg.item,
                    this.pos,
                    this.layer,
                    amountToDrop,
                    undefined,
                    -4,
                    this.dir
                );
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
                const inventoryCount = this.inventory[dropMsg.item];

                if (inventoryCount === 0) return;

                const amountToDrop = Math.max(1, Math.floor(inventoryCount / 2));

                this.game.lootBarn.splitUpLoot(
                    this,
                    dropMsg.item,
                    amountToDrop,
                    this.dir
                );

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
                    this.game.lootBarn.addLoot(dropMsg.item, this.pos, this.layer, 1);
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
        targetId: number = 0
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
            this.playerBeingRevived.cancelAction();
            this.playerBeingRevived = undefined;
            this.cancelAnim();
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

    initLastBreath(): void {
        for (const obj of this.visibleObjects) {
            //includes self
            if (
                obj.__type != ObjectType.Player ||
                obj == this ||
                obj.groupId != this.groupId
            )
                continue;

            obj.lastBreathActive = true;
            obj._lastBreathTicker = 5;

            obj.scale += 0.2;
            obj.giveHaste(GameConfig.HasteType.Inspire, 5);
        }
    }

    playBugle(): void {
        if (!this.group) return;
        this.bugleTickerActive = true;
        this._bugleTicker = 8;

        for (const groupPlayer of this.group.getAlivePlayers()) {
            //includes self
            if (v2.distance(this.pos, groupPlayer.pos) <= 60) {
                groupPlayer.giveHaste(GameConfig.HasteType.Inspire, 3);
            }
        }
    }

    giveHaste(type: number, duration: number): void {
        this.hasteType = type;
        this.hasteSeq++;
        this._hasteTicker = duration;
        this.setDirty();
    }

    playAnim(type: number, duration: number, cb?: () => void): void {
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
        if (weaponDef.speed.equip && !this.weaponManager.meleeAttacks.length) {
            this.speed += weaponDef.speed.equip;
        }

        const customShootingSpeed =
            GameConfig.gun.customShootingSpeed[(weaponDef as GunDef).fireMode];
        if (this.shotSlowdownTimer > 0 && weaponDef.speed.attack !== undefined) {
            this.speed += customShootingSpeed ?? weaponDef.speed.attack;
        }

        // if player is on water decrease speed
        const isOnWater =
            this.game.map.getGroundSurface(this.pos, this.layer).type === "water";
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

        // decrease speed if shooting or popping adren or heals
        // field_medic perk doesn't slow you down while you heal
        if (
            (this.shotSlowdownTimer > 0 && !customShootingSpeed) ||
            (!this.hasPerk("field_medic") && this.actionType == GameConfig.Action.UseItem)
        ) {
            this.speed *= 0.5;
        }
    }

    sendMsg(type: number, msg: any, bytes = 128): void {
        const stream = new net.MsgStream(new ArrayBuffer(bytes));
        stream.serializeMsg(type, msg);
        this.sendData(stream.getBuffer());
    }

    sendData(buffer: ArrayBuffer | Uint8Array): void {
        try {
            this.socketData.sendMsg(buffer);
        } catch (e) {
            this.game.logger.warn("Error sending packet. Details:", e);
        }
    }
}
