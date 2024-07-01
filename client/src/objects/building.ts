import * as PIXI from "pixi.js-legacy";
import { MapObjectDefs } from "../../../shared/defs/mapObjectDefs";
import type { BuildingDef } from "../../../shared/defs/mapObjectsTyping";
import type { FloorImage } from "../../../shared/defs/types/building";
import type { Collider, ColliderWithHeight } from "../../../shared/utils/coldet";
import { collider } from "../../../shared/utils/collider";
import { collisionHelpers } from "../../../shared/utils/collisionHelpers";
import { mapHelpers } from "../../../shared/utils/mapHelpers";
import { math } from "../../../shared/utils/math";
import type { ObjectData, ObjectType } from "../../../shared/utils/objectSerializeFns";
import { util } from "../../../shared/utils/util";
import { type Vec2, v2 } from "../../../shared/utils/v2";
import type { AudioManager } from "../audioManager";
import type { Camera } from "../camera";
import type { SoundHandle } from "../createJS";
import { renderBridge, renderMapBuildingBounds } from "../debugHelpers";
import { debugLines } from "../debugLines";
import { device } from "../device";
import type { Ctx, DebugOptions } from "../game";
import type { Map } from "../map";
import type { Renderer } from "../renderer";
import type { Obstacle } from "./obstacle";
import type { Emitter, ParticleBarn } from "./particles";
import type { AbstractObject, Player } from "./player";

function step(cur: number, target: number, rate: number) {
    const delta = target - cur;
    const step = delta * rate;
    return Math.abs(step) < 0.001 ? delta : step;
}

type BuildingSprite = PIXI.Sprite & {
    posOffset: Vec2;
    rotOffset: number;
    imgAlpha: number;
    alpha: number;
    defScale: number;
    mirrorY: boolean;
    mirrorX: boolean;
};

export class Building implements AbstractObject {
    __id!: number;
    __type!: ObjectType.Building;
    active!: boolean;

    sprites: Array<{
        active: boolean;
        sprite: PIXI.Sprite;
    }> = [];

    particleEmitters: Emitter[] = [];
    soundEmitters: Array<{
        instance: SoundHandle | null;
        sound: string;
        channel: string;
        pos: Vec2;
        range: { min: number; max: number };
        falloff: number;
        volume: number;
    }> = [];

    isNew!: boolean;
    residue!: PIXI.Sprite | null;
    ceilingDead!: boolean;
    ceilingDamaged!: boolean;
    playedCeilingDeadFx!: boolean;
    playedSolvedPuzzleFx!: boolean;
    hasPuzzle!: boolean;
    puzzleErrSeqModified!: boolean;
    puzzleErrSeq!: number;
    puzzleSolved!: boolean;
    soundEmitterTicker!: number;

    type!: string;
    pos!: Vec2;
    ori!: number;
    rot!: number;
    scale!: number;
    layer!: number;
    occupied!: boolean;

    imgs: Array<{
        sprite: BuildingSprite;
        isCeiling: boolean;
        removeOnDamaged?: boolean;
        zOrd: number;
        zIdx: number;
    }> = [];

    zIdx!: number;
    bounds!: Collider;

    ceiling!: {
        zoomRegions: Array<{
            zoomIn?: Collider | null;
            zoomOut?: Collider | null;
        }>;
        type?: string;
        vision: BuildingDef["ceiling"]["vision"];
        visionTicker: number;
        fadeAlpha: number;
    };

    surfaces!: Array<{
        type: string;
        data: Record<string, unknown>;
        colliders: ColliderWithHeight[];
    }>;

    init() {
        this.isNew = false;
        this.residue = null;
        this.ceilingDead = false;
        this.ceilingDamaged = false;
        this.playedCeilingDeadFx = false;
        this.playedSolvedPuzzleFx = false;
        this.hasPuzzle = false;
        this.puzzleErrSeqModified = false;
        this.puzzleErrSeq = 0;
        this.puzzleSolved = false;
        this.soundEmitterTicker = 0;
    }

    free() {
        for (let i = 0; i < this.sprites.length; i++) {
            const t = this.sprites[i];
            t.active = false;
            t.sprite.visible = false;
            t.sprite.parent?.removeChild(t.sprite);
            t.sprite.removeChildren();
        }
        for (let i = 0; i < this.particleEmitters.length; i++) {
            this.particleEmitters[i].stop();
        }
        this.particleEmitters = [];
        for (let i = 0; i < this.soundEmitters.length; i++) {
            this.soundEmitters[i].instance?.stop();
        }
        this.soundEmitters = [];
    }

    allocSprite() {
        for (let i = 0; i < this.sprites.length; i++) {
            const s = this.sprites[i];
            if (!s.active) {
                s.active = true;
                return s.sprite;
            }
        }
        const sprite = new PIXI.Sprite();
        sprite.anchor.set(0.5, 0.5);
        this.sprites.push({
            active: true,
            sprite
        });
        return sprite;
    }

    updateData(
        data: ObjectData<ObjectType.Building>,
        fullUpdate: boolean,
        isNew: boolean,
        ctx: Ctx
    ) {
        if (fullUpdate) {
            this.type = data.type;
            this.pos = v2.copy(data.pos);
            this.ori = data.ori;
            this.rot = math.oriToRad(data.ori);
            this.scale = 1;
            this.layer = data.layer;
        }
        this.ceilingDead = data.ceilingDead;
        this.ceilingDamaged = data.ceilingDamaged;
        this.occupied = data.occupied;
        this.hasPuzzle = data.hasPuzzle;

        if (this.hasPuzzle) {
            this.puzzleErrSeqModified = data.puzzleErrSeq != this.puzzleErrSeq;
            this.puzzleSolved = data.puzzleSolved;
            this.puzzleErrSeq = data.puzzleErrSeq;
        }

        const def = MapObjectDefs[this.type] as BuildingDef;

        if (isNew) {
            this.isNew = true;
            this.playedCeilingDeadFx =
                def.ceiling.destroy !== undefined &&
                ctx.map.deadCeilingIds.includes(this.__id);
            this.playedSolvedPuzzleFx =
                this.hasPuzzle && ctx.map.solvedPuzzleIds.includes(this.__id);
            const createSpriteFromDef = (imgDef: FloorImage) => {
                const posOffset = imgDef.pos || v2.create(0, 0);
                const rotOffset = math.oriToRad(imgDef.rot || 0);
                const sprite = this.allocSprite() as BuildingSprite;
                if (imgDef.sprite && imgDef.sprite != "none") {
                    sprite.texture = PIXI.Texture.from(imgDef.sprite);
                } else {
                    sprite.texture = PIXI.Texture.EMPTY;
                }
                sprite.tint = imgDef.tint;

                const valueAdjust = ctx.map.getMapDef().biome.valueAdjust;
                if (valueAdjust < 1) {
                    sprite.tint = util.adjustValue(sprite.tint as number, valueAdjust);
                }

                sprite.posOffset = v2.rotate(posOffset, this.rot);
                sprite.rotOffset = rotOffset;
                sprite.imgAlpha = imgDef.alpha;
                sprite.alpha = sprite.imgAlpha;
                sprite.defScale = imgDef.scale;
                sprite.mirrorY = !!imgDef.mirrorY;
                sprite.mirrorX = !!imgDef.mirrorX;
                sprite.visible = true;
                return sprite;
            };
            this.bounds = collider.transform(
                mapHelpers.getBoundingCollider(this.type),
                this.pos,
                this.rot,
                this.scale
            );

            this.zIdx = def.zIdx || 0;

            // Create floor surfaces
            this.surfaces = [] as this["surfaces"];
            for (let i = 0; i < def.floor.surfaces.length; i++) {
                const surfaceDef = def.floor.surfaces[i];
                const surface = {
                    type: surfaceDef.type,
                    data: surfaceDef.data || {},
                    colliders: [] as this["surfaces"][number]["colliders"]
                };
                for (let j = 0; j < surfaceDef.collision.length; j++) {
                    surface.colliders.push(
                        collider.transform(
                            surfaceDef.collision[j],
                            this.pos,
                            this.rot,
                            this.scale
                        )
                    );
                }
                this.surfaces.push(surface);
            }

            // Create ceiling
            const vision = Object.assign(
                {
                    dist: 5.5,
                    width: 2.75,
                    linger: 0,
                    fadeRate: 12
                },
                def.ceiling.vision
            );

            this.ceiling = {
                zoomRegions: [],
                vision,
                visionTicker: 0,
                fadeAlpha: 1
            };

            for (let i = 0; i < def.ceiling.zoomRegions.length; i++) {
                const region = def.ceiling.zoomRegions[i];
                this.ceiling.zoomRegions?.push({
                    zoomIn: region.zoomIn
                        ? collider.transform(
                              region.zoomIn,
                              this.pos,
                              this.rot,
                              this.scale
                          )
                        : null,
                    zoomOut: region.zoomOut
                        ? collider.transform(
                              region.zoomOut,
                              this.pos,
                              this.rot,
                              this.scale
                          )
                        : null
                });
            }

            // Create floor and ceiling images
            this.imgs = [];
            for (let i = 0; i < def.floor.imgs.length; i++) {
                this.imgs.push({
                    sprite: createSpriteFromDef(def.floor.imgs[i]),
                    isCeiling: false,
                    zOrd: this.zIdx,
                    zIdx: this.__id * 100 + i
                });
            }

            for (let i = 0; i < def.ceiling.imgs.length; i++) {
                const imgDef = def.ceiling.imgs[i];
                this.imgs.push({
                    sprite: createSpriteFromDef(imgDef),
                    isCeiling: true,
                    removeOnDamaged: !!imgDef.removeOnDamaged,
                    zOrd: 750 - this.zIdx,
                    zIdx: this.__id * 100 + i
                });
            }

            // Create occupied particle emitters
            const defEmitters = def.occupiedEmitters || [];
            for (let z = 0; z < defEmitters.length; z++) {
                const defEmitter = defEmitters[z];
                const defRot = defEmitter.rot !== undefined ? defEmitter.rot : 0;
                const rot = this.rot + defRot;
                let pos = v2.add(this.pos, v2.rotate(defEmitter.pos, rot));
                const initDir = defEmitter.dir || v2.create(1, 0);
                let dir = v2.rotate(initDir, rot);
                let scale = defEmitter.scale;
                let parent: PIXI.Sprite | null = null;
                if (defEmitter.parentToCeiling) {
                    // Parent to the last ceiling
                    let lastIdx = -1;
                    for (let B = 0; B < this.imgs.length; B++) {
                        if (this.imgs[B].isCeiling) {
                            lastIdx = B;
                        }
                    }
                    if (lastIdx >= 0) {
                        const img = this.imgs[lastIdx];
                        parent = img.sprite;
                        // Parented sprites use a different coordinate system...
                        pos = v2.mul(defEmitter.pos, 32);
                        pos.y *= -1;
                        dir = v2.rotate(v2.create(1, 0), defEmitter.rot);
                        scale = 1 / img.sprite.defScale;
                    }
                }
                const emitter = ctx.particleBarn.addEmitter(defEmitter.type, {
                    pos,
                    dir,
                    scale,
                    layer: defEmitter.layer,
                    parent
                });
                this.particleEmitters.push(emitter);
            }

            // Create sound emitters
            const defSoundEmitters = def.soundEmitters || [];
            for (let i = 0; i < defSoundEmitters.length; i++) {
                const defSound = defSoundEmitters[i];
                const pos = v2.add(this.pos, v2.rotate(defSound.pos, this.rot));
                this.soundEmitters.push({
                    instance: null,
                    sound: defSound.sound,
                    channel: defSound.channel,
                    pos,
                    range: defSound.range,
                    falloff: defSound.falloff,
                    volume: defSound.volume
                });
            }
        }
    }

    update(
        dt: number,
        map: Map,
        particleBarn: ParticleBarn,
        audioManager: AudioManager,
        _ambience: unknown,
        activePlayer: Player,
        renderer: Renderer,
        camera: Camera
    ) {
        // Puzzle effects
        if (this.hasPuzzle) {
            const def = MapObjectDefs[this.type] as BuildingDef;
            // Play puzzle error effects
            if (
                this.puzzleErrSeqModified &&
                ((this.puzzleErrSeqModified = false), !this.isNew)
            ) {
                // Find the nearest puzzle-piece obstacle and play the
                // sound from that location. Fallback to the building location
                // if none can be found.
                let nearestObj: Obstacle | Building = this;
                let nearestDist = v2.length(v2.sub(activePlayer.pos, nearestObj.pos));
                const obstacles = map.obstaclePool.getPool();
                for (let i = 0; i < obstacles.length; i++) {
                    const o = obstacles[i];
                    if (o.active && o.isPuzzlePiece && o.parentBuildingId == this.__id) {
                        const dist = v2.length(v2.sub(activePlayer.pos, o.pos));
                        if (dist < nearestDist) {
                            nearestObj = o;
                            nearestDist = dist;
                        }
                    }
                }
                audioManager.playSound(def.puzzle?.sound.fail!, {
                    channel: "sfx",
                    soundPos: nearestObj.pos,
                    layer: nearestObj.layer,
                    filter: "muffled"
                });
            }

            // Play puzzle solved effects
            if (this.puzzleSolved && !this.playedSolvedPuzzleFx) {
                map.solvedPuzzleIds.push(this.__id);
                this.playedSolvedPuzzleFx = true;
                if (!this.isNew && def.puzzle?.sound.complete != "none") {
                    audioManager.playSound(def.puzzle?.sound.complete!, {
                        channel: "sfx",
                        soundPos: this.pos,
                        layer: this.layer,
                        filter: "muffled"
                    });
                }
            }
        }

        // Destroy ceiling
        if (this.ceilingDead && !this.playedCeilingDeadFx) {
            map.deadCeilingIds.push(this.__id);
            this.playedCeilingDeadFx = true;
            if (!this.isNew) {
                this.destroyCeilingFx(particleBarn, audioManager);
            }
        }
        this.isNew = false;

        // Create residue if the ceiling has been destroyed
        if (this.ceilingDead && !this.residue) {
            const def = MapObjectDefs[this.type] as BuildingDef;
            if (def.ceiling.destroy?.residue) {
                const r = this.allocSprite();
                r.texture = PIXI.Texture.from(def.ceiling.destroy.residue);
                r.position.set(0, 0);
                r.scale.set(1, 1);
                r.rotation = 0;
                r.tint = 16777215;
                r.visible = true;
                this.imgs[0].sprite.addChild(r);
                this.residue = r;
            }
        }

        // Determine ceiling visibility
        this.ceiling.visionTicker -= dt;
        const vision = this.ceiling.vision!;

        let canSeeInside = false;
        for (let i = 0; i < this.ceiling.zoomRegions.length; i++) {
            const zoomIn = this.ceiling.zoomRegions[i].zoomIn;
            if (
                zoomIn &&
                (this.layer == activePlayer.layer || activePlayer.layer & 2) &&
                collisionHelpers.scanCollider(
                    zoomIn,
                    map.obstaclePool.getPool(),
                    activePlayer.pos,
                    activePlayer.layer,
                    0.5,
                    vision.width! * 2,
                    vision.dist!,
                    5
                )
            ) {
                canSeeInside = true;
                break;
            }
        }
        if (this.ceilingDead) {
            canSeeInside = true;
        }
        if (canSeeInside) {
            this.ceiling.visionTicker = vision.linger! + 0.0001;
        }

        // @NOTE: This will not allow for revealing any ceilings while
        // underground near stairs
        if (activePlayer.noCeilingRevealTicker > 0 && !this.ceilingDead) {
            this.ceiling.visionTicker = 0;
        }

        const visible = this.ceiling.visionTicker > 0;
        const ceilingStep = step(
            this.ceiling.fadeAlpha,
            visible ? 0 : 1,
            dt * (visible ? 12 : vision?.fadeRate!)
        );
        this.ceiling.fadeAlpha += ceilingStep;

        // Immediately reveal a ceiling if we're on stairs and
        // can see inside the other layer
        if (
            canSeeInside &&
            activePlayer.noCeilingRevealTicker <= 0 &&
            activePlayer.layer & 2 &&
            !util.sameLayer(activePlayer.layer, this.layer)
        ) {
            this.ceiling.fadeAlpha = 0;
        }

        // Update particle emitters based on occupied status
        for (let i = 0; i < this.particleEmitters.length; i++) {
            this.particleEmitters[i].enabled = this.occupied;
        }
        // Update sound emitters
        this.soundEmitterTicker += dt;
        if (this.soundEmitterTicker > 0.1) {
            this.soundEmitterTicker = 0;
            for (let A = 0; A < this.soundEmitters.length; A++) {
                const soundEmitter = this.soundEmitters[A];

                // Play sound if it's loaded
                if (
                    !soundEmitter.instance &&
                    audioManager.isSoundLoaded(soundEmitter.sound, soundEmitter.channel)
                ) {
                    soundEmitter.instance = audioManager.playSound(soundEmitter.sound, {
                        channel: soundEmitter.channel,
                        loop: true,
                        forceStart: true,
                        startSilent: true
                    });
                }
                if (soundEmitter.instance) {
                    // Update volume
                    const diff = v2.sub(camera.pos, soundEmitter.pos);
                    const dist = v2.length(diff);
                    const distT = math.remap(
                        dist,
                        soundEmitter.range.min,
                        soundEmitter.range.max,
                        1,
                        0
                    );
                    const volumeFalloff = Math.pow(distT, soundEmitter.falloff);
                    const visibilityMult = math.lerp(this.ceiling.fadeAlpha, 1, 0.25);
                    let volume =
                        audioManager.baseVolume *
                        audioManager.getTypeVolume("sound") *
                        soundEmitter.volume *
                        volumeFalloff *
                        visibilityMult;
                    if (!util.sameAudioLayer(this.layer, activePlayer.layer)) {
                        volume = 0;
                    }
                    if (volume < 0.003) {
                        volume = 0;
                    }
                    soundEmitter.instance.volume = volume;
                }
            }
        }

        // Position sprites for rendering
        for (let F = 0; F < this.imgs.length; F++) {
            const img = this.imgs[F];
            const alpha = img.isCeiling ? this.ceiling.fadeAlpha : 1;
            this.positionSprite(img.sprite, alpha, camera);

            if (img.removeOnDamaged && this.ceilingDamaged) {
                img.sprite.visible = !this.ceilingDamaged;
            }

            // Determine zOrder of ceilings
            let layer = this.layer;
            // This hack will render ceilings ontop of players on stairs.
            // It fixes an issue when outside of the mansion with players
            // standing on the interior mansion stairs.
            if (
                img.isCeiling &&
                (this.layer == activePlayer.layer ||
                    (activePlayer.layer & 2 && this.layer == 1))
            ) {
                layer |= 2;
            }
            renderer.addPIXIObj(img.sprite, layer, img.zOrd, img.zIdx);
        }
    }

    isInsideCeiling(collision: Collider) {
        for (let i = 0; i < this.ceiling.zoomRegions.length; i++) {
            const zoomIn = this.ceiling.zoomRegions[i].zoomIn;
            if (zoomIn && collider.intersect(zoomIn, collision)) {
                return true;
            }
        }
        return false;
    }

    getDistanceToBuilding(pos: Vec2, maxDist: number) {
        let dist = maxDist;
        for (let i = 0; i < this.ceiling.zoomRegions.length; i++) {
            const zoomIn = this.ceiling.zoomRegions[i].zoomIn;
            if (zoomIn) {
                const res = collider.intersectCircle(zoomIn, pos, maxDist);
                if (res) {
                    dist = math.clamp(maxDist - res.pen, 0, dist);
                }
            }
        }
        return dist;
    }

    destroyCeilingFx(particleBarn: ParticleBarn, audioManager: AudioManager) {
        const def = (MapObjectDefs[this.type] as BuildingDef).ceiling.destroy!;

        // Spawn particles at random points inside the first surface collision
        const surface = this.surfaces[0];
        for (let i = 0; i < surface.colliders.length; i++) {
            const aabb = collider.toAabb(surface.colliders[i]);
            for (let j = 0; j < def.particleCount; j++) {
                const pos = v2.create(
                    util.random(aabb.min.x, aabb.max.x),
                    util.random(aabb.min.y, aabb.max.y)
                );
                const vel = v2.mul(v2.randomUnit(), util.random(0, 15));
                particleBarn.addParticle(def.particle, this.layer, pos, vel);
            }

            // Only use the first collider for now;
            // the shack looks weird with the front step being used
            break;
        }
        audioManager.playSound(def.sound || "ceiling_break_01", {
            channel: "sfx",
            soundPos: this.pos
        });
    }

    positionSprite(sprite: BuildingSprite, alpha: number, camera: Camera) {
        const screenPos = camera.pointToScreen(v2.add(this.pos, sprite.posOffset));
        const screenScale = camera.pixels(this.scale * sprite.defScale);

        sprite.position.set(screenPos.x, screenPos.y);
        sprite.scale.set(screenScale, screenScale);
        if (sprite.mirrorY) {
            sprite.scale.y *= -1;
        }
        if (sprite.mirrorX) {
            sprite.scale.x *= -1;
        }
        sprite.rotation = -this.rot + sprite.rotOffset;
        sprite.alpha = sprite.imgAlpha * alpha;
    }

    render(_camera: Camera, debug: DebugOptions, _layer: number) {
        if (device.debug) {
            if (debug.buildings?.bounds) {
                renderMapBuildingBounds(this);
            }
            if (debug?.bridge) {
                renderBridge(this);
            }

            if (debug.buildings?.ceiling) {
                for (let i = 0; i < this.ceiling.zoomRegions.length; i++) {
                    const region = this.ceiling.zoomRegions[i];
                    if (region.zoomIn) {
                        debugLines.addCollider(region.zoomIn, 0x00ff00, 0);
                    }
                    if (region.zoomOut) {
                        debugLines.addCollider(region.zoomOut, 0x0000ff, 0);
                    }
                }
            }
        }
    }
}
