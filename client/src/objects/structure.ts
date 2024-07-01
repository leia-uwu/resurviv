import { MapObjectDefs } from "../../../shared/defs/mapObjectDefs";
import type { StructureDef } from "../../../shared/defs/mapObjectsTyping";
import {
    type AABB,
    type AABBWithHeight,
    type Collider,
    type ColliderWithHeight,
    coldet
} from "../../../shared/utils/coldet";
import { collider } from "../../../shared/utils/collider";
import { mapHelpers } from "../../../shared/utils/mapHelpers";
import { math } from "../../../shared/utils/math";
import { type Vec2, v2 } from "../../../shared/utils/v2";
import type { Ambiance } from "../ambiance";
import type Camera from "../camera";
import { renderBridge, renderMapBuildingBounds, renderWaterEdge } from "../debugHelpers";
import { debugLines } from "../debugLines";
import { device } from "../device";
import type { Ctx, DebugOptions } from "../game";
import type { Map } from "../map";
import type { ObjectData, ObjectType } from "./../../../shared/utils/objectSerializeFns";
import type { AbstractObject, Player } from "./player";

interface Stair {
    collision: AABB;
    center: Vec2;
    downDir: Vec2;
    downAabb: AABB;
    upAabb: AABB;
    noCeilingReveal: boolean;
    lootOnly: boolean;
}

export class Structure implements AbstractObject {
    __id!: number;
    __type!: ObjectType.Structure;
    active!: boolean;

    soundTransitionT!: number;
    soundEnabledT!: number;

    type!: string;
    layer!: number;
    pos!: Vec2;
    rot!: number;
    scale!: number;
    interiorSoundAlt!: boolean;
    interiorSoundEnabled!: boolean;

    aabb!: Collider & { height: number };

    layers!: Array<{
        objId: number;
        collision: ColliderWithHeight;
        underground: boolean;
    }>;

    stairs!: Stair[];

    mask!: AABBWithHeight[];

    init() {
        this.soundTransitionT = 0;
    }

    free() {}

    updateData(
        data: ObjectData<ObjectType.Structure>,
        fullUpdate: boolean,
        isNew: boolean,
        ctx: Ctx
    ) {
        if (fullUpdate) {
            this.type = data.type;
            this.layer = 0;
            this.pos = v2.copy(data.pos);
            this.rot = math.oriToRad(data.ori);
            this.scale = 1;
            this.interiorSoundAlt = data.interiorSoundAlt;
            this.interiorSoundEnabled = data.interiorSoundEnabled;
            if (isNew) {
                this.soundTransitionT = this.interiorSoundAlt ? 1 : 0;
                this.soundEnabledT = this.interiorSoundEnabled ? 1 : 0;
            }
            this.aabb = collider.transform(
                mapHelpers.getBoundingCollider(this.type),
                this.pos,
                this.rot,
                this.scale
            );
            const def = MapObjectDefs[this.type] as StructureDef;
            this.layers = [];
            for (let i = 0; i < def.layers.length; i++) {
                const layer = def.layers[i];
                const objId = data.layerObjIds[i];

                const inheritOri = layer?.inheritOri === undefined || layer.inheritOri;
                const underground =
                    layer.underground !== undefined ? layer.underground : i == 1;
                const pos = v2.add(this.pos, layer.pos);
                const rot = math.oriToRad(inheritOri ? data.ori + layer.ori : layer.ori);
                const collision = collider.transform(
                    mapHelpers.getBoundingCollider(layer.type),
                    pos,
                    rot,
                    1
                );
                this.layers.push({
                    objId,
                    collision,
                    underground
                });
            }
            this.stairs = [];
            for (let i = 0; i < def.stairs.length; i++) {
                const stairsDef = def.stairs[i];
                const stairsCol = collider.transform(
                    stairsDef.collision,
                    this.pos,
                    this.rot,
                    this.scale
                ) as AABBWithHeight;
                const downDir = v2.rotate(stairsDef.downDir, this.rot);
                const childAabbs = coldet.splitAabb(stairsCol, downDir);

                this.stairs.push({
                    collision: stairsCol as AABB & { height: number },
                    center: v2.add(
                        stairsCol.min,
                        v2.mul(v2.sub(stairsCol.max, stairsCol.min), 0.5)
                    ),
                    downDir,
                    downAabb: collider.createAabb(childAabbs[0].min, childAabbs[0].max),
                    upAabb: collider.createAabb(childAabbs[1].min, childAabbs[1].max),
                    noCeilingReveal: !!stairsDef.noCeilingReveal,
                    lootOnly: !!stairsDef.lootOnly
                });
            }
            this.mask = [];
            for (let i = 0; i < def.mask.length; i++) {
                this.mask.push(
                    collider.transform(
                        def.mask[i],
                        this.pos,
                        this.rot,
                        this.scale
                    ) as AABB
                );
            }
            ctx.renderer.layerMaskDirty = true;
        }
    }

    update(dt: number, map: Map, activePlayer: Player, ambience: Ambiance) {
        if ((MapObjectDefs[this.type] as StructureDef).interiorSound) {
            this.updateInteriorSounds(dt, map, activePlayer, ambience);
        }
    }

    updateInteriorSounds(dt: number, map: Map, activePlayer: Player, ambience: Ambiance) {
        const def = MapObjectDefs[this.type] as StructureDef;
        collider.createCircle(activePlayer.pos, 0.001);
        map.buildingPool.getPool();
        const building0 =
            this.layers.length > 0 ? map.getBuildingById(this.layers[0].objId) : null;
        const building1 =
            this.layers.length > 1 ? map.getBuildingById(this.layers[1].objId) : null;
        const maxDist =
            def.interiorSound?.outsideMaxDist !== undefined
                ? def.interiorSound.outsideMaxDist
                : 10;
        const outsideVol =
            def.interiorSound?.outsideVolume !== undefined
                ? def.interiorSound.outsideVolume
                : 0;
        const undergroundVol =
            def.interiorSound?.undergroundVolume !== undefined
                ? def.interiorSound.undergroundVolume
                : 1;

        // Compute weights for the normal (weight0) and filtered (weight1) tracks
        let weight0 = 0;
        let weight1 = 0;
        if (activePlayer.layer != 1) {
            if (building0) {
                // Play the filtered sound when we can't see inside the building,
                // and reduce the volume based on distance from the building.
                const dist = building0.getDistanceToBuilding(activePlayer.pos, maxDist);
                const weight = math.remap(dist, maxDist, 0, 0, 1);
                const onStairs = activePlayer.layer & 2;
                const visionT = building0.ceiling.fadeAlpha;
                weight0 = weight * (1 - visionT);
                weight1 = weight * visionT * (onStairs ? undergroundVol : outsideVol);
            }
        } else if (building1) {
            // Immediately play the filtered track at  full weight when
            // going underground; the filter and reverb effects delay the sound
            // slightly which ends up sounding okay without a crossfade.
            const dist = building1.getDistanceToBuilding(activePlayer.pos, maxDist);
            const weight = math.remap(dist, maxDist, 0, 0, 1);
            weight0 = 0;
            weight1 = weight * undergroundVol;
        }

        // Transition between sound and soundAlt tracks
        const transitionTime =
            def.interiorSound?.transitionTime !== undefined
                ? def.interiorSound.transitionTime
                : 1;
        if (this.interiorSoundAlt) {
            this.soundTransitionT = math.clamp(
                this.soundTransitionT + dt / transitionTime,
                0,
                1
            );
        }
        const transitionWeight = Math.abs(this.soundTransitionT - 0.5) * 2;

        // Fade out the track after it's disabled
        if (!this.interiorSoundEnabled) {
            this.soundEnabledT = math.clamp(this.soundEnabledT - dt * 0.5, 0, 1);
        }

        // Choose the actual track based on the state of the transition
        const sound =
            this.soundTransitionT > 0.5
                ? def.interiorSound?.soundAlt
                : def.interiorSound?.sound;

        // Set the track data
        const track0 = ambience.getTrack("interior_0");
        track0.sound = sound!;
        track0.filter = "";
        track0.weight = sound ? weight0 * transitionWeight * this.soundEnabledT : 0;

        const track1 = ambience.getTrack("interior_1");
        track1.sound = sound!;
        track1.filter = def.interiorSound?.filter!;
        track1.weight = sound ? weight1 * transitionWeight * this.soundEnabledT : 0;
    }

    render(_camera: Camera, debug: DebugOptions, _layer: number) {
        if (device.debug) {
            if (debug.structures?.bounds) {
                renderMapBuildingBounds(this);
            }
            if (debug?.bridge) {
                renderBridge(this);
            }
            if (debug.structures?.waterEdge) {
                renderWaterEdge(this);
            }
            if (debug.structures?.stairs) {
                for (let i = 0; i < this.stairs.length; i++) {
                    debugLines.addCollider(this.stairs[i].downAabb, 0x0000ff, 0);
                    debugLines.addCollider(this.stairs[i].upAabb, 0x00ff00, 0);
                }
            }
        }
    }

    insideStairs(collision: Collider) {
        for (let i = 0; i < this.stairs.length; i++) {
            if (collider.intersect(this.stairs[i]?.collision!, collision)) {
                return true;
            }
        }
        return false;
    }

    insideMask(collision: Collider) {
        for (let i = 0; i < this.mask.length; i++) {
            if (collider.intersect(this.mask[i], collision)) {
                return true;
            }
        }
        return false;
    }
}
