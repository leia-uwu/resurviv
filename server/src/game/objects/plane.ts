import { GameObjectDefs } from "../../../../shared/defs/gameObjectDefs";
import type { ThrowableDef } from "../../../../shared/defs/gameObjects/throwableDefs";
import type { MapDef } from "../../../../shared/defs/mapDefs";
import { MapObjectDefs } from "../../../../shared/defs/mapObjectDefs";
import type { ObstacleDef } from "../../../../shared/defs/mapObjectsTyping";
import { GameConfig } from "../../../../shared/gameConfig";
import { ObjectType } from "../../../../shared/net/objectSerializeFns";
import { type Collider, coldet } from "../../../../shared/utils/coldet";
import { collider } from "../../../../shared/utils/collider";
import { math } from "../../../../shared/utils/math";
import { util } from "../../../../shared/utils/util";
import { type Vec2, v2 } from "../../../../shared/utils/v2";
import type { Game } from "../game";

interface ScheduledAirDrop {
    type: string;
    pos: Vec2;
    collider: Collider;
}

// amount of seconds to travel to target
const AIRDROP_PLANE_SPAWN_DIST = GameConfig.airdrop.planeVel * 15;

type PlaneOptions = MapDef["gameConfig"]["planes"]["timings"][number]["options"];

export class PlaneBarn {
    planes: Plane[] = [];

    freeIds: number[] = Array.from({ length: 256 }, (_, i) => i);

    planeBounds = collider.createAabb(v2.create(-512, -512), v2.create(1536, 1536));

    scheduledPlanes: Array<{
        time: number;
        options: PlaneOptions;
    }> = [];

    constructor(readonly game: Game) {}
    update(dt: number) {
        for (let i = 0; i < this.planes.length; i++) {
            const plane = this.planes[i];
            plane.update(dt);

            if (
                !coldet.testPointAabb(
                    plane.pos,
                    this.planeBounds.min,
                    this.planeBounds.max
                ) &&
                plane.actionComplete
            ) {
                this.planes.splice(i, 1);
                this.freeIds.push(plane.id);
            }
        }

        let numAirDropsToSendNow = 0;
        for (let i = 0; i < this.scheduledPlanes.length; i++) {
            const scheduledPlane = this.scheduledPlanes[i];
            scheduledPlane.time -= dt;
            if (scheduledPlane.time <= 0) {
                this.scheduledPlanes.splice(i, 1);
                i--;
                switch (scheduledPlane.options.type) {
                    case GameConfig.Plane.Airdrop: {
                        if (scheduledPlane.options) numAirDropsToSendNow++;
                        break;
                    }
                }
            }
        }
        if (numAirDropsToSendNow > 0) {
            let airdropPositions: Vec2[] = [];
            for (let drop = 0; drop < numAirDropsToSendNow; drop++) {
                let sent = false;
                for (let attempt = 0; attempt < 100; attempt++) {
                    const posToTest = v2.add(
                        this.game.gas.posNew,
                        util.randomPointInCircle(this.game.gas.radNew)
                    );
                    this.game.map.clampToMapBounds(posToTest, this.game.map.shoreInset);
                    if (
                        airdropPositions.every(
                            (otherdrop) =>
                                v2.distance(posToTest, otherdrop) >=
                                GameConfig.airdrop.minSpawnDist
                        )
                    ) {
                        airdropPositions.push(posToTest);
                        this.addAirdrop(posToTest);
                        sent = true;
                        break;
                    }
                }
                if (!sent) {
                    const randomPos = v2.add(
                        this.game.gas.posNew,
                        util.randomPointInCircle(this.game.gas.radNew)
                    );
                    this.game.map.clampToMapBounds(randomPos, this.game.map.shoreInset);
                    airdropPositions.push(randomPos);
                    this.addAirdrop(randomPos);
                }
            }
        }
    }

    schedulePlanes() {
        const planes = this.game.map.mapDef.gameConfig.planes.timings;

        const getTime = (circleIdx: number, wait: number) => {
            let total = 0;
            let waitTime = GameConfig.gas.initWaitTime;
            for (let i = 0; i < circleIdx; i++) {
                waitTime = math.max(
                    waitTime - GameConfig.gas.waitTimeDecay,
                    GameConfig.gas.waitTimeMin
                );
                total += waitTime;
            }

            let gasTime = GameConfig.gas.initGasTime;
            for (let i = 0; i < circleIdx; i++) {
                gasTime = math.max(
                    gasTime - GameConfig.gas.gasTimeDecay,
                    GameConfig.gas.gasTimeMin
                );
                total += gasTime;
            }

            return total + wait;
        };

        for (const plane of planes) {
            const time = getTime(plane.circleIdx, plane.wait);
            this.schedulePlane(time, plane.options);
        }
    }

    schedulePlane(time: number, options: PlaneOptions) {
        this.scheduledPlanes.push({
            time,
            options
        });
    }

    addAirdrop(pos: Vec2) {
        const id = this.freeIds.pop();
        if (!id) {
            this.game.logger.warn("Plane Barn: ran out of IDs");
            return;
        }

        const type = util.weightedRandom(
            this.game.map.mapDef.gameConfig.planes.crates
        ).name;

        const def = MapObjectDefs[type] as ObstacleDef;

        let collided = true;
        let airdropPos = v2.copy(pos);

        let attemps = 0;

        while (collided && attemps < 10000) {
            collided = false;
            attemps++;

            let coll = collider.transform(def.collision, airdropPos, 0, 1);
            const objs = this.game.grid.intersectCollider(coll);

            for (let i = 0; i < objs.length && !collided; i++) {
                const obj = objs[i];
                if (obj.layer !== 0) continue;
                if (obj.__type === ObjectType.Obstacle && !obj.destructible) {
                    const intersection = collider.intersect(coll, obj.collider);
                    if (intersection) {
                        coll = collider.transform(
                            coll,
                            v2.mul(intersection.dir, -intersection.pen),
                            0,
                            1
                        );
                        collided = true;
                        break;
                    }
                } else if (obj.__type === ObjectType.Building) {
                    if (obj.wallsToDestroy < Infinity) continue;
                    for (const zoomRegion of obj.zoomRegions) {
                        if (!zoomRegion.zoomIn) continue;
                        const intersection = collider.intersect(coll, zoomRegion.zoomIn);
                        if (intersection) {
                            coll = collider.transform(
                                coll,
                                v2.mul(intersection.dir, -intersection.pen),
                                0,
                                1
                            );
                            collided = true;
                            break;
                        }
                    }
                    if (collided) {
                        break;
                    }
                } else if (obj.__type === ObjectType.Airdrop) {
                    const intersection = collider.intersect(coll, obj.crateCollision);
                    if (intersection) {
                        coll = collider.transform(
                            coll,
                            v2.mul(intersection.dir, -intersection.pen),
                            0,
                            1
                        );
                        collided = true;
                        break;
                    }
                }
            }
            for (let i = 0; i < this.planes.length && !collided; i++) {
                const plane = this.planes[i];
                if (plane.action !== GameConfig.Plane.Airdrop) continue;
                if (plane.actionComplete) continue;
                const airdrop = (plane as AirdropPlane).airDrop;

                const intersection = collider.intersect(coll, airdrop.collider);
                if (intersection) {
                    coll = collider.transform(
                        coll,
                        v2.mul(intersection.dir, -intersection.pen),
                        0,
                        1
                    );
                    collided = true;
                    break;
                }
            }

            if (attemps % 100 === 99) {
                coll = collider.transform(coll, v2.randomUnit(), 0, 1);
                attemps = 0;
            }

            let rad: number;
            switch (coll.type) {
                case collider.Type.Aabb:
                    const width = coll.max.x - coll.min.x;
                    const height = coll.max.y - coll.min.y;
                    airdropPos = v2.create(
                        coll.min.x + width / 2,
                        coll.min.y + height / 2
                    );
                    rad = math.max(width, height);
                    break;
                case collider.Type.Circle:
                    airdropPos = coll.pos;
                    rad = coll.rad;
                    break;
            }

            this.game.map.clampToMapBounds(airdropPos, rad);
        }

        const airdrop: ScheduledAirDrop = {
            type,
            pos: airdropPos,
            collider: collider.transform(def.collision, airdropPos, 0, 1)
        };

        const planePos = v2.add(pos, v2.mul(v2.randomUnit(), AIRDROP_PLANE_SPAWN_DIST));

        const toPlanePos = v2.sub(airdropPos, planePos);
        let len = v2.length(toPlanePos);
        let dir = len > 0.00001 ? v2.div(toPlanePos, len) : v2.create(1, 0);

        const plane = new AirdropPlane(this.game, id, planePos, dir, airdrop);
        this.planes.push(plane);
    }

    addAirStrike(targetPos: Vec2, dir: Vec2) {
        const id = this.freeIds.pop();
        if (!id) {
            this.game.logger.warn("Planem Barn: ran out of IDs");
            return;
        }

        const plane = new AirStrikePlane(this.game, id, v2.create(0, 0), targetPos, dir);
        this.planes.push(plane);
    }
}

abstract class Plane {
    game: Game;
    planeBarn: PlaneBarn;
    config: typeof GameConfig.airdrop | typeof GameConfig.airstrike;
    pos: Vec2;
    targetPos: Vec2;
    action: number;
    id: number;
    planeDir: Vec2;
    rad: number;
    actionComplete = false;

    constructor(
        game: Game,
        id: number,
        action: number,
        pos: Vec2,
        targetPos: Vec2,
        dir: Vec2
    ) {
        this.game = game;
        this.planeBarn = game.planeBarn;
        this.action = action;
        this.pos = pos;
        this.targetPos = targetPos;
        this.id = id;
        this.planeDir = dir;
        this.config =
            this.action == GameConfig.Plane.Airdrop
                ? GameConfig.airdrop
                : GameConfig.airstrike;

        this.rad = this.config.planeRad;
    }

    update(dt: number) {
        this.pos = v2.add(this.pos, v2.mul(this.planeDir, this.config.planeVel * dt));
    }
}

class AirdropPlane extends Plane {
    airDrop: ScheduledAirDrop;

    constructor(game: Game, id: number, pos: Vec2, dir: Vec2, airdrop: ScheduledAirDrop) {
        super(game, id, GameConfig.Plane.Airdrop, pos, airdrop.pos, dir);
        this.airDrop = airdrop;
    }

    update(dt: number): void {
        super.update(dt);
        if (!this.actionComplete && v2.distance(this.pos, this.targetPos) < 5) {
            this.actionComplete = true;
            this.game.airdropBarn.addAirdrop(this.targetPos, this.airDrop.type);
        }
    }
}

class AirStrikePlane extends Plane {
    bombCount = 0;

    constructor(game: Game, id: number, pos: Vec2, targetPos: Vec2, dir: Vec2) {
        super(game, id, GameConfig.Plane.Airstrike, pos, targetPos, dir);
    }

    update(dt: number) {
        super.update(dt);

        const config = this.config as typeof GameConfig.airstrike;
        if (v2.distance(this.pos, this.targetPos) < 10) {
            this.actionComplete = true;

            if (this.bombCount < config.bombCount) {
                this.bombCount++;
                const pos = v2.add(this.pos, v2.mul(v2.randomUnit(), config.bombJitter));
                const bombDef = GameObjectDefs["bomb_iron"] as ThrowableDef;
                this.game.projectileBarn.addProjectile(
                    0,
                    "bomb_iron",
                    pos,
                    5,
                    0,
                    v2.mul(v2.randomUnit(), config.bombVel),
                    bombDef.fuseTime,
                    GameConfig.DamageType.Airstrike
                );
            }
        }
    }
}
