import bb from "bit-buffer";
import { v2 } from "./utils/v2";
import { GameObjectDefs } from "./defs/gameObjectDefs";
import { MapObjectDefs } from "./defs/mapObjectDefs";
import { math } from "./utils/math";
import { GameConfig } from "./gameConfig";
import GameObject from "./utils/gameObject";

const DEV_MODE = false;

//
// Map type strings to integers for more efficient serialization.
//

class ConfigTypeMap {
    /**
     * @param {number} typeBits
     */
    constructor(typeBits) {
        /** * @type {Record<string,number>} */
        this._typeToId = {};
        /** * @type {Record<number,string>} */
        this._idToType = {};
        /** * @type number */
        this.nextId = 0;
        /** * @type number */
        this.maxId = 2 ** typeBits;

        this.addType("");
    }

    /**
     * @param {string} type
     */
    addType(type) {
        // assert(this._typeToId[type] === undefined, `Type ${type} has already been defined!`);
        // assert(this.nextId < this.maxId);
        this._typeToId[type] = this.nextId;
        this._idToType[this.nextId] = type;
        this.nextId++;
    }

    /**
      * @param {string} type
      */
    typeToId(type) {
        const id = this._typeToId[type];
        // assert(id !== undefined, `Invalid type ${type}`);
        return id;
    }

    /**
      * @param {number} id
      */
    idToType(id) {
        const type = this._idToType[id];
        if (type === undefined) {
            console.error("Invalid id given to idToType", id, "max", Object.keys(this._idToType).length);
        }
        return type;
    }
}

/**
 * @param {string} type
 * @param {Record<string, unknown>} typeList
 * @param {number} bitsPerType
 */
function createTypeSerialization(type, typeList, bitsPerType) {
    const typeMap = new ConfigTypeMap(bitsPerType);

    const types = Object.keys(typeList);
    // assert(types.length <= typeMap.maxId, `${type} contains ${types.length} types, max ${typeMap.maxId}`);
    for (let i = 0; i < types.length; i++) {
        typeMap.addType(types[i]);
    }

    if (DEV_MODE) {
        console.log(`Used ${typeMap.nextId} / ${typeMap.maxId} ${type} types`);
    }

    // Create serialization functions
    /* bb.BitStream.prototype[`write${type}Type`] = function(v) {
        this.writeBits(typeMap.typeToId(v), bitsPerType);
    };
    bb.BitStream.prototype[`read${type}Type`] = function() {
        return typeMap.idToType(this.readBits(bitsPerType));
    }; */

    return typeMap;
}

const gameTypeSerialization = createTypeSerialization("Game", GameObjectDefs, 10);
const mapTypeSerialization = createTypeSerialization("Map", MapObjectDefs, 12);

export class BitStream extends bb.BitStream {
    /**
     * @param {string} str
     * @param {number} [len]
     */
    writeString(str, len) {
        this.writeASCIIString(str, len);
    }

    /**
     * @param {number} [len]
     */
    readString(len) {
        return this.readASCIIString(len);
    }

    /**
     * @param {number} f
     * @param {number} min
     * @param {number} min
     * @param {number} max
     * @param {number} bits
     */
    writeFloat(f, min, max, bits) {
        // assert(bits > 0 && bits < 31);
        // assert(f >= min && f <= max);
        const range = (1 << bits) - 1;
        const x = math.clamp(f, min, max);
        const t = (x - min) / (max - min);
        const v = t * range + 0.5;
        this.writeBits(v, bits);
    }

    /**
     * @param {number} min
     * @param {number} max
     * @param {number} bits
     */
    readFloat(min, max, bits) {
        // assert(bits > 0 && bits < 31);
        const range = (1 << bits) - 1;
        const x = this.readBits(bits);
        const t = x / range;
        const v = min + t * (max - min);
        return v;
    }

    /**
     * @param {import("./utils/v2").Vec2} vec
     * @param {number} minX
     * @param {number} minY
     * @param {number} maxX
     * @param {number} maxY
     * @param {number} bitCount
     */
    writeVec(vec, minX, minY, maxX, maxY, bitCount) {
        this.writeFloat(vec.x, minX, maxX, bitCount);
        this.writeFloat(vec.y, minY, maxY, bitCount);
    }

    /**
     * @param {number} minX
     * @param {number} minY
     * @param {number} maxX
     * @param {number} maxY
     * @param {number} bitCount
     */
    readVec(minX, minY, maxX, maxY, bitCount) {
        return {
            x: this.readFloat(minX, maxX, bitCount),
            y: this.readFloat(minY, maxY, bitCount)
        };
    }

    /**
     * @param {import("./utils/v2").Vec2} vec
     * @param {number} bitCount
     */
    writeUnitVec(vec, bitCount) {
        this.writeVec(vec, -1.0001, -1.0001, 1.0001, 1.0001, bitCount);
    }

    /**
     * @param {number} bitCount
     */
    readUnitVec(bitCount) {
        return this.readVec(-1.0001, -1.0001, 1.0001, 1.0001, bitCount);
    }

    /**
     * @param {import("./utils/v2").Vec2} vec
     */
    writeVec32(vec) {
        this.writeFloat32(vec.x);
        this.writeFloat32(vec.y);
    }

    readVec32() {
        return {
            x: this.readFloat32(),
            y: this.readFloat32()
        };
    }

    /**
     * @param {BitStream} src
     * @param {number} offset
     * @param {number} length
     */
    writeBytes(src, offset, length) {
        // assert(this._index % 8 == 0);
        const data = new Uint8Array(src._view._view.buffer, offset, length);
        this._view._view.set(data, this.index / 8);
        this.index += length * 8;
    }

    writeAlignToNextByte() {
        const offset = 8 - this.index % 8;
        if (offset < 8) this.writeBits(0, offset);
    }

    readAlignToNextByte() {
        const offset = 8 - this.index % 8;
        if (offset < 8) this.readBits(offset);
    }

    /**
     * @param {string} type
     */
    writeGameType(type) {
        this.writeBits(gameTypeSerialization.typeToId(type), 10);
    }

    /**
     * @return {string}
     */
    readGameType() {
        return gameTypeSerialization.idToType(this.readBits(10));
    }

    /**
     * @param {string} type
     */
    writeMapType(type) {
        this.writeBits(mapTypeSerialization.typeToId(type), 12);
    }

    /**
     * @return {string}
     */
    readMapType() {
        return mapTypeSerialization.idToType(this.readBits(12));
    }
}

//
// MsgStream
//

export class MsgStream {
    /**
     * @param {ArrayBuffer | Uint8Array} buf
     */
    constructor(buf) {
        let arrayBuf = buf instanceof ArrayBuffer ? buf : null;
        if (arrayBuf == null) {
            arrayBuf = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
        }
        this.valid = arrayBuf != null;
        if (this.valid) {
            this.arrayBuf = arrayBuf;
            this.stream = new BitStream(arrayBuf);
        } else {
            console.log("Invalid buf type", typeof buf === "undefined" ? "undefined" : _typeof(buf));
            if (typeof buf === "string") {
                console.log(`String contents: ${buf.substring(0, 1024)}`);
            }
        }
    }

    getBuffer() {
        return new Uint8Array(this.arrayBuf, 0, this.stream.byteIndex);
    }

    getStream() {
        return this.stream;
    }

    /**
     * @param {MsgType} type
     * @param {import("./netTypings").Msg} msg
    **/
    serializeMsg(type, msg) {
        // assert(this.stream.index % 8 == 0);
        this.stream.writeUint8(type);
        msg.serialize(this.stream);
        // assert(this.stream.index % 8 == 0);
    }

    /**
     * @param {number} type
     * @param {BitStream} stream
     */
    serializeMsgStream(type, stream) {
        // assert(this.stream.index % 8 == 0 && stream.index % 8 == 0);
        this.stream.writeUint8(type);
        this.stream.writeBytes(stream, 0, stream.index / 8);
    }

    deserializeMsgType() {
        if (this.stream.length - this.stream.byteIndex * 8 >= 1) {
            return this.stream.readUint8();
        }
        return MsgType.None;
    }
}

export const Constants = {
    MapNameMaxLen: 24,
    PlayerNameMaxLen: 16,
    MouseMaxDist: 64,
    SmokeMaxRad: 10,
    ActionMaxDuration: 8.5,
    AirstrikeZoneMaxRad: 256,
    AirstrikeZoneMaxDuration: 60,
    PlayerMinScale: 0.75,
    PlayerMaxScale: 2,
    MapObjectMinScale: 0.125,
    MapObjectMaxScale: 2.5,
    MaxPerks: 8,
    MaxMapIndicators: 16
};

export const ObjectSerializeFns = {};

function setSerializeFns(type, serializedFullSize, serializePart, serializeFull, deserializePart, deserializeFull) {
    ObjectSerializeFns[type] = {
        serializedFullSize,
        serializePart,
        serializeFull,
        deserializePart,
        deserializeFull
    };
}

setSerializeFns(
    GameObject.Type.Player,
    32,
    /**
     * @param {BitStream} s
     * @param {import("../server/src/objects/player").Player} data
     **/
    (s, data) => {
        s.writeVec(data.pos, 0, 0, 1024, 1024, 16);
        s.writeUnitVec(data.dir, 8);
    },
    /**
     * @param {BitStream} s
     * @param {import("../server/src/objects/player").Player} data
     **/
    (s, data) => {
        s.writeGameType(data.outfit);
        s.writeGameType(data.backpack);
        s.writeGameType(data.helmet);
        s.writeGameType(data.chest);
        s.writeGameType(data.activeWeapon);

        s.writeBits(data.layer, 2);
        s.writeBoolean(data.dead);
        s.writeBoolean(data.downed);

        s.writeBits(data.animType, 3);
        s.writeBits(data.animSeq, 3);
        s.writeBits(data.actionType, 3);
        s.writeBits(data.actionSeq, 3);

        s.writeBoolean(data.wearingPan);
        s.writeBoolean(data.healEffect);

        s.writeBoolean(data.frozen);
        s.writeBits(data.frozenOri, 2);

        s.writeBoolean(data.hasHaste);
        if (data.hasHaste) {
            s.writeBits(data.hasteType, 3);
            s.writeBits(data.hasteSeq, 3);
        }

        s.writeBoolean(data.actionItem !== "");
        if (data.actionItem !== "") {
            s.writeGameType(data.actionItem);
        }

        s.writeBoolean(data.hasScale);
        if (data.hasScale) {
            s.writeFloat(data.scale, Constants.PlayerMinScale, Constants.PlayerMaxScale, 8);
        }

        s.writeBoolean(data.hasRole);
        if (data.hasRole) s.writeGameType(data.role);

        s.writeBoolean(data.hasPerks);
        if (data.hasPerks) {
            const perkAmount = math.min(data.perks.length, Constants.MaxPerks - 1);
            s.writeBits(perkAmount, 3);
            for (let i = 0; i < perkAmount; i++) {
                const perk = data.perks[i];
                s.writeGameType(perk.type);
                s.writeBoolean(perk.droppable);
            }
        }

        s.writeAlignToNextByte();
    },
    /**
     * @param {BitStream} s
     * @param {import("../server/src/objects/player").Player} data
     **/
    (s, data) => {
        data.pos = s.readVec(0, 0, 1024, 1024, 16); // position
        data.dir = s.readUnitVec(8); // rotation
    },
    /**
     * @param {BitStream} s
     * @param {import("../server/src/objects/player").Player} data
     **/
    (s, data) => {
        data.outfit = s.readGameType(); // outfit
        data.backpack = s.readGameType(); // pack
        data.helmet = s.readGameType(); // helmet
        data.chest = s.readGameType(); // chest
        data.activeWeapon = s.readGameType(); // active weapon

        data.layer = s.readBits(2); // layer
        data.dead = s.readBoolean(); // dead
        data.downed = s.readBoolean(); // downed

        data.animType = s.readBits(3); // anim type
        data.animSeq = s.readBits(3); // anim seq
        data.actionType = s.readBits(3); // action type
        data.actionSeq = s.readBits(3); // action seq

        data.wearingPan = s.readBoolean(); // wearing pan
        data.healEffect = s.readBoolean(); // heal effect
        data.frozen = s.readBoolean(); // frozen
        data.frozenOri = s.readBits(2); // frozen ori
        data.hasteType = 0;
        data.hasteSeq = -1;
        if (s.readBoolean()) {
            // has haste
            data.hasteType = s.readBits(3); // haste type
            data.hasteSeq = s.readBits(3); // haste seq
        }
        const hasActionItem = s.readBoolean(); // has action item
        data.actionItem = hasActionItem ? s.readGameType() : ""; // action item

        const hasScale = s.readBoolean(); // scale dirty
        data.scale = hasScale
            ? s.readFloat(Constants.PlayerMinScale, Constants.PlayerMaxScale, 8)
            : 1;
        const hasRole = s.readBoolean();
        data.role = hasRole ? s.readGameType() : "";
        data.perks = [];
        const hasPerks = s.readBoolean();
        if (hasPerks) {
            const perkCount = s.readBits(3);
            for (let i = 0; i < perkCount; i++) {
                const type = s.readGameType();
                const droppable = s.readBoolean();
                data.perks.push({
                    type,
                    droppable
                });
            }
        }
        s.readAlignToNextByte();
    }
);
setSerializeFns(
    GameObject.Type.Obstacle,
    0,
    /**
     * @param {BitStream} s
     * @param {import("../server/src/objects/obstacle").Obstacle} data
     **/
    (s, data) => {
        s.writeVec(data.pos, 0, 0, 1024, 1024, 16);
        s.writeBits(data.ori, 2);
        s.writeFloat(
            data.scale,
            Constants.MapObjectMinScale,
            Constants.MapObjectMaxScale,
            8
        );
        s.writeBits(0, 6);
    },
    /**
     * @param {BitStream} s
     * @param {import("../server/src/objects/obstacle").Obstacle} data
     **/
    (s, data) => {
        s.writeFloat(data.healthT, 0, 1, 8);
        s.writeMapType(data.type);
        s.writeBits(data.layer, 2);
        s.writeBoolean(data.dead);
        s.writeBoolean(data.isDoor);
        if (data.isDoor) {
            s.writeBoolean(data.door.open);
            s.writeBoolean(data.door.canUse);
            s.writeBoolean(data.door.locked);
            s.writeBits(data.door.seq, 5);
        }

        s.writeBoolean(data.isButton);
        if (data.isButton) {
            s.writeBoolean(data.button.onOff);
            s.writeBoolean(data.button.canUse);
            s.writeBits(data.button.seq, 6);
        }

        s.writeBoolean(data.isPuzzlePiece);
        if (data.isPuzzlePiece) s.writeUint16(data.parentBuildingId);

        s.writeBoolean(data.isSkin);
        if (data.isSkin) s.writeUint16(data.skinPlayerId);

        s.writeBits(0, 5); // padding
    },
    (s, data) => {
        data.pos = s.readVec(0, 0, 1024, 1024, 16);
        data.ori = s.readBits(2);
        data.scale = s.readFloat(
            Constants.MapObjectMinScale,
            Constants.MapObjectMaxScale,
            8
        );
        s.readBits(6);
    },
    (s, data) => {
        data.healthT = s.readFloat(0, 1, 8);
        data.type = s.readMapType();
        data.layer = s.readBits(2);
        data.dead = s.readBoolean();
        data.isDoor = s.readBoolean();
        if (data.isDoor) {
            data.door = {};
            data.door.open = s.readBoolean();
            data.door.canUse = s.readBoolean();
            data.door.locked = s.readBoolean();
            data.door.seq = s.readBits(5);
        }
        data.isButton = s.readBoolean();
        if (data.isButton) {
            data.button = {};
            data.button.onOff = s.readBoolean();
            data.button.canUse = s.readBoolean();
            data.button.seq = s.readBits(6);
        }
        data.isPuzzlePiece = s.readBoolean();
        if (data.isPuzzlePiece) {
            data.parentBuildingId = s.readUint16();
        }
        data.isSkin = s.readBoolean();
        if (data.isSkin) {
            data.skinPlayerId = s.readUint16();
        }
        s.readBits(5);
    }
);
setSerializeFns(
    GameObject.Type.Building,
    0,
    /**
     * @param {BitStream} s
     * @param {import("../server/src/objects/building").Building} data
    **/
    (s, data) => {
        s.writeBoolean(data.ceilingDead);
        s.writeBoolean(data.occupied);
        s.writeBoolean(data.ceilingDamaged);
        s.writeBoolean(data.hasPuzzle);
        if (data.hasPuzzle) {
            s.writeBoolean(data.puzzleSolved);
            s.writeBits(data.puzzleErrSeq, 7);
        }
        s.writeBits(0, 4); // padding
    },
    /**
     * @param {BitStream} s
     * @param {import("../server/src/objects/building").Building} data
    **/
    (s, data) => {
        s.writeVec(data.pos, 0, 0, 1024, 1024, 16);
        s.writeMapType(data.type);
        s.writeBits(data.ori, 2);
        s.writeBits(data.layer, 2);
    },
    (s, data) => {
        data.ceilingDead = s.readBoolean();
        data.occupied = s.readBoolean();
        data.ceilingDamaged = s.readBoolean();
        data.hasPuzzle = s.readBoolean();
        if (data.hasPuzzle) {
            data.puzzleSolved = s.readBoolean();
            data.puzzleErrSeq = s.readBits(7);
        }
        s.readBits(4);
    },
    (s, data) => {
        data.pos = s.readVec(0, 0, 1024, 1024, 16);
        data.type = s.readMapType();
        data.ori = s.readBits(2);
        data.layer = s.readBits(2);
    }
);
setSerializeFns(
    GameObject.Type.Structure,
    0,
    (_s, _t) => { },
    /**
     * @param {BitStream} s
     * @param {import("../server/src/objects/structure").Structure} data
    **/
    (s, data) => {
        s.writeVec(data.pos, 0, 0, 1024, 1024, 16);
        s.writeMapType(data.type);
        s.writeBits(data.ori, 2);
        s.writeBoolean(data.interiorSoundEnabled);
        s.writeBoolean(data.interiorSoundAlt);
        for (let r = 0; r < GameConfig.structureLayerCount; r++) {
            s.writeUint16(data.layerObjIds[r]);
        }
    },
    (_s, _t) => { },
    (s, data) => {
        data.pos = s.readVec(0, 0, 1024, 1024, 16);
        data.type = s.readMapType();
        data.ori = s.readBits(2);
        data.interiorSoundEnabled = s.readBoolean();
        data.interiorSoundAlt = s.readBoolean();
        data.layerObjIds = [];
        for (let r = 0; r < GameConfig.structureLayerCount; r++) {
            const a = s.readUint16();
            data.layerObjIds.push(a);
        }
    }
);
setSerializeFns(
    GameObject.Type.LootSpawner,
    0,
    (s, data) => {
        s.writeVec(data.pos, 0, 0, 1024, 1024, 16);
        s.writeMapType(data.type);
        s.writeBits(data.layer, 2);
        s.writeBits(0, 2);
    },
    (_s, _data) => { },
    (s, data) => {
        data.pos = s.readVec(0, 0, 1024, 1024, 16);
        data.type = s.readMapType();
        data.layer = s.readBits(2);
        s.readBits(2);
    },
    (_s, _data) => { }
);
setSerializeFns(
    GameObject.Type.Loot,
    5,
    /**
     * @param {BitStream} s
     * @param {import("../server/src/objects/loot").Loot} data
    **/
    (s, data) => {
        s.writeVec(data.pos, 0, 0, 1024, 1024, 16);
    },
    /**
     * @param {BitStream} s
     * @param {import("../server/src/objects/loot").Loot} data
    **/
    (s, data) => {
        s.writeGameType(data.type);
        s.writeUint8(data.count);
        s.writeBits(data.layer, 2);
        s.writeBoolean(data.isOld);
        s.writeBoolean(data.isPreloadedGun);
        s.writeBoolean(data.ownerId != 0);
        if (data.ownerId != 0) {
            s.writeUint16(data.ownerId);
        }
        s.writeBits(0, 1);
    },
    (s, data) => {
        data.pos = s.readVec(0, 0, 1024, 1024, 16);
    },
    (s, data) => {
        data.type = s.readGameType();
        data.count = s.readUint8();
        data.layer = s.readBits(2);
        data.isOld = s.readBoolean();
        data.isPreloadedGun = s.readBoolean();
        data.hasOwner = s.readBoolean();
        if (data.hasOwner) {
            data.ownerId = s.readUint16();
        }
        s.readBits(1);
    }
);
setSerializeFns(
    GameObject.Type.DeadBody,
    0,
    /**
     * @param {BitStream} s
     * @param {import("../server/src/objects/deadBody").DeadBody} data
    **/
    (s, data) => {
        s.writeVec(data.pos, 0, 0, 1024, 1024, 16);
    },
    /**
     * @param {BitStream} s
     * @param {import("../server/src/objects/deadBody").DeadBody} data
    **/
    (s, data) => {
        s.writeUint8(data.layer);
        s.writeUint16(data.playerId);
    },
    (s, data) => {
        data.pos = s.readVec(0, 0, 1024, 1024, 16);
    },
    (s, data) => {
        data.layer = s.readUint8();
        data.playerId = s.readUint16();
    }
);
setSerializeFns(
    GameObject.Type.Decal,
    0,
    (_s, _data) => { },
    /**
     * @param {BitStream} s
     * @param {import("../server/src/objects/decal").Decal} data
    **/
    (s, data) => {
        s.writeVec(data.pos, 0, 0, 1024, 1024, 16);
        s.writeFloat(
            data.scale,
            Constants.MapObjectMinScale,
            Constants.MapObjectMaxScale,
            8
        );
        s.writeMapType(data.type);
        s.writeBits(data.ori, 2);
        s.writeBits(data.layer, 2);
        s.writeUint8(data.goreKills);
    },
    (_s, _data) => { },
    (s, data) => {
        data.pos = s.readVec(0, 0, 1024, 1024, 16);
        data.scale = s.readFloat(
            Constants.MapObjectMinScale,
            Constants.MapObjectMaxScale,
            8
        );
        data.type = s.readMapType();
        data.ori = s.readBits(2);
        data.layer = s.readBits(2);
        data.goreKills = s.readUint8();
    }
);
setSerializeFns(
    GameObject.Type.Projectile,
    0,
    /**
     * @param {BitStream} s
     * @param {import("../server/src/objects/projectile").Projectile} data
    **/
    (s, data) => {
        s.writeVec(data.pos, 0, 0, 1024, 1024, 16);
        s.writeFloat(data.posZ, 0, GameConfig.projectile.maxHeight, 10);
        s.writeUnitVec(data.dir, 7);
    },
    /**
     * @param {BitStream} s
     * @param {import("../server/src/objects/projectile").Projectile} data
    **/
    (s, data) => {
        s.writeGameType(data.type);
        s.writeBits(data.layer, 2);
        s.writeBits(0, 4);
    },
    (s, data) => {
        data.pos = s.readVec(0, 0, 1024, 1024, 16);
        data.posZ = s.readFloat(0, GameConfig.projectile.maxHeight, 10);
        data.dir = s.readUnitVec(7);
    },
    (s, data) => {
        data.type = s.readGameType();
        data.layer = s.readBits(2);
        s.readBits(4);
    }
);
setSerializeFns(
    GameObject.Type.Smoke,
    0,
    /**
     * @param {BitStream} s
     * @param {import("../server/src/objects/smoke").Smoke} data
    **/
    (s, data) => {
        s.writeVec(data.pos, 0, 0, 1024, 1024, 16);
        s.writeFloat(data.rad, 0, Constants.SmokeMaxRad, 8);
    },
    /**
     * @param {BitStream} s
     * @param {import("../server/src/objects/smoke").Smoke} data
    **/
    (s, data) => {
        s.writeBits(data.layer, 2);
        s.writeBits(data.interior, 6);
    },
    (s, data) => {
        data.pos = s.readVec(0, 0, 1024, 1024, 16);
        data.rad = s.readFloat(0, Constants.SmokeMaxRad, 8);
    },
    (s, data) => {
        data.layer = s.readBits(2);
        data.interior = s.readBits(6);
    }
);
setSerializeFns(
    GameObject.Type.Airdrop,
    0,
    /**
     * @param {BitStream} s
     * @param {import("../server/src/objects/airdrop").Airdrop} data
    **/
    (s, data) => {
        s.writeFloat(data.fallT, 0, 1, 7);
        s.writeBoolean(data.landed);
    },
    /**
     * @param {BitStream} s
     * @param {import("../server/src/objects/airdrop").Airdrop} data
    **/
    (s, data) => {
        s.writeVec(data.pos, 0, 0, 1024, 1024, 16);
    },
    (s, data) => {
        data.fallT = s.readFloat(0, 1, 7);
        data.landed = s.readBoolean();
    },
    (s, data) => {
        data.pos = s.readVec(0, 0, 1024, 1024, 16);
    }
);

/**
 * @enum
 */
export const MsgType = {
    None: 0,
    Join: 1,
    Disconnect: 2,
    Input: 3,
    Edit: 4,
    Joined: 5,
    Update: 6,
    Kill: 7,
    GameOver: 8,
    Pickup: 9,
    Map: 10,
    Spectate: 11,
    DropItem: 12,
    Emote: 13,
    PlayerStats: 14,
    AdStatus: 15,
    Loadout: 16,
    RoleAnnouncement: 17,
    Stats: 18,
    UpdatePass: 19,
    AliveCounts: 20,
    PerkModeRoleSelect: 21
};

export class JoinMsg {
    constructor() {
        /** * @type {number} */
        this.protocol = 0;
        /** * @type {string} */
        this.matchPriv = "";
        /** * @type {string} */
        this.loadoutPriv = "";
        /** * @type {string} */
        this.questPriv = "";
        /** * @type {string} */
        this.name = "";
        /** * @type {boolean} */
        this.useTouch = false;
        /** * @type {boolean} */
        this.isMobile = false;
        /** * @type {boolean} */
        this.bot = false;
        /** * @type {string[]} */
        this.emotes = [];
    }

    /**
     * @param {BitStream} s
    **/
    deserialize(s) {
        this.protocol = s.readUint32();
        this.matchPriv = s.readString();
        this.loadoutPriv = s.readString();
        this.questPriv = s.readString();
        this.name = s.readString(Constants.PlayerNameMaxLen);
        this.useTouch = s.readBoolean();
        this.isMobile = s.readBoolean();
        this.bot = s.readBoolean();
        this.emotes = [];
        const count = s.readUint8();

        for (let i = 0; i < count; i++) {
            const emote = s.readGameType();
            this.emotes.push(emote);
        }
        s.readAlignToNextByte();
    }

    /**
     * @param {BitStream} s
    **/
    serialize(s) {
        s.writeUint32(this.protocol);
        s.writeString(this.matchPriv);
        s.writeString(this.loadoutPriv);
        s.writeString(this.questPriv);
        s.writeString(this.name, Constants.PlayerNameMaxLen);
        s.writeBoolean(this.useTouch);
        s.writeBoolean(this.isMobile);
        s.writeBoolean(this.bot);

        s.writeUint8(this.emotes.length);
        for (const emote of this.emotes) {
            s.writeGameType(emote);
        }
        s.writeAlignToNextByte();
    }
}

export class DisconnectMsg {
    constructor() {
        /** * @type {string} */
        this.reason = "";
    }

    /**
     * @param {BitStream} s
    **/
    serialize(s) {
        s.writeString(this.reason);
    }

    /**
     * @param {BitStream} s
    **/
    deserialize(s) {
        this.reason = s.readString();
    }
}

export class InputMsg {
    constructor() {
        this.seq = 0;
        /** @type {boolean} */
        this.moveLeft = false;
        /** @type {boolean} */
        this.moveRight = false;
        /** @type {boolean} */
        this.moveUp = false;
        /** @type {boolean} */
        this.moveDown = false;
        /** @type {boolean} */
        this.shootStart = false;
        /** @type {boolean} */
        this.shootHold = false;
        /** @type {boolean} */
        this.portrait = false;
        /** @type {boolean} */
        this.touchMoveActive = false;
        /** @type {import("./utils/v2").Vec2} */
        this.touchMoveDir = v2.create(1, 0);
        /** @type {number} */
        this.touchMoveLen = 255;
        /** @type {import("./utils/v2").Vec2} */
        this.toMouseDir = v2.create(1, 0);
        /** @type {number} */
        this.toMouseLen = 0;
        /** @type {number[]} */
        this.inputs = [];
        /** @type {string} */
        this.useItem = "";
    }

    addInput(input) {
        if (
            this.inputs.length < 7 &&
            !this.inputs.includes(input)
        ) {
            this.inputs.push(input);
        }
    }

    /**
     * @param {BitStream} s
    **/
    serialize(s) {
        s.writeUint8(this.seq);
        s.writeBoolean(this.moveLeft);
        s.writeBoolean(this.moveRight);
        s.writeBoolean(this.moveUp);
        s.writeBoolean(this.moveDown);

        s.writeBoolean(this.shootStart);
        s.writeBoolean(this.shootHold);

        s.writeBoolean(this.portrait);
        s.writeBoolean(this.touchMoveActive);
        if (this.touchMoveActive) {
            s.writeUnitVec(this.touchMoveDir, 8);
            s.writeUint8(this.touchMoveLen);
        }
        s.writeUnitVec(this.toMouseDir, 10);
        s.writeFloat(this.toMouseLen, 0, Constants.MouseMaxDist, 8);

        s.writeBits(this.inputs.length, 4);
        for (let t = 0; t < this.inputs.length; t++) {
            s.writeUint8(this.inputs[t]);
        }

        s.writeGameType(this.useItem);

        s.writeBits(0, 6);
    }

    /**
     * @param {BitStream} s
    **/
    deserialize(s) {
        this.seq = s.readUint8();
        this.moveLeft = s.readBoolean();
        this.moveRight = s.readBoolean();
        this.moveUp = s.readBoolean();
        this.moveDown = s.readBoolean();

        this.shootStart = s.readBoolean();
        this.shootHold = s.readBoolean();

        this.portrait = s.readBoolean();
        this.touchMoveActive = s.readBoolean();
        if (this.touchMoveActive) {
            this.touchMoveDir = s.readUnitVec(8);
            this.touchMoveLen = s.readUint8();
        }
        this.toMouseDir = s.readUnitVec(10);
        this.toMouseLen = s.readFloat(0, Constants.MouseMaxDist, 8);

        const length = s.readBits(4);
        for (let i = 0; i < length; i++) {
            this.inputs.push(s.readUint8());
        }

        this.useItem = s.readGameType();

        s.readBits(6);
    }
}

export class DropItemMsg {
    constructor() {
        /** * @type {string} */
        this.item = "";
        /** * @type {number} */
        this.weapIdx = 0;
    }

    /**
     * @param {BitStream} s
    **/
    serialize(s) {
        s.writeGameType(this.item);
        s.writeUint8(this.weapIdx);
        s.writeBits(0, 6);
    }

    /**
     * @param {BitStream} s
    **/
    deserialize(s) {
        this.item = s.readGameType();
        this.weapIdx = s.readUint8();
        s.readBits(6);
    }
}

export class PerkModeRoleSelectMsg {
    constructor() {
        /** * @type {string} */
        this.role = "";
    }

    /**
     * @param {BitStream} s
    **/
    serialize(s) {
        s.writeGameType(this.role);
        s.writeBits(0, 6);
    }

    /**
     * @param {BitStream} s
    **/
    deserialize(s) {
        this.role = s.readGameType();
        s.readBits(6);
    }
}

export class EmoteMsg {
    constructor() {
        /** * @type {import("./utils/v2").Vec2} */
        this.pos = v2.create(0, 0);
        /** @type {string} */
        this.type = "";
        /** @type {boolean} */
        this.isPing = false;
    }

    /**
     * @param {BitStream} s
    **/
    serialize(s) {
        s.writeVec(this.pos, 0, 0, 1024, 1024, 16);
        s.writeGameType(this.type);
        s.writeBoolean(this.isPing);
        s.writeBits(0, 5);
    }

    /**
     * @param {BitStream} s
    **/
    deserialize(s) {
        this.pos = s.readVec(0, 0, 1024, 1024, 16);
        this.type = s.readGameType();
        this.isPing = s.readBoolean();
        s.readBits(5);
    }
}

export class JoinedMsg {
    constructor() {
        /** @type {number} */
        this.teamMode = 0;
        /** @type {number} */
        this.playerId = 0;
        /** @type {boolean} */
        this.started = false;
        /** @type {string[]} */
        this.emotes = [];
    }

    /**
     * @param {BitStream} s
    **/
    serialize(s) {
        s.writeUint8(this.teamMode);
        s.writeUint16(this.playerId);
        s.writeBoolean(this.started);
        s.writeUint8(this.emotes.length);
        for (const emote of this.emotes) {
            s.writeGameType(emote);
        }
    }

    /**
     * @param {BitStream} s
    **/
    deserialize(s) {
        this.teamMode = s.readUint8();
        this.playerId = s.readUint16();
        this.started = s.readBoolean();
        const count = s.readUint8();
        for (let i = 0; i < count; i++) {
            const emote = s.readGameType();
            this.emotes.push(emote);
        }
        s.readAlignToNextByte();
    }
}

/**
 * @param {BitStream} s
 * @param {import("./utils/terrainGen").MapRiverData} data
 */
function serializeMapRiver(s, data) {
    s.writeFloat32(data.width);
    s.writeUint8(data.looped);
    s.writeUint8(data.points.length);

    for (const point of data.points) {
        s.writeVec(point, 0, 0, 1024, 1024, 16);
    }
}

/**
 * @param {BitStream} s
 * @param {import("./utils/terrainGen").MapRiverData} data
 */
function deserializeMapRiver(s, data) {
    data.width = s.readFloat32();
    data.looped = s.readUint8();
    data.points = [];
    for (let r = s.readUint8(), a = 0; a < r; a++) {
        const i = s.readVec(0, 0, 1024, 1024, 16);
        data.points.push(i);
    }
}

/**
 * @param {BitStream} s
 */
function serializeMapPlace(s, place) {
    s.writeString(place.name);
    s.writeVec(place.pos, 0, 0, 1024, 1024, 16);
}

/**
 * @param {BitStream} s
 */
function deserializeMapPlaces(s, place) {
    place.name = s.readString();
    place.pos = s.readVec(0, 0, 1024, 1024, 16);
}

/**
 * @param {BitStream} s
 */
function serializeMapGroundPatch(s, patch) {
    s.writeVec(patch.min, 0, 0, 1024, 1024, 16);
    s.writeVec(patch.max, 0, 0, 1024, 1024, 16);
    s.writeUint32(patch.color);
    s.writeFloat32(patch.roughness);
    s.writeFloat32(patch.offsetDist);
    s.writeBits(patch.order, 7);
    s.writeBoolean(patch.useAsMapShape);
}

/**
 * @param {BitStream} s
 */
function deserializeMapGroundPatch(s, patch) {
    patch.min = s.readVec(0, 0, 1024, 1024, 16);
    patch.max = s.readVec(0, 0, 1024, 1024, 16);
    patch.color = s.readUint32();
    patch.roughness = s.readFloat32();
    patch.offsetDist = s.readFloat32();
    patch.order = s.readBits(7);
    patch.useAsMapShape = s.readBoolean();
}

/**
 * @param {BitStream} s
 */
function serializeMapObj(s, obj) {
    s.writeVec(obj.pos, 0, 0, 1024, 1024, 16);
    s.writeFloat(obj.scale, Constants.MapObjectMinScale, Constants.MapObjectMaxScale, 8);
    s.writeMapType(obj.type);
    s.writeBits(obj.ori, 2);
    s.writeBits(0, 2); // Padding
}

/**
 * @param {BitStream} s
 */
function deserializeMapObj(s, data) {
    data.pos = s.readVec(0, 0, 1024, 1024, 16);
    data.scale = s.readFloat(Constants.MapObjectMinScale, Constants.MapObjectMaxScale, 8);
    data.type = s.readMapType();
    data.ori = s.readBits(2);
    s.readBits(2);
}

export class MapMsg {
    constructor() {
        /** * @type {string} */
        this.mapName = "";
        /** * @type {number} */
        this.seed = 0;
        /** * @type {number} */
        this.width = 0;
        /** * @type {number} */
        this.height = 0;
        /** * @type {number} */
        this.shoreInset = 0;
        /** * @type {number} */
        this.grassInset = 0;
        /** * @type {import("./utils/terrainGen").MapRiverData[]} */
        this.rivers = [];
        this.places = [];
        this.objects = [];
        this.groundPatches = [];
    }

    /**
     * @param {BitStream} s
     */
    serialize(s) {
        s.writeString(this.mapName, Constants.MapNameMaxLen);
        s.writeUint32(this.seed);
        s.writeUint16(this.width);
        s.writeUint16(this.height);
        s.writeUint16(this.shoreInset);
        s.writeUint16(this.grassInset);

        // Rivers
        s.writeUint8(this.rivers.length);
        for (const river of this.rivers) {
            serializeMapRiver(s, river);
        }

        // Places
        s.writeUint8(this.places.length);
        for (const place of this.places) {
            serializeMapPlace(s, place);
        }

        // Objects
        s.writeUint16(this.objects.length);
        for (const obj of this.objects) {
            serializeMapObj(s, obj);
        }

        // GroundPatches
        s.writeUint8(this.groundPatches.length);
        for (const patch of this.groundPatches) {
            serializeMapGroundPatch(s, patch);
        }
    }

    /**
     * @param {BitStream} s
     */
    deserialize(s) {
        this.mapName = s.readString(Constants.MapNameMaxLen);
        this.seed = s.readUint32();
        this.width = s.readUint16();
        this.height = s.readUint16();
        this.shoreInset = s.readUint16();
        this.grassInset = s.readUint16();
        for (let i = s.readUint8(), r = 0; r < i; r++) {
            const river = {};
            deserializeMapRiver(s, river);
            this.rivers.push(river);
        }
        for (let i = s.readUint8(), o = 0; o < i; o++) {
            const place = {};
            deserializeMapPlaces(s, place);
            this.places.push(place);
        }
        for (let i = s.readUint16(), l = 0; l < i; l++) {
            const obj = {};
            deserializeMapObj(s, obj);
            this.objects.push(obj);
        }
        for (let i = s.readUint8(), p = 0; p < i; p++) {
            const patch = {};
            deserializeMapGroundPatch(s, patch);
            this.groundPatches.push(patch);
        }
    }
}

/**
* @param {BitStream} s
* @param {import("../server/src/objects/player").Player} data
**/
function serializeActivePlayer(s, data) {
    s.writeBoolean(data.dirty.health);
    if (data.dirty.health) s.writeFloat(data.health, 0, 100, 8);

    s.writeBoolean(data.dirty.boost);
    if (data.dirty.boost) s.writeFloat(data.boost, 0, 100, 8);

    s.writeBoolean(data.dirty.zoom);
    if (data.dirty.zoom) s.writeUint8(data.zoom);

    s.writeBoolean(data.dirty.action);
    if (data.dirty.action) {
        s.writeFloat(data.action.time, 0, Constants.ActionMaxDuration, 8);
        s.writeFloat(data.action.duration, 0, Constants.ActionMaxDuration, 8);
        s.writeUint16(data.action.targetId);
    }

    s.writeBoolean(data.dirty.inventory);
    if (data.dirty.inventory) {
        s.writeGameType(data.scope);
        for (const key of Object.keys(GameConfig.bagSizes)) {
            const hasItem = data.inventory[key] > 0;
            s.writeBoolean(hasItem);
            if (hasItem) s.writeBits(data.inventory[key], 9);
        }
    }

    s.writeBoolean(data.dirty.weapons);
    if (data.dirty.weapons) {
        s.writeBits(data.curWeapIdx, 2);
        for (let i = 0; i < GameConfig.WeaponSlot.Count; i++) {
            s.writeGameType(data.weapons[i].type);
            s.writeUint8(data.weapons[i].ammo);
        }
    }

    s.writeBoolean(data.dirty.spectatorCount);
    if (data.dirty.spectatorCount) {
        s.writeUint8(data.spectatorCount);
    }

    s.writeAlignToNextByte();
}

function deserializeActivePlayer(s, data) {
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
        data.action = {};
        data.action.time = s.readFloat(0, Constants.ActionMaxDuration, 8);
        data.action.duration = s.readFloat(0, Constants.ActionMaxDuration, 8);
        data.action.targetId = s.readUint16();
    }
    data.inventoryDirty = s.readBoolean();
    if (data.inventoryDirty) {
        data.scope = s.readGameType();
        data.inventory = {};
        for (
            let r = Object.keys(GameConfig.bagSizes), a = 0;
            a < r.length;
            a++
        ) {
            const i = r[a];
            let o = 0;
            if (s.readBoolean()) {
                o = s.readBits(9);
            }
            data.inventory[i] = o;
        }
    }
    data.weapsDirty = s.readBoolean();
    if (data.weapsDirty) {
        data.curWeapIdx = s.readBits(2);
        data.weapons = [];
        for (let i = 0; i < GameConfig.WeaponSlot.Count; i++) {
            const n = {};
            n.type = s.readGameType();
            n.ammo = s.readUint8();
            data.weapons.push(n);
        }
    }
    data.spectatorCountDirty = s.readBoolean();
    if (data.spectatorCountDirty) {
        data.spectatorCount = s.readUint8();
    }
    s.readAlignToNextByte();
}

function serializePlayerStatus(s, data) {
    s.writeUint8(data.length);
    for (const info of data) {
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
}

function deserializePlayerStatus(s, data) {
    data.players = [];
    for (let r = s.readUint8(), a = 0; a < r; a++) {
        const i = {};
        i.hasData = s.readBoolean();
        if (i.hasData) {
            i.pos = s.readVec(0, 0, 1024, 1024, 11);
            i.visible = s.readBoolean();
            i.dead = s.readBoolean();
            i.downed = s.readBoolean();
            i.role = "";
            if (s.readBoolean()) {
                i.role = s.readGameType();
            }
        }
        data.players.push(i);
    }
    s.readAlignToNextByte();
}

function serializeGroupStatus(s, data) {
    s.writeUint8(data.length);

    for (const status of data) {
        s.writeFloat(status.health, 0, 100, 7);
        s.writeBoolean(status.disconnected);
    }
}

function deserializeGroupStatus(s, data) {
    data.players = [];
    for (let r = s.readUint8(), a = 0; a < r; a++) {
        const i = {};
        i.health = s.readFloat(0, 100, 7);
        i.disconnected = s.readBoolean();
        data.players.push(i);
    }
}

function serializePlayerInfo(s, data) {
    s.writeUint16(data.id);
    s.writeUint8(data.teamId);
    s.writeUint8(data.groupId);
    s.writeString(data.name);

    s.writeGameType(data.loadout.heal);
    s.writeGameType(data.loadout.boost);

    s.writeAlignToNextByte();
}

function deserializePlayerInfo(s, data) {
    data.playerId = s.readUint16();
    data.teamId = s.readUint8();
    data.groupId = s.readUint8();
    data.name = s.readString();
    data.loadout = {};
    data.loadout.heal = s.readGameType();
    data.loadout.boost = s.readGameType();
    s.readAlignToNextByte();
}

function serializeGasData(s, data) {
    s.writeUint8(data.mode);
    s.writeFloat32(data.duration);
    s.writeVec(data.posNew, 0, 0, 1024, 1024, 16);
    s.writeVec(data.posNew, 0, 0, 1024, 1024, 16);
    s.writeFloat(data.radOld, 0, 2048, 16);
    s.writeFloat(data.radNew, 0, 2048, 16);
}

export function deserializeGasData(s, data) {
    data.mode = s.readUint8();
    data.duration = s.readFloat32();
    data.posOld = s.readVec(0, 0, 1024, 1024, 16);
    data.posNew = s.readVec(0, 0, 1024, 1024, 16);
    data.radOld = s.readFloat(0, 2048, 16);
    data.radNew = s.readFloat(0, 2048, 16);
}

const UpdateExtFlags = {
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

export class UpdateMsg {
    constructor() {
        this.serializedObjectCache = null;
        this.objectReg = null;
        this.clientPlayer = null;
        this.activePlayer = null;
        this.grid = null;
        this.playerBarn = null;
        this.bulletBarn = null;
        this.gas = null;
        this.map = null;
        this.delObjIds = [];
        /** * @type {import("../server/src/objects/gameObject").BaseGameObject[]} */
        this.fullObjects = [];
        /** * @type {import("../server/src/objects/gameObject").BaseGameObject[]} */
        this.partObjects = [];
        this.activePlayerId = 0;
        this.activePlayerIdDirty = false;
        this.activePlayerData = {};
        this.aliveCounts = [];
        this.aliveDirty = false;
        this.gasData = {};
        this.gasDirty = false;
        this.gasT = 0;
        this.gasTDirty = false;
        this.playerInfos = [];
        this.deletedPlayerIds = [];
        this.playerStatus = {};
        this.playerStatusDirty = false;
        this.groupStatus = {};
        this.groupStatusDirty = false;
        /** * @type {import("../server/src/objects/bullet").Bullet[]} */
        this.bullets = [];
        /** * @type {import("../server/src/objects/explosion").Explosion[]} */
        this.explosions = [];
        /** * @type {import("../server/src/objects/player").Emote[]} */
        this.emotes = [];
        this.planes = [];
        this.airstrikeZones = [];
        this.mapIndicators = [];
        this.killLeaderId = 0;
        this.killLeaderKills = 0;
        this.killLeaderDirty = false;
        this.ack = 0;
    }

    /**
     * @param {BitStream} s
    **/
    serialize(s) {
        let flags = 0;
        const flagsIdx = s.byteIndex;
        s.writeUint16(flags);

        if (this.delObjIds.length) {
            s.writeUint16(this.delObjIds.length);
            for (const id of this.delObjIds) {
                s.writeUint16(id);
            }
            flags |= UpdateExtFlags.DeletedObjects;
        }

        if (this.fullObjects.length) {
            s.writeUint16(this.fullObjects.length);
            for (const obj of this.fullObjects) {
                s.writeUint8(obj.__type);
                s.writeUint16(obj.id);
                ObjectSerializeFns[obj.__type].serializePart(s, obj);
                ObjectSerializeFns[obj.__type].serializeFull(s, obj);
            }
            flags |= UpdateExtFlags.FullObjects;
        }

        s.writeUint16(this.partObjects.length);
        for (const obj of this.partObjects) {
            s.writeUint16(obj.id);
            ObjectSerializeFns[obj.__type].serializePart(s, obj);
        }

        if (this.activePlayerIdDirty) {
            s.writeUint16(this.activePlayerId);
            flags |= UpdateExtFlags.ActivePlayerId;
        }

        serializeActivePlayer(s, this.activePlayerData);

        if (this.gasDirty) {
            serializeGasData(s, this.gas);
            flags |= UpdateExtFlags.Gas;
        }

        if (this.gasTDirty) {
            s.writeFloat(this.gasT, 0, 1, 16);
            flags |= UpdateExtFlags.GasCircle;
        }

        if (this.playerInfos.length) {
            s.writeUint8(this.playerInfos.length);
            for (const info of this.playerInfos) {
                serializePlayerInfo(s, info);
            }
            flags |= UpdateExtFlags.PlayerInfos;
        }

        if (this.deletedPlayerIds.length) {
            s.writeUint8(this.deletedPlayerIds.length);
            for (const id of this.deletedPlayerIds) {
                s.writeUint16(id);
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

            for (const bullet of this.bullets) {
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
                    s.writeGameType(bullet.sourceType);
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
            for (const explosion of this.explosions) {
                s.writeVec(explosion.pos, 0, 0, 1024, 1024, 16);
                s.writeGameType(explosion.type);
                s.writeBits(explosion.layer, 2);
                s.writeAlignToNextByte();
            }
            flags |= UpdateExtFlags.Explosions;
        }

        if (this.emotes.length) {
            s.writeUint8(this.emotes.length);
            for (const emote of this.emotes) {
                s.writeUint16(emote.playerId);
                s.writeGameType(emote.type);
                s.writeGameType(emote.itemType);
                s.writeBoolean(emote.isPing);

                if (emote.isPing) s.writeVec(emote.pos, 0, 0, 1024, 1024, 16);
                s.writeAlignToNextByte();
            }
            flags |= UpdateExtFlags.Emotes;
        }

        if (this.planes.length) {
            s.writeUint8(this.planes.length);
            for (const plane of this.planes) {
                s.writeUint8(plane.id);
                s.writeVec(plane.pos, 0, 0, 2048, 2048, 10);
                s.writeUnitVec(plane.dir, 8);
                s.writeBoolean(plane.actionComplete);
                s.writeBits(plane.action, 3);
            }
            flags |= UpdateExtFlags.Planes;
        }

        if (this.airstrikeZones.length) {
            s.writeUint8(this.airstrikeZones.length);
            for (const zone of this.airstrikeZones) {
                s.writeVec(zone.pos, 0, 0, 1024, 1024, 12);
                s.writeFloat(zone.rad, 0, Constants.AirstrikeZoneMaxRad, 8);
                s.writeFloat(zone.duration, 0, Constants.AirstrikeZoneMaxDuration, 8);
            }
            flags |= UpdateExtFlags.AirstrikeZones;
        }

        if (this.mapIndicators.length) {
            s.writeUint8(this.mapIndicators.length);
            for (const indicator of this.mapIndicators) {
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

    /**
     * @param {BitStream} s
     * @param {import("../client/src/objects/objectPool").Creator} objectCreator
    **/
    deserialize(s, objectCreator) {
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
                const data = {};
                data.__type = s.readUint8();
                data.__id = s.readUint16();
                ObjectSerializeFns[data.__type].deserializePart(s, data);
                ObjectSerializeFns[data.__type].deserializeFull(s, data);
                this.fullObjects.push(data);
            }
        }

        for (let count = s.readUint16(), i = 0; i < count; i++) {
            const data = {};
            data.__id = s.readUint16();
            const type = objectCreator.getTypeById(data.__id, s);
            ObjectSerializeFns[type].deserializePart(s, data);
            this.partObjects.push(data);
        }

        if ((flags & UpdateExtFlags.ActivePlayerId) != 0) {
            this.activePlayerId = s.readUint16();
            this.activePlayerIdDirty = true;
        }

        const activePlayerData = {};
        deserializeActivePlayer(s, activePlayerData);
        this.activePlayerData = activePlayerData;

        if ((flags & UpdateExtFlags.Gas) != 0) {
            const f = {};
            deserializeGasData(s, f);
            this.gasData = f;
            this.gasDirty = true;
        }

        if ((flags & UpdateExtFlags.GasCircle) != 0) {
            this.gasT = s.readFloat(0, 1, 16);
            this.gasTDirty = true;
        }

        if ((flags & UpdateExtFlags.PlayerInfos) != 0) {
            for (let i = s.readUint8(), b = 0; b < i; b++) {
                const x = {};
                deserializePlayerInfo(s, x);
                this.playerInfos.push(x);
            }
        }

        if ((flags & UpdateExtFlags.DeletePlayerIds) != 0) {
            for (let count = s.readUint8(), i = 0; i < count; i++) {
                const id = s.readUint16();
                this.deletedPlayerIds.push(id);
            }
        }

        if ((flags & UpdateExtFlags.PlayerStatus) != 0) {
            const playerStatus = {};
            deserializePlayerStatus(s, playerStatus);
            this.playerStatus = playerStatus;
            this.playerStatusDirty = true;
        }

        if ((flags & UpdateExtFlags.GroupStatus) != 0) {
            const groupStatus = {};
            deserializeGroupStatus(s, groupStatus);
            this.groupStatus = groupStatus;
            this.groupStatusDirty = true;
        }

        if ((flags & UpdateExtFlags.Bullets) != 0) {
            for (let count = s.readUint8(), i = 0; i < count; i++) {
                const bullet = {};
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
                const explosion = {};
                explosion.pos = s.readVec(0, 0, 1024, 1024, 16);
                explosion.type = s.readGameType();
                explosion.layer = s.readBits(2);
                s.readAlignToNextByte();
                this.explosions.push(explosion);
            }
        }

        if ((flags & UpdateExtFlags.Emotes) != 0) {
            for (let count = s.readUint8(), i = 0; i < count; i++) {
                const emote = {};
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
                const plane = {};
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
                const airStrikeZone = {};
                airStrikeZone.pos = s.readVec(0, 0, 1024, 1024, 12);
                airStrikeZone.rad = s.readFloat(
                    0,
                    Constants.AirstrikeZoneMaxRad,
                    8
                );
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
                const mapIndicator = {};
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

export class KillMsg {
    constructor() {
        /** * @type {string} */
        this.itemSourceType = "";
        /** * @type {string} */
        this.mapSourceType = "";
        /** * @type {number} */
        this.damageType = 0;
        /** * @type {number} */
        this.targetId = 0;
        /** * @type {number} */
        this.killerId = 0;
        /** * @type {number} */
        this.killCreditId = 0;
        /** * @type {number} */
        this.killerKills = 0;
        /** * @type {boolean} */
        this.downed = false;
        /** * @type {boolean} */
        this.killed = false;
    }

    /**
     * @param {BitStream} s
    **/
    serialize(s) {
        s.writeUint8(this.damageType);
        s.writeGameType(this.itemSourceType);
        s.writeMapType(this.mapSourceType);
        s.writeUint16(this.targetId);
        s.writeUint16(this.killerId);
        s.writeUint16(this.killCreditId);
        s.writeUint8(this.killerKills);
        s.writeBoolean(this.downed);
        s.writeBoolean(this.killed);
        s.writeAlignToNextByte();
    }

    /**
     * @param {BitStream} s
    **/
    deserialize(s) {
        this.damageType = s.readUint8();
        this.itemSourceType = s.readGameType();
        this.mapSourceType = s.readMapType();
        this.targetId = s.readUint16();
        this.killerId = s.readUint16();
        this.killCreditId = s.readUint16();
        this.killerKills = s.readUint8();
        this.downed = s.readBoolean();
        this.killed = s.readBoolean();
        s.readAlignToNextByte();
    }
}

export class PlayerStatsMsg {
    constructor() {
        /** * @type {number} */
        this.playerId = 0;
        /**
         * @type {{ timeAlive: number, kills: number, dead: boolean, damageDealt: number, damageTaken: number }}
         */
        this.playerStats = {
            playerId: 0,
            timeAlive: 0,
            kills: 0,
            dead: false,
            damageDealt: 0,
            damageTaken: 0
        };
    }

    /**
     * @param {BitStream} s
    **/
    serialize(s) {
        s.writeUint16(this.playerId);
        s.writeUint16(this.playerStats.timeAlive);
        s.writeUint8(this.playerStats.kills);
        s.writeUint8(this.playerStats.dead);
        s.writeUint16(this.playerStats.damageDealt);
        s.writeUint16(this.playerStats.damageTaken);
    }

    /**
     * @param {BitStream} s
    **/
    deserialize(s) {
        const playerStats = {};
        playerStats.playerId = s.readUint16();
        playerStats.timeAlive = s.readUint16();
        playerStats.kills = s.readUint8();
        playerStats.dead = s.readUint8();
        playerStats.damageDealt = s.readUint16();
        playerStats.damageTaken = s.readUint16();
        this.playerStats = playerStats;
    }
}

export class GameOverMsg {
    constructor() {
        /** * @type {number} */
        this.teamId = 0;
        /** * @type {number} */
        this.teamRank = 0;
        /** * @type {boolean} */
        this.gameOver = false;
        /** * @type {number} */
        this.winningTeamId = 0;
        /**
         * @type {PlayerStatsMsg["playerStats"][]}
         */
        this.playerStats = [];
    }

    /**
     * @param {BitStream} s
    **/
    serialize(s) {
        s.writeUint8(this.teamId);
        s.writeUint8(this.teamRank);
        s.writeUint8(+this.gameOver);
        s.writeUint8(this.winningTeamId);

        s.writeUint8(this.playerStats.length);
        for (const stats of this.playerStats) {
            const statsMsg = new PlayerStatsMsg();
            statsMsg.playerId = stats.playerId;
            statsMsg.playerStats = stats;
            statsMsg.serialize(s);
        }
    }

    /**
     * @param {BitStream} s
    **/
    deserialize(s) {
        this.teamId = s.readUint8();
        this.teamRank = s.readUint8();
        this.gameOver = s.readUint8();
        this.winningTeamId = s.readUint8();
        for (let count = s.readUint8(), i = 0; i < count; i++) {
            const statsMsg = new PlayerStatsMsg();
            statsMsg.deserialize(s);
            this.playerStats.push(statsMsg.playerStats);
        }
    }
}

export const PickupMsgType = {
    Full: 0,
    AlreadyOwned: 1,
    AlreadyEquipped: 2,
    BetterItemEquipped: 3,
    Success: 4,
    GunCannotFire: 5
};

export class PickupMsg {
    constructor() {
        /** * @type {number} */
        this.type = 0;
        /** * @type {string} */
        this.item = "";
        /** * @type {number} */
        this.count = 0;
    }

    /**
     * @param {BitStream} s
    **/
    serialize(s) {
        s.writeUint8(this.type);
        s.writeGameType(this.item);
        s.writeUint8(this.count);
        s.writeBits(0, 6);
    }

    /**
     * @param {BitStream} s
    **/
    deserialize(s) {
        this.type = s.readUint8();
        this.item = s.readGameType();
        this.count = s.readUint8();
        s.readBits(6);
    }
}

export class SpectateMsg {
    constructor() {
        /** * @type {boolean} */
        this.specBegin = false;
        /** * @type {boolean} */
        this.specNext = false;
        /** * @type {boolean} */
        this.specPrev = false;
        /** * @type {boolean} */
        this.specForce = false;
    }

    /**
     * @param {BitStream} s
    **/
    serialize(s) {
        s.writeBoolean(this.specBegin);
        s.writeBoolean(this.specNext);
        s.writeBoolean(this.specPrev);
        s.writeBoolean(this.specForce);
        s.writeBits(0, 4);
    }

    /**
     * @param {BitStream} s
    **/
    deserialize(s) {
        s.writeBoolean(this.specBegin);
        s.writeBoolean(this.specNext);
        s.writeBoolean(this.specPrev);
        s.writeBoolean(this.specForce);
        s.writeBits(0, 4);
    }
}

export class RoleAnnouncementMsg {
    constructor() {
        /** * @type {number} */
        this.playerId = 0;
        /** * @type {number} */
        this.killerId = 0;
        /** * @type {string} */
        this.role = "";
        /** * @type {boolean} */
        this.assigned = false;
        /** * @type {boolean} */
        this.killed = false;
    }

    /**
     * @param {BitStream} s
    **/
    serialize(s) {
        s.writeUint16(this.playerId);
        s.writeUint16(this.killerId);
        s.writeGameType(this.role);
        s.writeBoolean(this.assigned);
        s.writeBoolean(this.killed);
        s.writeAlignToNextByte();
    }

    /**
     * @param {BitStream} s
    **/
    deserialize(s) {
        this.playerId = s.readUint16();
        this.killerId = s.readUint16();
        this.role = s.readGameType();
        this.assigned = s.readBoolean();
        this.killed = s.readBoolean();
        s.readAlignToNextByte();
    }
}

export class LoadoutMsg {
    constructor() {
        /** * @type {string} */
        this.emotes = [];
        /** * @type {boolean} */
        this.custom = false;
    }

    /**
     * @param {BitStream} s
    **/
    serialize(s) {
        for (let i = 0; i < GameConfig.EmoteSlot.Count; i++) {
            s.writeGameType(this.emotes[i]);
        }
        s.writeUint8(this.custom);
        s.readAlignToNextByte();
    }

    /**
     * @param {BitStream} s
    **/
    deserialize(s) {
        for (let i = 0; i < GameConfig.EmoteSlot.Count; i++) {
            this.emotes.push(s.readGameType());
        }
        this.custom = s.readUint8();
        s.writeAlignToNextByte();
    }
}

export class StatsMsg {
    constructor() {
        /** * @type {string} */
        this.data = "";
    }

    /**
     * @param {BitStream} s
    **/
    serialize(s) {
        s.writeString(this.data);
    }

    /**
     * @param {BitStream} s
    **/
    deserialize(s) {
        this.data = s.readString();
    }
}

export class AliveCountsMsg {
    constructor() {
        /** * @type {number[]} */
        this.teamAliveCounts = [];
    }

    /**
     * @param {BitStream} s
    **/
    serialize(s) {
        const t = this.teamAliveCounts.length;
        s.writeUint8(t);
        for (let r = 0; r < t; r++) {
            s.writeUint8(this.teamAliveCounts[r]);
        }
    }

    /**
     * @param {BitStream} s
    **/
    deserialize(s) {
        for (let t = s.readUint8(), r = 0; r < t; r++) {
            const a = s.readUint8();
            this.teamAliveCounts.push(a);
        }
    }
}

export class UpdatePassMsg {
    serialize(_e) { }
    deserialize(_e) { }
}

/**
 * @param {boolean} factionMode
 */
export function getPlayerStatusUpdateRate(factionMode) {
    if (factionMode) {
        return 0.5;
    } else {
        return 0.25;
    }
}
