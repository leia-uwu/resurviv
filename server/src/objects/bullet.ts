import { GameObjectDefs } from "../../../shared/defs/gameObjectDefs";
import type { BulletDef } from "../../../shared/defs/gameObjects/bulletDefs";
import { MapObjectDefs } from "../../../shared/defs/mapObjectDefs";
import type { ObstacleDef } from "../../../shared/defs/mapObjectsTyping";
import { GameConfig } from "../../../shared/gameConfig";
import { coldet } from "../../../shared/utils/coldet";
import { collider } from "../../../shared/utils/collider";
import { math } from "../../../shared/utils/math";
import { ObjectType } from "../../../shared/utils/objectSerializeFns";
import { util } from "../../../shared/utils/util";
import { type Vec2, v2 } from "../../../shared/utils/v2";
import type { Game } from "../game";
import type { DamageParams, GameObject } from "./gameObject";
import { Obstacle } from "./obstacle";
import { Player } from "./player";

// NOTE: most of this code was copied from surviv client and bit heroes arena client
// to get bullet collision the most accurate possible

function transformSegment(p0: Vec2, p1: Vec2, pos: Vec2, dir: Vec2) {
    const ang = Math.atan2(dir.y, dir.x);
    return {
        p0: v2.add(pos, v2.rotate(p0, ang)),
        p1: v2.add(pos, v2.rotate(p1, ang))
    };
}

interface BulletCollision {
    object: Player | Obstacle;
    collidable: boolean;
    point: Vec2;
    normal: Vec2;
    reflect?: boolean;
    dist?: number;
    bullet?: Bullet;
}

export interface BulletParams {
    bulletType: string;
    gameSourceType: string;
    mapSourceType?: string;
    pos: Vec2;
    dir: Vec2;
    layer: number;
    damageMult: number;
    damageType: number;
    shotFx?: boolean;
    shotOffhand?: boolean;
    lastShot?: boolean;
    splinter?: boolean;
    shotAlt?: boolean;
    trailSaturated?: boolean;
    trailSmall?: boolean;
    trailThick?: boolean;
    varianceT?: number;
    playerId: number;
    reflectCount?: number;
    reflectObjId?: number;
    onHitFx?: string;
    clipDistance?: boolean;
    distance?: number;
}

export class BullletBarn {
    bullets: Bullet[] = [];
    newBullets: Bullet[] = [];

    constructor(public game: Game) {}

    damages: Array<DamageParams & { obj: GameObject }> = [];

    update(dt: number): void {
        for (let i = 0; i < this.bullets.length; i++) {
            const bullet = this.bullets[i];

            if (!bullet.alive || bullet.skipCollision || (bullet.player?.dead ?? false)) {
                this.bullets.splice(i, 1);

                if (bullet.onHitFx && !bullet.reflected) {
                    this.game.explosionBarn.addExplosion(
                        bullet.onHitFx,
                        // spawn the bullet a bit behind the bullet so it won't spawn inside obstacles
                        v2.sub(bullet.pos, v2.mul(bullet.dir, 0.01)),
                        bullet.layer,
                        bullet.shotSourceType,
                        bullet.mapSourceType,
                        bullet.damageType,
                        bullet.player
                    );
                }

                continue;
            }

            bullet.update(dt);
        }

        for (let i = 0; i < this.damages.length; i++) {
            const damageRecord = this.damages[i];
            damageRecord.obj.damage(damageRecord);
        }
        this.damages.length = 0;
    }

    flush(): void {
        this.newBullets.length = 0;
    }

    fireBullet(params: BulletParams): Bullet {
        const bullet = new Bullet(this, params);
        this.bullets.push(bullet);
        this.newBullets.push(bullet);

        const bulletDef = GameObjectDefs[params.bulletType] as BulletDef;
        if (bulletDef.addFlare) {
            this.game.airdropBarn.addAirdrop(params.pos);
        }

        return bullet;
    }
}

export class Bullet {
    collided = false;
    alive = true;
    distanceTraveled = 0;
    moveT = 0;

    playerId: number;
    player?: Player;
    pos: Vec2;
    endPos: Vec2;
    clientEndPos: Vec2;
    dir: Vec2;
    bulletType: string;
    layer: number;
    varianceT: number;
    distAdjIdx: number;
    clipDistance: boolean;
    distance: number;
    maxDistance: number;
    shotFx: boolean;
    shotSourceType: string;
    mapSourceType: string;
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
    startPos: Vec2;
    speed: number;
    damageSelf: boolean;
    damage: number;
    damageMult: number;
    onHitFx?: string;
    hasOnHitFx: boolean;
    damageType: number;
    isShrapnel: boolean;
    skipCollision: boolean;

    constructor(
        public bulletManager: BullletBarn,
        params: BulletParams
    ) {
        const bulletDef = GameObjectDefs[params.bulletType] as BulletDef;

        const variance = 1 + (params.varianceT ?? 1) * bulletDef.variance;

        this.layer = params.layer;
        this.pos = v2.copy(params.pos);
        this.dir = v2.normalize(params.dir);
        this.playerId = params.playerId;
        this.startPos = v2.copy(params.pos);
        this.bulletType = params.bulletType;
        this.reflectCount = params.reflectCount ?? 0;
        this.reflectObjId = params.reflectObjId ?? -1;
        this.lastShot = params.lastShot ?? false;
        this.speed = bulletDef.speed * variance;
        this.onHitFx = bulletDef.onHit ?? params.onHitFx;
        this.hasOnHitFx = !!this.onHitFx;

        const player = this.bulletManager.game.objectRegister.getById(this.playerId);
        if (player instanceof Player) {
            this.player = player;
        }

        // Add random jitter to the bullet distance. This makes spray patterns
        // for low spread, high rate-of-fire guns like the vector look better.
        //
        // Don't apply the jitter on shotguns as they have inherent jitter
        // due to how the player computes the shot start position.
        const distAdjIdxMax = 16;
        const distAdjIdx =
            params.bulletType !== "bullet_shotgun" && params.bulletType !== "bullet_frag"
                ? util.randomInt(0, distAdjIdxMax)
                : distAdjIdxMax / 2;
        const distAdj = math.remap(distAdjIdx, 0, distAdjIdxMax, -1.0, 1.0);

        let distance =
            bulletDef.distance /
            Math.pow(GameConfig.bullet.reflectDistDecay, this.reflectCount);
        if (params.clipDistance) {
            distance = Math.min(bulletDef.distance, params.distance!);
        }
        // this.serialized = false;
        // this.sentToClient = false;
        // this.timeInactive = 0.0;
        this.shotSourceType = params.gameSourceType;
        this.mapSourceType = params.mapSourceType ?? "";
        this.damageType = params.damageType;
        this.damageMult = params.damageMult;
        this.shotFx = params.shotFx ?? false;
        this.shotOffhand = params.shotOffhand ?? false;
        this.shotAlt = params.shotAlt ?? false;
        this.splinter = params.splinter ?? false;
        this.trailSaturated = params.trailSaturated ?? false;
        this.trailSmall = params.trailSmall ?? false;
        this.trailThick = params.trailThick ?? false;
        this.varianceT = params.varianceT ?? 1;
        this.distAdjIdx = distAdjIdx;
        this.distance = this.maxDistance = distance * variance + distAdj;
        this.clipDistance = !!params.clipDistance;
        this.endPos = v2.add(params.pos, v2.mul(this.dir, this.distance));
        this.clientEndPos = v2.copy(this.endPos);
        this.damage = bulletDef.damage * this.damageMult;
        this.skipCollision = !!bulletDef.skipCollision;
        this.isShrapnel = bulletDef.shrapnel;

        this.damageSelf = this.reflectCount > 0 || this.isShrapnel;
        this.hasSpecialFx =
            this.shotAlt ||
            this.splinter ||
            this.trailSaturated ||
            this.trailSmall ||
            this.trailThick;

        const nearbyObjs = this.bulletManager.game.grid.intersectLineSegment(
            this.pos,
            this.endPos
        );
        const colIds: Array<{
            obj: Obstacle;
            pos: Vec2;
            nrm: Vec2;
            t: number;
        }> = [];

        for (let i = 0; i < nearbyObjs.length; i++) {
            const obj = nearbyObjs[i] as Obstacle;

            if (
                obj.__type !== ObjectType.Obstacle ||
                obj.dead ||
                obj.height < GameConfig.bullet.height ||
                !util.sameLayer(obj.layer, this.layer) ||
                obj.__id === this.reflectObjId
            ) {
                continue;
            }

            const res = collider.intersectSegment(obj.collider, this.pos, this.endPos);

            if (res) {
                const dist = v2.length(v2.sub(res.point, this.pos));
                colIds.push({
                    obj,
                    pos: res.point,
                    nrm: res.normal,
                    t: dist / this.distance
                });
            }
        }

        colIds.sort((a, b) => a.t - b.t);

        // Clamp end pos to the map boundaries if the bullet
        // has an onHit effect
        if (this.hasOnHitFx) {
            const res = coldet.intersectSegmentAabb2(
                this.startPos,
                this.endPos,
                this.bulletManager.game.map.bounds.min,
                this.bulletManager.game.map.bounds.max
            );
            if (res) {
                const dist = v2.length(v2.sub(res.point, this.startPos));
                this.endPos = res.point;
                this.clientEndPos = res.point;
                this.distance = dist;
                this.maxDistance = dist;
                this.clipDistance = true;
            }
        }

        // Store furthest possible travel distance to
        // an indestructible obstacle for the client.
        let maxDistance = this.distance;
        for (let i = 0; i < colIds.length; i++) {
            const col = colIds[i];
            const obj = col.obj;
            if (obj && !obj.destructible) {
                maxDistance = col.t * this.distance;
                break;
            }
        }
        this.clientEndPos = v2.add(this.startPos, v2.mul(this.dir, maxDistance));
    }

    update(dt: number): void {
        const posOld = v2.copy(this.pos);
        const distLeft = this.distance - v2.length(v2.sub(this.startPos, this.pos));
        const moveDist = math.min(distLeft, dt * this.speed);
        this.distanceTraveled += moveDist;

        v2.set(this.pos, v2.add(this.pos, v2.mul(this.dir, moveDist)));

        const map = this.bulletManager.game.map;
        if (!coldet.testPointAabb(this.pos, map.bounds.min, map.bounds.max)) {
            this.alive = false;
            map.clampToMapBounds(this.pos);
        }

        // const oldT = this.moveT;
        this.moveT = v2.length(v2.sub(this.pos, this.startPos)) / this.distance;

        this.checkForCollisions(posOld);

        // Check if bullet has reached the maximun distance
        if (math.eqAbs(moveDist, 0.0) || this.moveT >= 1.0) {
            this.alive = false;
            // Explosive rounds peter out
            if (this.onHitFx === "explosion_rounds") {
                this.onHitFx = "";
            }
        }
    }

    checkForCollisions(posOld: Vec2): void {
        const collisions: BulletCollision[] = [];

        const objects = this.bulletManager.game.grid.intersectLineSegment(
            posOld,
            this.pos
        );

        const obstacles = objects.filter((o) => o.__type === ObjectType.Obstacle);
        const players = objects.filter((o) => o.__type === ObjectType.Player);

        for (const obstacle of obstacles) {
            if (
                !(
                    obstacle.dead ||
                    !util.sameLayer(obstacle.layer, this.layer) ||
                    obstacle.height < GameConfig.bullet.height ||
                    (this.reflectCount > 0 && obstacle.__id === this.reflectObjId)
                )
            ) {
                const collision = collider.intersectSegment(
                    obstacle.collider,
                    posOld,
                    this.pos
                );
                if (collision) {
                    collisions.push({
                        object: obstacle,
                        collidable: obstacle.collidable,
                        point: collision.point,
                        normal: collision.normal
                    });
                }
            }
        }
        for (const player of players) {
            if (
                !player.dead &&
                (util.sameLayer(player.layer, this.layer) || 2 & player.layer) &&
                (player.__id !== this.playerId || this.damageSelf)
            ) {
                let panCollision = null;

                if (player.hasActivePan()) {
                    const panSeg = player.getPanSegment();
                    const oldSegment = transformSegment(
                        panSeg.p0,
                        panSeg.p1,
                        player.posOld,
                        player.dirOld
                    );
                    const newSegment = transformSegment(
                        panSeg.p0,
                        panSeg.p1,
                        player.pos,
                        player.dir
                    );

                    const newIntersection = coldet.intersectSegmentSegment(
                        posOld,
                        this.pos,
                        oldSegment.p0,
                        oldSegment.p1
                    );
                    const oldIntersection = coldet.intersectSegmentSegment(
                        posOld,
                        this.pos,
                        newSegment.p0,
                        newSegment.p1
                    );

                    const finalIntersection = oldIntersection ?? newIntersection;

                    if (finalIntersection) {
                        const normal = v2.normalize(
                            v2.perp(v2.sub(newSegment.p1, newSegment.p0))
                        );
                        panCollision = {
                            point: finalIntersection.point,
                            normal
                        };
                    }
                }
                const collision = coldet.intersectSegmentCircle(
                    posOld,
                    this.pos,
                    player.pos,
                    player.rad
                );

                if (
                    (collision &&
                    (!panCollision ||
                        v2.length(v2.sub(collision.point, this.startPos)) <
                            v2.length(v2.sub(panCollision.point, this.startPos)))
                        ? (collisions.push({
                              object: player,
                              point: collision.point,
                              normal: collision.normal,
                              collidable: true
                          }),
                          player.hasPerk("steelskin") &&
                              collisions.push({
                                  object: player,
                                  reflect: true,
                                  point: v2.add(
                                      collision.point,
                                      v2.mul(collision.normal, 0.1)
                                  ),
                                  normal: collision.normal,
                                  collidable: false
                              }))
                        : panCollision &&
                          collisions.push({
                              object: player,
                              reflect: true,
                              point: panCollision.point,
                              normal: panCollision.normal,
                              collidable: true
                          }),
                    collision ?? panCollision)
                ) {
                    break;
                }
            }
        }

        for (let i = 0; i < collisions.length; i++) {
            const collision = collisions[i];
            collision.dist = v2.length(v2.sub(collision.point, posOld));
            collision.bullet = this;
        }

        collisions.sort((e, t) => {
            return e.dist! - t.dist!;
        });

        let stopBullet = false;

        for (let i = 0; i < collisions.length; i++) {
            const collision = collisions[i];
            const obj = collision.object;

            let finalDamage = this.damage;
            finalDamage *= 1 / (this.reflectCount + 1);

            if (obj instanceof Obstacle) {
                stopBullet = obj.collidable;

                const def = GameObjectDefs[this.bulletType] as BulletDef;

                this.bulletManager.damages.push({
                    obj,
                    gameSourceType: this.shotSourceType,
                    mapSourceType: this.mapSourceType,
                    damageType: this.damageType,
                    source: this.player,
                    amount: finalDamage * def.obstacleDamage,
                    dir: this.dir
                });

                const obstacleDef = MapObjectDefs[obj.type] as ObstacleDef;
                if (obstacleDef.reflectBullets && this.onHitFx !== "explosion_rounds") {
                    this.reflect(collision.point, collision.normal, obj.__id);
                }
            } else if (obj instanceof Player) {
                stopBullet = collision.collidable;

                this.bulletManager.damages.push({
                    obj,
                    gameSourceType: this.shotSourceType,
                    mapSourceType: this.mapSourceType,
                    source: this.player,
                    damageType: this.damageType,
                    amount: finalDamage,
                    dir: this.dir
                });
            }
            if (stopBullet) {
                this.pos = collision.point;
                this.alive = false;
                break;
            }
        }
    }

    reflected = false;
    reflect(pos: Vec2, normal: Vec2, objId: number) {
        if (this.reflected) return;
        this.reflected = true;
        if (this.reflectCount >= GameConfig.bullet.maxReflect) return;

        const dot = v2.dot(this.dir, normal);
        const dir = v2.add(v2.mul(normal, dot * -2), this.dir);

        this.bulletManager.fireBullet({
            bulletType: this.bulletType,
            gameSourceType: this.shotSourceType,
            mapSourceType: this.mapSourceType,
            pos,
            dir,
            layer: this.layer,
            damageMult: this.damageMult,
            shotFx: false,
            reflectCount: this.reflectCount + 1,
            reflectObjId: objId,
            playerId: this.playerId,
            damageType: this.damageType,
            shotAlt: this.shotAlt,
            splinter: this.splinter,
            trailSaturated: this.trailSaturated,
            trailSmall: this.trailSmall,
            trailThick: this.trailThick,
            onHitFx: this.onHitFx,
            varianceT: this.varianceT,
            distance: this.distance
        });
    }
}
