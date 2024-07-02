import { GameObjectDefs } from "../../../shared/defs/gameObjectDefs";
import type { ThrowableDef } from "../../../shared/defs/gameObjects/throwableDefs";
import { GameConfig } from "../../../shared/gameConfig";
import { type Collider, coldet } from "../../../shared/utils/coldet";
import { collider } from "../../../shared/utils/collider";
import { math } from "../../../shared/utils/math";
import { ObjectType } from "../../../shared/utils/objectSerializeFns";
import { util } from "../../../shared/utils/util";
import { type Vec2, v2 } from "../../../shared/utils/v2";
import type { Game } from "../game";
import { BaseGameObject } from "./gameObject";

const gravity = 10;

export class ProjectileBarn {
    projectiles: Projectile[] = [];
    constructor(readonly game: Game) {}

    update(dt: number) {
        for (let i = 0; i < this.projectiles.length; i++) {
            const proj = this.projectiles[i];
            if (proj.destroyed) {
                this.projectiles.splice(i, 0);
                continue;
            }
            proj.update(dt);
        }
    }

    addProjectile(
        playerId: number,
        type: string,
        pos: Vec2,
        posZ: number,
        layer: number,
        vel: Vec2,
        fuseTime: number,
        damageType: number
    ): Projectile {
        const proj = new Projectile(this.game, type, pos, layer);
        proj.posZ = posZ;
        proj.playerId = playerId;
        proj.vel = vel;
        proj.fuseTime = fuseTime;
        proj.damageType = damageType;
        proj.dir = v2.normalize(vel);

        this.projectiles.push(proj);
        this.game.objectRegister.register(proj);
        return proj;
    }
}

export class Projectile extends BaseGameObject {
    bounds: Collider;

    override readonly __type = ObjectType.Projectile;

    layer: number;

    posZ: number = 5;
    dir = v2.create(0, 0);
    type: string;

    rad: number;

    playerId = 0;
    fuseTime = Infinity;
    damageType = 0;

    vel = v2.create(0, 0);
    velZ: number;
    dead = false;

    obstacleBellowId = 0;

    constructor(game: Game, type: string, pos: Vec2, layer: number) {
        super(game, pos);
        this.layer = layer;
        this.type = type;

        const def = GameObjectDefs[type] as ThrowableDef;
        this.velZ = def.throwPhysics.velZ;
        this.bounds = collider.createCircle(v2.create(0, 0), def.rad);
        this.rad = def.rad * 0.5;
    }

    update(dt: number) {
        //
        // Velocity
        //
        this.pos = v2.add(this.pos, v2.mul(this.vel, dt));
        this.vel = v2.mul(this.vel, this.posZ != 0 ? 0.99 : 0.98); // decrease vel slightly faster once touching ground

        const def = GameObjectDefs[this.type] as ThrowableDef;

        //
        // Height / posZ
        //
        this.velZ -= gravity * dt;
        this.posZ += this.velZ * dt;
        this.posZ = math.clamp(this.posZ, 0, GameConfig.projectile.maxHeight);
        let height = this.posZ;
        if (def.throwPhysics.fixedCollisionHeight) {
            height = def.throwPhysics.fixedCollisionHeight;
        }

        //
        // Collision and changing layers on stair
        //
        const coll = collider.createCircle(this.pos, this.rad, this.posZ);
        const objs = this.game.grid.intersectCollider(coll);

        for (const obj of objs) {
            if (
                obj.__type === ObjectType.Obstacle &&
                util.sameLayer(this.layer, obj.layer) &&
                !obj.dead &&
                obj.collidable
            ) {
                const intersection = collider.intersectCircle(
                    obj.collider,
                    this.pos,
                    this.rad
                );
                if (intersection) {
                    // break obstacle if its a window
                    // resolve the collision otherwise
                    if (obj.isWindow) {
                        obj.damage({
                            amount: 1,
                            damageType: this.damageType,
                            gameSourceType: this.type,
                            mapSourceType: "",
                            dir: this.vel
                        });
                    } else {
                        if (obj.height >= height && obj.__id !== this.obstacleBellowId) {
                            this.pos = v2.add(
                                this.pos,
                                v2.mul(intersection.dir, intersection.pen)
                            );

                            if (def.explodeOnImpact) {
                                this.explode();
                            }
                        } else {
                            this.obstacleBellowId = obj.__id;
                        }
                    }
                }
            } else if (
                obj.__type === ObjectType.Player &&
                def.playerCollision &&
                obj.__id !== this.playerId
            ) {
                if (coldet.testCircleCircle(this.pos, this.rad, obj.pos, obj.rad)) {
                    this.explode();
                }
            }
        }

        this.game.map.clampToMapBounds(this.pos, this.rad);

        const originalLayer = this.layer;
        this.checkStairs(objs, this.rad);

        if (!this.dead) {
            if (this.layer !== originalLayer) {
                this.setDirty();
            } else {
                this.setPartDirty();
            }

            this.game.grid.updateObject(this);

            if (this.posZ === 0 && def.explodeOnImpact) {
                this.explode();
            }

            //
            // Fuse time
            //

            this.fuseTime -= dt;
            if (this.fuseTime <= 0) {
                this.explode();
            }
        }
    }

    explode() {
        if (this.dead) return;
        this.dead = true;
        const def = GameObjectDefs[this.type] as ThrowableDef;
        const explosionType = def.explosionType;
        if (explosionType) {
            const source = this.game.objectRegister.getById(this.playerId);
            this.game.explosionBarn.addExplosion(
                explosionType,
                this.pos,
                this.layer,
                this.type,
                "",
                this.damageType,
                source
            );
        }
        this.destroy();
    }
}
