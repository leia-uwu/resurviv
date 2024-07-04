import { GameObjectDefs } from "../../../../shared/defs/gameObjectDefs";
import { GameConfig } from "../../../../shared/gameConfig";
import { type Circle, coldet } from "../../../../shared/utils/coldet";
import { collider } from "../../../../shared/utils/collider";
import { math } from "../../../../shared/utils/math";
import { ObjectType } from "../../../../shared/utils/objectSerializeFns";
import type { River } from "../../../../shared/utils/river";
import { util } from "../../../../shared/utils/util";
import { type Vec2, v2 } from "../../../../shared/utils/v2";
import type { Game } from "../game";
import { BaseGameObject } from "./gameObject";
import type { Player } from "./player";

interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}

/**
 * Quadtree Constructor
 * @param bounds                 bounds of the node ({ x, y, width, height })
 * @param [max_objects=10]     (optional) max objects a node can hold before splitting into 4 subnodes (default: 10)
 * @param [max_levels=4]       (optional) total max levels inside root Quadtree (default: 4)
 * @param [level=0]            (optional) depth level, required for subnodes (default: 0)
 */
class Quadtree {
    objects: Loot[] = [];
    nodes: Quadtree[] = [];
    constructor(
        public bounds: Rect,
        public max_objects = 10,
        public max_levels = 4,
        public level = 0
    ) {}

    /**
     * Split the node into 4 subnodes
     */
    split() {
        var nextLevel = this.level + 1,
            subWidth = this.bounds.width / 2,
            subHeight = this.bounds.height / 2,
            x = this.bounds.x,
            y = this.bounds.y;

        //top right node
        this.nodes[0] = new Quadtree(
            {
                x: x + subWidth,
                y: y,
                width: subWidth,
                height: subHeight
            },
            this.max_objects,
            this.max_levels,
            nextLevel
        );

        //top left node
        this.nodes[1] = new Quadtree(
            {
                x: x,
                y: y,
                width: subWidth,
                height: subHeight
            },
            this.max_objects,
            this.max_levels,
            nextLevel
        );

        //bottom left node
        this.nodes[2] = new Quadtree(
            {
                x: x,
                y: y + subHeight,
                width: subWidth,
                height: subHeight
            },
            this.max_objects,
            this.max_levels,
            nextLevel
        );

        //bottom right node
        this.nodes[3] = new Quadtree(
            {
                x: x + subWidth,
                y: y + subHeight,
                width: subWidth,
                height: subHeight
            },
            this.max_objects,
            this.max_levels,
            nextLevel
        );
    }
    /**
     * Determine which node the object belongs to
     * @return an array of indexes of the intersecting subnodes (0-3 = top-right, top-left, bottom-left, bottom-right / ne, nw, sw, se)
     */
    getIndex(loot: Loot) {
        var indexes = [],
            verticalMidpoint = this.bounds.x + this.bounds.width / 2,
            horizontalMidpoint = this.bounds.y + this.bounds.height / 2;

        var startIsNorth = loot.pos.y < horizontalMidpoint,
            startIsWest = loot.pos.x < verticalMidpoint,
            endIsEast = loot.pos.x + loot.rad > verticalMidpoint,
            endIsSouth = loot.pos.y + loot.rad > horizontalMidpoint;

        //top-right quad
        if (startIsNorth && endIsEast) {
            indexes.push(0);
        }

        //top-left quad
        if (startIsWest && startIsNorth) {
            indexes.push(1);
        }

        //bottom-left quad
        if (startIsWest && endIsSouth) {
            indexes.push(2);
        }

        //bottom-right quad
        if (endIsEast && endIsSouth) {
            indexes.push(3);
        }

        return indexes;
    }

    /**
     * Insert the object into the node. If the node
     * exceeds the capacity, it will split and add all
     * objects to their corresponding subnodes.
     */
    insert(loot: Loot) {
        var i = 0,
            indexes;

        //if we have subnodes, call insert on matching subnodes
        if (this.nodes.length) {
            indexes = this.getIndex(loot);

            for (i = 0; i < indexes.length; i++) {
                this.nodes[indexes[i]].insert(loot);
            }
            return;
        }

        //otherwise, store object here
        this.objects.push(loot);

        //max_objects reached
        if (this.objects.length > this.max_objects && this.level < this.max_levels) {
            //split if we don't already have subnodes
            if (!this.nodes.length) {
                this.split();
            }

            //add all objects to their corresponding subnode
            for (i = 0; i < this.objects.length; i++) {
                indexes = this.getIndex(this.objects[i]);
                for (var k = 0; k < indexes.length; k++) {
                    this.nodes[indexes[k]].insert(this.objects[i]);
                }
            }

            //clean up this node
            this.objects = [];
        }
    }

    /**
     * Return all objects that could collide with the given object
     */
    retrieve(loot: Loot) {
        var indexes = this.getIndex(loot),
            returnObjects = this.objects;

        //if we have subnodes, retrieve their objects
        if (this.nodes.length) {
            for (var i = 0; i < indexes.length; i++) {
                returnObjects = returnObjects.concat(
                    this.nodes[indexes[i]].retrieve(loot)
                );
            }
        }

        //remove duplicates
        if (this.level === 0) {
            return Array.from(new Set(returnObjects));
        }

        return returnObjects;
    }

    /**
     * Clear the quadtree
     */
    clear() {
        this.objects = [];

        for (var i = 0; i < this.nodes.length; i++) {
            if (this.nodes.length) {
                this.nodes[i].clear();
            }
        }

        this.nodes = [];
    }
}

export class LootBarn {
    loots: Loot[] = [];

    tree = new Quadtree({
        x: 0,
        y: 0,
        width: 1024,
        height: 1024
    });

    constructor(public game: Game) {}

    update(dt: number) {
        this.tree.clear();

        // first loop
        // add velocity to position and insert into quad tree
        for (let i = 0; i < this.loots.length; i++) {
            const loot = this.loots[i];
            loot.oldPos = v2.copy(loot.pos);

            const halfDt = dt / 2;
            const calculateSafeDisplacement = (): Vec2 => {
                let displacement = v2.mul(loot.vel, halfDt);
                if (v2.lengthSqr(displacement) >= 10) {
                    displacement = v2.normalizeSafe(displacement);
                }

                return displacement;
            };

            v2.set(loot.pos, v2.add(loot.pos, calculateSafeDisplacement()));
            loot.vel = v2.mul(loot.vel, 0.93);
            v2.set(loot.pos, v2.add(loot.pos, calculateSafeDisplacement()));

            this.tree.insert(loot);
        }

        const collisions: Record<string, boolean> = {};

        // second loop: do collisions
        for (let i = 0; i < this.loots.length; i++) {
            const loot = this.loots[i];
            if (loot.destroyed) {
                this.loots.splice(i, 1);
                continue;
            }
            loot.update(dt, this.tree, collisions);
        }
    }

    splitUpLoot(player: Player, item: string, amount: number, dir: Vec2) {
        const dropCount = Math.floor(amount / 60);
        for (let i = 0; i < dropCount; i++) {
            this.addLoot(item, player.pos, player.layer, 60, undefined, -4, dir);
        }
        if (amount % 60 !== 0)
            this.addLoot(item, player.pos, player.layer, amount % 60, undefined, -4, dir);
    }

    /**
     * spawns loot without ammo attached, use addLoot() if you want the respective ammo to drop alongside the gun
     */
    addLootWithoutAmmo(type: string, pos: Vec2, layer: number, count: number) {
        const loot = new Loot(this.game, type, pos, layer, count);
        this._addLoot(loot);
    }

    addLoot(
        type: string,
        pos: Vec2,
        layer: number,
        count: number,
        useCountForAmmo?: boolean,
        pushSpeed?: number,
        dir?: Vec2
    ) {
        const loot = new Loot(this.game, type, pos, layer, count, pushSpeed, dir);
        this._addLoot(loot);

        const def = GameObjectDefs[type];

        if (def.type === "gun" && GameObjectDefs[def.ammo]) {
            const ammoCount = useCountForAmmo ? count : def.ammoSpawnCount;
            if (ammoCount <= 0) return;
            const halfAmmo = Math.ceil(ammoCount / 2);

            const leftAmmo = new Loot(
                this.game,
                def.ammo,
                v2.add(pos, v2.create(-0.2, -0.2)),
                layer,
                halfAmmo,
                0
            );
            leftAmmo.push(v2.create(-1, -1), 1);
            this._addLoot(leftAmmo);

            if (ammoCount - halfAmmo >= 1) {
                const rightAmmo = new Loot(
                    this.game,
                    def.ammo,
                    v2.add(pos, v2.create(0.2, -0.2)),
                    layer,
                    ammoCount - halfAmmo,
                    0
                );
                rightAmmo.push(v2.create(1, -1), 1);
                this._addLoot(rightAmmo);
            }
        }
    }

    private _addLoot(loot: Loot) {
        this.game.objectRegister.register(loot);
        this.loots.push(loot);
    }

    getLootTable(tier: string): Array<{ name: string; count: number }> {
        const lootTable = this.game.map.mapDef.lootTable[tier];
        const items: Array<{ name: string; count: number }> = [];

        if (!lootTable) {
            console.warn(`Unknown loot tier with type ${tier}`);
            return [];
        }

        const weights: number[] = [];

        const weightedItems: Array<{ name: string; count: number }> = [];
        for (const item of lootTable) {
            weightedItems.push({
                name: item.name,
                count: item.count
            });
            weights.push(item.weight);
        }

        const item = util.weightedRandom(weightedItems, weights);

        if (item.name.startsWith("tier_")) {
            items.push(...this.getLootTable(item.name));
        } else if (item.name) {
            items.push(item);
        }

        return items;
    }
}

export class Loot extends BaseGameObject {
    override readonly __type = ObjectType.Loot;

    isPreloadedGun = false;
    hasOwner = false;
    ownerId = 0;
    isOld = false;

    layer: number;
    type: string;
    count: number;

    vel = v2.create(0, 0);
    oldPos = v2.create(0, 0);

    collider: Circle;
    rad: number;
    ticks = 0;

    bellowBridge = false;

    constructor(
        game: Game,
        type: string,
        pos: Vec2,
        layer: number,
        count: number,
        pushSpeed = 2,
        dir?: Vec2
    ) {
        super(game, pos);

        const def = GameObjectDefs[type];
        if (!def) {
            throw new Error(`Invalid loot with type ${type}`);
        }

        this.layer = layer;
        this.type = type;
        this.count = count;

        this.collider = collider.createCircle(pos, GameConfig.lootRadius[def.type]);
        this.collider.pos = this.pos;

        this.rad = this.collider.rad;

        this.bounds = collider.createAabbExtents(this.pos, v2.create(this.rad, this.rad));

        this.push(dir ?? v2.randomUnit(), pushSpeed);
    }

    update(dt: number, tree: Quadtree, collisions: Record<string, boolean>): void {
        if (this.ticks > 2 && !this.isOld) {
            this.isOld = true;
            this.ticks = 0;
            this.setDirty();
        } else this.ticks++;
        const moving =
            Math.abs(this.vel.x) > 0.001 ||
            Math.abs(this.vel.y) > 0.001 ||
            !v2.eq(this.oldPos, this.pos);

        if (!moving) return;

        const loots = tree.retrieve(this);

        for (let i = 0; i < loots.length; i++) {
            const loot = loots[i];
            if (loot.__id === this.__id) continue;
            const hash1 = `${this.__id} ${loot.__id}`;
            const hash2 = `${loot.__id} ${this.__id}`;
            if (collisions[hash1] || collisions[hash2]) continue;
            if (!util.sameLayer(loot.layer, this.layer)) continue;
            if (!util.sameLayer(loot.layer, this.layer)) continue;

            const res = coldet.intersectCircleCircle(
                this.pos,
                this.collider.rad,
                loot.pos,
                loot.collider.rad
            );
            if (!res) continue;

            this.vel = v2.sub(this.vel, v2.mul(res.dir, 0.2));
            loot.vel = v2.sub(loot.vel, v2.mul(res.dir, -0.2));
            const vRelativeVelocity = v2.create(
                this.vel.x - loot.vel.x,
                this.vel.y - loot.vel.y
            );

            const speed =
                vRelativeVelocity.x * res.dir.x + vRelativeVelocity.y * res.dir.y;
            if (speed < 0) continue;

            this.push(res.dir, -speed);
            loot.push(res.dir, speed);
        }

        let objs = this.game.grid.intersectCollider(this.collider);

        for (let i = 0; i < objs.length; i++) {
            const obj = objs[i];
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
                }
            }
        }

        const originalLayer = this.layer;
        const stair = this.checkStairs(objs, this.rad);
        if (this.layer !== originalLayer) {
            this.setDirty();
        }

        if (this.layer === 0) {
            this.bellowBridge = false;
        }

        if (stair?.lootOnly) {
            this.bellowBridge = true;
        }

        const surface = this.game.map.getGroundSurface(this.pos, this.layer);
        let finalRiver: River | undefined;
        if ((this.layer === 0 && surface.river) || this.bellowBridge) {
            const rivers = this.game.map.terrain.rivers;
            for (let i = 0; i < rivers.length; i++) {
                const river = rivers[i];
                if (
                    coldet.testPointAabb(this.pos, river.aabb.min, river.aabb.max) &&
                    math.pointInsidePolygon(this.pos, river.waterPoly)
                ) {
                    finalRiver = river;
                    break;
                }
            }
        }
        if (finalRiver) {
            const tangent = finalRiver.spline.getTangent(
                finalRiver.spline.getClosestTtoPoint(this.pos)
            );
            this.push(tangent, 0.5 * dt);
        }

        if (!v2.eq(this.oldPos, this.pos)) {
            this.setPartDirty();
            this.bounds = collider.createAabbExtents(
                this.pos,
                v2.create(this.rad, this.rad)
            );
            this.game.grid.updateObject(this);
        }

        this.game.map.clampToMapBounds(this.pos, this.rad);
    }

    push(dir: Vec2, velocity: number): void {
        this.vel = v2.add(this.vel, v2.mul(dir, velocity));
    }
}
