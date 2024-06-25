import { GameConfig } from "../gameConfig";
import { AbstractMsg, type BitStream, Constants } from "../net";
import {
    ObjectSerializeFns,
    type ObjectType,
    type ObjectsFullData,
    type ObjectsPartialData
} from "../utils/objectSerializeFns";
import { type Vec2, v2 } from "./../utils/v2";

function serializeActivePlayer(s: BitStream, data: LocalDataWithDirty) {
    s.writeBoolean(data.healthDirty);
    if (data.healthDirty) s.writeFloat(data.health, 0, 100, 8);

    s.writeBoolean(data.boostDirty);
    if (data.boostDirty) s.writeFloat(data.boost, 0, 100, 8);

    s.writeBoolean(data.zoomDirty);
    if (data.zoomDirty) s.writeUint8(data.zoom);

    s.writeBoolean(data.actionDirty);
    if (data.actionDirty) {
        s.writeFloat(data.action.time, 0, Constants.ActionMaxDuration, 8);
        s.writeFloat(data.action.duration, 0, Constants.ActionMaxDuration, 8);
        s.writeUint16(data.action.targetId);
    }

    s.writeBoolean(data.inventoryDirty);
    if (data.inventoryDirty) {
        s.writeGameType(data.scope);
        for (const key of Object.keys(GameConfig.bagSizes)) {
            const hasItem = data.inventory[key] > 0;
            s.writeBoolean(hasItem);
            if (hasItem) s.writeBits(data.inventory[key], 9);
        }
    }

    s.writeBoolean(data.weapsDirty);
    if (data.weapsDirty) {
        s.writeBits(data.curWeapIdx, 2);
        for (let i = 0; i < GameConfig.WeaponSlot.Count; i++) {
            s.writeGameType(data.weapons[i].type);
            s.writeUint8(data.weapons[i].ammo);
        }
    }

    s.writeBoolean(data.spectatorCountDirty);
    if (data.spectatorCountDirty) {
        s.writeUint8(data.spectatorCount);
    }

    s.writeAlignToNextByte();
}

function deserializeActivePlayer(s: BitStream, data: LocalDataWithDirty) {
    data.healthDirty = s.readBoolean();
    if (data.healthDirty) {
        data.health = s.readFloat(0, 100, 8);
    }
    data.boostDirty = s.readBoolean();
    if (data.boostDirty) {
        data.boost = s.readFloat(0, 100, 8);
    }
    data.zoomDirty = s.readBoolean();
    if (data.zoomDirty) {
        data.zoom = s.readUint8();
    }
    data.actionDirty = s.readBoolean();
    if (data.actionDirty) {
        data.action = {} as Action;
        data.action.time = s.readFloat(0, Constants.ActionMaxDuration, 8);
        data.action.duration = s.readFloat(0, Constants.ActionMaxDuration, 8);
        data.action.targetId = s.readUint16();
    }
    data.inventoryDirty = s.readBoolean();
    if (data.inventoryDirty) {
        data.scope = s.readGameType();
        data.inventory = {};
        const inventoryKeys = Object.keys(GameConfig.bagSizes);
        for (let i = 0; i < inventoryKeys.length; i++) {
            const item = inventoryKeys[i];
            let count = 0;
            if (s.readBoolean()) {
                count = s.readBits(9);
            }
            data.inventory[item] = count;
        }
    }
    data.weapsDirty = s.readBoolean();
    if (data.weapsDirty) {
        data.curWeapIdx = s.readBits(2);
        data.weapons = [];
        for (let i = 0; i < GameConfig.WeaponSlot.Count; i++) {
            data.weapons.push({
                type: s.readGameType(),
                ammo: s.readUint8()
            });
        }
    }
    data.spectatorCountDirty = s.readBoolean();
    if (data.spectatorCountDirty) {
        data.spectatorCount = s.readUint8();
    }
    s.readAlignToNextByte();
}

function serializePlayerStatus(s: BitStream, data: { players: PlayerStatus[] }) {
    s.writeUint8(data.players.length);
    for (let i = 0; i < data.players.length; i++) {
        const info = data.players[i];
        s.writeBoolean(info.hasData);

        if (info.hasData) {
            s.writeVec(info.pos, 0, 0, 1024, 1024, 11);
            s.writeBoolean(info.visible);
            s.writeBoolean(info.dead);
            s.writeBoolean(info.downed);

            s.writeBoolean(info.role !== "");
            if (info.role !== "") {
                s.writeGameType(info.role);
            }
        }
    }
    s.writeAlignToNextByte();
}

function deserializePlayerStatus(s: BitStream, data: { players: PlayerStatus[] }) {
    data.players = [];
    const count = s.readUint8();
    for (let i = 0; i < count; i++) {
        const p = {} as PlayerStatus & { hasData: boolean };
        p.hasData = s.readBoolean();
        if (p.hasData) {
            p.pos = s.readVec(0, 0, 1024, 1024, 11);
            p.visible = s.readBoolean();
            p.dead = s.readBoolean();
            p.downed = s.readBoolean();
            p.role = "";
            if (s.readBoolean()) {
                p.role = s.readGameType();
            }
        }
        data.players.push(p);
    }
    s.readAlignToNextByte();
}

function serializeGroupStatus(s: BitStream, data: { players: GroupStatus[] }) {
    s.writeUint8(data.players.length);

    for (let i = 0; i < data.players.length; i++) {
        const status = data.players[i];
        s.writeFloat(status.health, 0, 100, 7);
        s.writeBoolean(status.disconnected);
    }
}

function deserializeGroupStatus(s: BitStream, data: { players: GroupStatus[] }) {
    data.players = [];
    const count = s.readUint8();
    for (let i = 0; i < count; i++) {
        const p = {} as GroupStatus;
        p.health = s.readFloat(0, 100, 7);
        p.disconnected = s.readBoolean();
        data.players.push(p);
    }
}

export interface PlayerInfo {
    playerId: number;
    teamId: number;
    groupId: number;
    name: string;

    loadout: {
        heal: string;
        boost: string;
    };
}

function serializePlayerInfo(s: BitStream, data: PlayerInfo) {
    s.writeUint16(data.playerId);
    s.writeUint8(data.teamId);
    s.writeUint8(data.groupId);
    s.writeString(data.name);

    s.writeGameType(data.loadout.heal);
    s.writeGameType(data.loadout.boost);

    s.writeAlignToNextByte();
}

function deserializePlayerInfo(s: BitStream, data: PlayerInfo) {
    data.playerId = s.readUint16();
    data.teamId = s.readUint8();
    data.groupId = s.readUint8();
    data.name = s.readString();
    data.loadout = {} as PlayerInfo["loadout"];
    data.loadout.heal = s.readGameType();
    data.loadout.boost = s.readGameType();
    s.readAlignToNextByte();
}

export interface GasData {
    mode: number;
    duration: number;
    posOld: Vec2;
    posNew: Vec2;
    radOld: number;
    radNew: number;
}

function serializeGasData(s: BitStream, data: GasData) {
    s.writeUint8(data.mode);
    s.writeFloat32(data.duration);
    s.writeVec(data.posOld, 0, 0, 1024, 1024, 16);
    s.writeVec(data.posNew, 0, 0, 1024, 1024, 16);
    s.writeFloat(data.radOld, 0, 2048, 16);
    s.writeFloat(data.radNew, 0, 2048, 16);
}

function deserializeGasData(s: BitStream, data: GasData) {
    data.mode = s.readUint8();
    data.duration = s.readFloat32();
    data.posOld = s.readVec(0, 0, 1024, 1024, 16);
    data.posNew = s.readVec(0, 0, 1024, 1024, 16);
    data.radOld = s.readFloat(0, 2048, 16);
    data.radNew = s.readFloat(0, 2048, 16);
}

export const UpdateExtFlags = {
    DeletedObjects: 1 << 0,
    FullObjects: 1 << 1,
    ActivePlayerId: 1 << 2,
    Gas: 1 << 3,
    GasCircle: 1 << 4,
    PlayerInfos: 1 << 5,
    DeletePlayerIds: 1 << 6,
    PlayerStatus: 1 << 7,
    GroupStatus: 1 << 8,
    Bullets: 1 << 9,
    Explosions: 1 << 10,
    Emotes: 1 << 11,
    Planes: 1 << 12,
    AirstrikeZones: 1 << 13,
    MapIndicators: 1 << 14,
    KillLeader: 1 << 15
};

export class UpdateMsg extends AbstractMsg {
    delObjIds: number[] = [];
    fullObjects: Array<
        ObjectsFullData[ObjectType] &
            ObjectsPartialData[ObjectType] & {
                __id: number;
                __type: ObjectType;
                partialStream: BitStream;
                fullStream: BitStream;
            }
    > = [];

    partObjects: Array<
        ObjectsPartialData[ObjectType] & {
            __id: number;
            __type: ObjectType;
            partialStream: BitStream;
        }
    > = [];

    activePlayerId = 0;
    activePlayerIdDirty = false;
    activePlayerData!: LocalDataWithDirty;

    aliveCounts = [];
    aliveDirty = false;

    gasData!: GasData;
    gasDirty = false;
    gasT = 0;
    gasTDirty = false;

    playerInfos: PlayerInfo[] = [];
    deletedPlayerIds: number[] = [];

    playerStatus: { players: PlayerStatus[] } = { players: [] };
    playerStatusDirty = false;

    groupStatus: { players: GroupStatus[] } = { players: [] };
    groupStatusDirty = false;

    bullets: Bullet[] = [];
    explosions: Explosion[] = [];
    emotes: Emote[] = [];
    planes: Plane[] = [];
    airstrikeZones: Airstrike[] = [];
    mapIndicators: MapIndicator[] = [];

    killLeaderId = 0;
    killLeaderKills = 0;
    killLeaderDirty = false;
    ack = 0;

    override serialize(s: BitStream) {
        let flags = 0;
        const flagsIdx = s.byteIndex;
        s.writeUint16(flags);

        if (this.delObjIds.length) {
            s.writeUint16(this.delObjIds.length);
            for (let i = 0; i < this.delObjIds.length; i++) {
                s.writeUint16(this.delObjIds[i]);
            }
            flags |= UpdateExtFlags.DeletedObjects;
        }

        if (this.fullObjects.length) {
            s.writeUint16(this.fullObjects.length);
            for (let i = 0; i < this.fullObjects.length; i++) {
                const obj = this.fullObjects[i];
                s.writeUint8(obj.__type);
                s.writeBytes(obj.partialStream, 0, obj.partialStream.byteIndex);
                s.writeBytes(obj.fullStream, 0, obj.fullStream.byteIndex);
            }
            flags |= UpdateExtFlags.FullObjects;
        }

        s.writeUint16(this.partObjects.length);
        for (let i = 0; i < this.partObjects.length; i++) {
            const obj = this.partObjects[i];
            s.writeBytes(obj.partialStream, 0, obj.partialStream.byteIndex);
        }

        if (this.activePlayerIdDirty) {
            s.writeUint16(this.activePlayerId);
            flags |= UpdateExtFlags.ActivePlayerId;
        }

        serializeActivePlayer(s, this.activePlayerData);

        if (this.gasDirty) {
            serializeGasData(s, this.gasData);
            flags |= UpdateExtFlags.Gas;
        }

        if (this.gasTDirty) {
            s.writeFloat(this.gasT, 0, 1, 16);
            flags |= UpdateExtFlags.GasCircle;
        }

        if (this.playerInfos.length) {
            s.writeUint8(this.playerInfos.length);
            for (let i = 0; i < this.playerInfos.length; i++) {
                serializePlayerInfo(s, this.playerInfos[i]);
            }
            flags |= UpdateExtFlags.PlayerInfos;
        }

        if (this.deletedPlayerIds.length) {
            s.writeUint8(this.deletedPlayerIds.length);
            for (let i = 0; i < this.deletedPlayerIds.length; i++) {
                s.writeUint16(this.deletedPlayerIds[i]);
            }
            flags |= UpdateExtFlags.DeletePlayerIds;
        }

        if (this.playerStatusDirty) {
            serializePlayerStatus(s, this.playerStatus);
            flags |= UpdateExtFlags.PlayerStatus;
        }

        if (this.groupStatusDirty) {
            serializeGroupStatus(s, this.groupStatus);
            flags |= UpdateExtFlags.GroupStatus;
        }

        if (this.bullets.length) {
            s.writeUint8(this.bullets.length);

            for (let i = 0; i < this.bullets.length; i++) {
                const bullet = this.bullets[i];

                s.writeUint16(bullet.playerId);
                s.writeVec(bullet.startPos, 0, 0, 1024, 1024, 16);
                s.writeUnitVec(bullet.dir, 8);
                s.writeGameType(bullet.bulletType);
                s.writeBits(bullet.layer, 2);
                s.writeFloat(bullet.varianceT, 0, 1, 4);
                s.writeBits(bullet.distAdjIdx, 4);
                s.writeBoolean(bullet.clipDistance);
                if (bullet.clipDistance) {
                    s.writeFloat(bullet.distance, 0, 1024, 16);
                }
                s.writeBoolean(bullet.shotFx);
                if (bullet.shotFx) {
                    s.writeGameType(bullet.shotSourceType);
                    s.writeBoolean(bullet.shotOffhand);
                    s.writeBoolean(bullet.lastShot);
                }
                s.writeBoolean(bullet.reflectCount > 0);
                if (bullet.reflectCount > 0) {
                    s.writeBits(bullet.reflectCount, 2);
                    s.writeUint16(bullet.reflectObjId);
                }

                s.writeBoolean(bullet.hasSpecialFx);

                if (bullet.hasSpecialFx) {
                    s.writeBoolean(bullet.shotAlt);
                    s.writeBoolean(bullet.splinter);
                    s.writeBoolean(bullet.trailSaturated);
                    s.writeBoolean(bullet.trailSmall);
                    s.writeBoolean(bullet.trailThick);
                }
            }

            s.writeAlignToNextByte();
            flags |= UpdateExtFlags.Bullets;
        }

        if (this.explosions.length) {
            s.writeUint8(this.explosions.length);
            for (let i = 0; i < this.explosions.length; i++) {
                const explosion = this.explosions[i];

                s.writeVec(explosion.pos, 0, 0, 1024, 1024, 16);
                s.writeGameType(explosion.type);
                s.writeBits(explosion.layer, 2);
                s.writeAlignToNextByte();
            }
            flags |= UpdateExtFlags.Explosions;
        }

        if (this.emotes.length) {
            s.writeUint8(this.emotes.length);
            for (let i = 0; i < this.emotes.length; i++) {
                const emote = this.emotes[i];

                s.writeUint16(emote.playerId);
                s.writeGameType(emote.type);
                s.writeGameType(emote.itemType);
                s.writeBoolean(emote.isPing);

                if (emote.isPing) {
                    s.writeVec(emote.pos!, 0, 0, 1024, 1024, 16);
                }
                s.writeAlignToNextByte();
            }
            flags |= UpdateExtFlags.Emotes;
        }

        if (this.planes.length) {
            s.writeUint8(this.planes.length);
            for (let i = 0; i < this.planes.length; i++) {
                const plane = this.planes[i];

                s.writeUint8(plane.id);
                s.writeVec(v2.add(plane.pos, v2.create(512, 512)), 0, 0, 2048, 2048, 10);
                s.writeUnitVec(plane.planeDir, 8);
                s.writeBoolean(plane.actionComplete);
                s.writeBits(plane.action, 3);
            }
            flags |= UpdateExtFlags.Planes;
        }

        if (this.airstrikeZones.length) {
            s.writeUint8(this.airstrikeZones.length);
            for (let i = 0; i < this.airstrikeZones.length; i++) {
                const zone = this.airstrikeZones[i];

                s.writeVec(zone.pos, 0, 0, 1024, 1024, 12);
                s.writeFloat(zone.rad, 0, Constants.AirstrikeZoneMaxRad, 8);
                s.writeFloat(zone.duration, 0, Constants.AirstrikeZoneMaxDuration, 8);
            }
            flags |= UpdateExtFlags.AirstrikeZones;
        }

        if (this.mapIndicators.length) {
            s.writeUint8(this.mapIndicators.length);
            for (let i = 0; i < this.mapIndicators.length; i++) {
                const indicator = this.mapIndicators[i];

                s.writeBits(indicator.id, 4);
                s.writeBoolean(indicator.dead);
                s.writeBoolean(indicator.equipped);
                s.writeGameType(indicator.type);
                s.writeVec(indicator.pos, 0, 0, 1024, 1024, 16);
            }
            s.writeAlignToNextByte();
            flags |= UpdateExtFlags.MapIndicators;
        }

        if (this.killLeaderDirty) {
            s.writeUint16(this.killLeaderId);
            s.writeUint8(this.killLeaderKills);
            flags |= UpdateExtFlags.KillLeader;
        }

        s.writeUint8(this.ack);
        const idx = s.byteIndex;
        s.byteIndex = flagsIdx;
        s.writeUint16(flags);
        s.byteIndex = idx;
    }

    // @ts-expect-error deserialize only accept one argument for now
    override deserialize(
        s: BitStream,
        objectCreator: { getTypeById: (id: number, s: BitStream) => ObjectType }
    ) {
        const flags = s.readUint16();

        if ((flags & UpdateExtFlags.DeletedObjects) != 0) {
            const count = s.readUint16();
            for (let i = 0; i < count; i++) {
                this.delObjIds.push(s.readUint16());
            }
        }

        if ((flags & UpdateExtFlags.FullObjects) != 0) {
            const count = s.readUint16();
            for (let i = 0; i < count; i++) {
                const data = {} as this["fullObjects"][0];
                data.__type = s.readUint8();
                data.__id = s.readUint16();
                (
                    ObjectSerializeFns[data.__type].deserializePart as (
                        s: BitStream,
                        d: typeof data
                    ) => void
                )(s, data);
                (
                    ObjectSerializeFns[data.__type].deserializeFull as (
                        s: BitStream,
                        d: typeof data
                    ) => void
                )(s, data);
                this.fullObjects.push(data);
            }
        }

        for (let count = s.readUint16(), i = 0; i < count; i++) {
            const data = {} as this["partObjects"][0];
            data.__id = s.readUint16();
            const type = objectCreator.getTypeById(data.__id, s);
            (
                ObjectSerializeFns[type].deserializePart as (
                    s: BitStream,
                    d: typeof data
                ) => void
            )(s, data);
            this.partObjects.push(data);
        }

        if ((flags & UpdateExtFlags.ActivePlayerId) != 0) {
            this.activePlayerId = s.readUint16();
            this.activePlayerIdDirty = true;
        }

        const activePlayerData = {} as LocalDataWithDirty;
        deserializeActivePlayer(s, activePlayerData);
        this.activePlayerData = activePlayerData;

        if ((flags & UpdateExtFlags.Gas) != 0) {
            const gasData = {} as GasData;
            deserializeGasData(s, gasData);
            this.gasData = gasData;
            this.gasDirty = true;
        }

        if ((flags & UpdateExtFlags.GasCircle) != 0) {
            this.gasT = s.readFloat(0, 1, 16);
            this.gasTDirty = true;
        }

        if ((flags & UpdateExtFlags.PlayerInfos) != 0) {
            const count = s.readUint8();
            for (let i = 0; i < count; i++) {
                const x = {} as PlayerInfo;
                deserializePlayerInfo(s, x);
                this.playerInfos.push(x);
            }
        }

        if ((flags & UpdateExtFlags.DeletePlayerIds) != 0) {
            const count = s.readUint8();
            for (let i = 0; i < count; i++) {
                const id = s.readUint16();
                this.deletedPlayerIds.push(id);
            }
        }

        if ((flags & UpdateExtFlags.PlayerStatus) != 0) {
            const playerStatus = {} as this["playerStatus"];
            deserializePlayerStatus(s, playerStatus);
            this.playerStatus = playerStatus;
            this.playerStatusDirty = true;
        }

        if ((flags & UpdateExtFlags.GroupStatus) != 0) {
            const groupStatus = {} as this["groupStatus"];
            deserializeGroupStatus(s, groupStatus);
            this.groupStatus = groupStatus;
            this.groupStatusDirty = true;
        }

        if ((flags & UpdateExtFlags.Bullets) != 0) {
            for (let count = s.readUint8(), i = 0; i < count; i++) {
                const bullet = {} as Bullet;
                bullet.playerId = s.readUint16();
                bullet.pos = s.readVec(0, 0, 1024, 1024, 16);
                bullet.dir = s.readUnitVec(8);
                bullet.bulletType = s.readGameType();
                bullet.layer = s.readBits(2);
                bullet.varianceT = s.readFloat(0, 1, 4);
                bullet.distAdjIdx = s.readBits(4);
                bullet.clipDistance = s.readBoolean();
                if (bullet.clipDistance) {
                    bullet.distance = s.readFloat(0, 1024, 16);
                }
                bullet.shotFx = s.readBoolean();
                if (bullet.shotFx) {
                    bullet.shotSourceType = s.readGameType();
                    bullet.shotOffhand = s.readBoolean();
                    bullet.lastShot = s.readBoolean();
                }
                bullet.reflectCount = 0;
                bullet.reflectObjId = 0;
                if (s.readBoolean()) {
                    bullet.reflectCount = s.readBits(2);
                    bullet.reflectObjId = s.readUint16();
                }
                bullet.hasSpecialFx = s.readBoolean();
                if (bullet.hasSpecialFx) {
                    bullet.shotAlt = s.readBoolean();
                    bullet.splinter = s.readBoolean();
                    bullet.trailSaturated = s.readBoolean();
                    bullet.trailSmall = s.readBoolean();
                    bullet.trailThick = s.readBoolean();
                }
                this.bullets.push(bullet);
            }
            s.readAlignToNextByte();
        }

        if ((flags & UpdateExtFlags.Explosions) != 0) {
            const count = s.readUint8();
            for (let i = 0; i < count; i++) {
                const explosion = {} as Explosion;
                explosion.pos = s.readVec(0, 0, 1024, 1024, 16);
                explosion.type = s.readGameType();
                explosion.layer = s.readBits(2);
                s.readAlignToNextByte();
                this.explosions.push(explosion);
            }
        }

        if ((flags & UpdateExtFlags.Emotes) != 0) {
            for (let count = s.readUint8(), i = 0; i < count; i++) {
                const emote = {} as Emote;
                emote.playerId = s.readUint16();
                emote.type = s.readGameType();
                emote.itemType = s.readGameType();
                emote.isPing = s.readBoolean();

                if (emote.isPing) {
                    emote.pos = s.readVec(0, 0, 1024, 1024, 16);
                }
                s.readBits(3);
                this.emotes.push(emote);
            }
        }

        if ((flags & UpdateExtFlags.Planes) != 0) {
            for (let count = s.readUint8(), i = 0; i < count; i++) {
                const plane = {} as Plane;
                plane.id = s.readUint8();
                const V = s.readVec(0, 0, 2048, 2048, 10);
                plane.pos = v2.create(V.x - 512, V.y - 512);
                plane.planeDir = s.readUnitVec(8);
                plane.actionComplete = s.readBoolean();
                plane.action = s.readBits(3);
                this.planes.push(plane);
            }
        }

        if ((flags & UpdateExtFlags.AirstrikeZones) != 0) {
            for (let count = s.readUint8(), i = 0; i < count; i++) {
                const airStrikeZone = {} as Airstrike;
                airStrikeZone.pos = s.readVec(0, 0, 1024, 1024, 12);
                airStrikeZone.rad = s.readFloat(0, Constants.AirstrikeZoneMaxRad, 8);
                airStrikeZone.duration = s.readFloat(
                    0,
                    Constants.AirstrikeZoneMaxDuration,
                    8
                );
                this.airstrikeZones.push(airStrikeZone);
            }
        }

        if ((flags & UpdateExtFlags.MapIndicators) != 0) {
            for (let count = s.readUint8(), i = 0; i < count; i++) {
                const mapIndicator = {} as MapIndicator;
                mapIndicator.id = s.readBits(4);
                mapIndicator.dead = s.readBoolean();
                mapIndicator.equipped = s.readBoolean();
                mapIndicator.type = s.readGameType();
                mapIndicator.pos = s.readVec(0, 0, 1024, 1024, 16);
                this.mapIndicators.push(mapIndicator);
            }
            s.readAlignToNextByte();
        }

        if ((flags & UpdateExtFlags.KillLeader) != 0) {
            this.killLeaderId = s.readUint16();
            this.killLeaderKills = s.readUint8();
            this.killLeaderDirty = true;
        }
        this.ack = s.readUint8();
    }
}

export function getPlayerStatusUpdateRate(factionMode: boolean) {
    if (factionMode) {
        return 0.5;
    }
    return 0.25;
}

export interface Bullet {
    playerId: number;
    startPos: Vec2;
    pos: Vec2;
    dir: Vec2;
    bulletType: string;
    layer: number;
    varianceT: number;
    distAdjIdx: number;
    clipDistance: boolean;
    distance: number;
    shotFx: boolean;
    shotSourceType: string;
    shotOffhand: boolean;
    lastShot: boolean;
    reflectCount: number;
    reflectObjId: number;
    hasSpecialFx: boolean;
    shotAlt: boolean;
    splinter: boolean;
    trailSaturated: boolean;
    trailSmall: boolean;
    trailThick: boolean;
}

export interface Explosion {
    pos: Vec2;
    type: string;
    layer: number;
}

export interface Emote {
    playerId: number;
    type: string;
    itemType: string;
    isPing: boolean;
    pos?: Vec2;
}

export interface Airstrike {
    pos: Vec2;
    duration: number;
    rad: number;
}

export interface Plane {
    planeDir: Vec2;
    pos: Vec2;
    actionComplete: boolean;
    action: number;
    id: number;
}

export interface MapIndicator {
    id: number;
    dead: boolean;
    equipped: boolean;
    type: string;
    pos: Vec2;
}

export interface Action {
    type: Action;
    seq: number;
    seqOld: number;
    item: string;
    skin: string;
    targetId: number;
    time: number;
    duration: number;
    throttleCount: number;
    throttleTicker: number;
}

export interface LocalData {
    health: number;
    zoom: number;
    boost: number;
    scope: string;
    curWeapIdx: number;
    inventory: Record<string, number>;
    weapons: Array<{
        type: string;
        ammo: number;
    }>;
    spectatorCount: number;
}

export interface LocalDataWithDirty extends LocalData {
    healthDirty: boolean;
    boostDirty: boolean;
    zoomDirty: boolean;
    actionDirty: boolean;
    action: {
        time: number;
        duration: number;
        targetId: number;
    };
    inventoryDirty: boolean;
    weapsDirty: boolean;
    spectatorCountDirty: boolean;
}

// the non-optional properties are used by both server and client
export interface PlayerStatus {
    playerId?: number;
    pos: Vec2;
    posTarget?: Vec2;
    posDelta?: number;
    health?: number;
    posInterp?: number;
    visible: boolean;
    dead: boolean;
    downed: boolean;
    disconnected?: boolean;
    role: string;
    timeSinceUpdate?: number;
    timeSinceVisible?: number;
    minimapAlpha?: number;
    minimapVisible?: boolean;
    hasData: boolean;
}

export interface GroupStatus {
    health: number;
    disconnected: boolean;
}
