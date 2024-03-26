import { MapObjectDefs } from "../../shared/defs/mapObjectDefs";
import { type StructureDef, type BuildingDef, type ObstacleDef } from "../../shared/defs/mapObjectsTyping";
import { type MapDef, MapDefs } from "../../shared/defs/mapDefs";
import { type Game } from "./game";
import { GameConfig } from "../../shared/gameConfig";
import { Building } from "./objects/building";
import { Decal } from "./objects/decal";
import { ObjectType } from "./objects/gameObject";
import { Obstacle } from "./objects/obstacle";
import { Structure } from "./objects/structure";
import { coldet, type AABB } from "../../shared/utils/coldet";
import { collider } from "../../shared/utils/collider";
import { mapHelpers } from "../../shared/utils/mapHelpers";
import { math } from "../../shared/utils/math";
import { type River } from "../../shared/utils/river";
import { type MapRiverData, generateTerrain } from "../../shared/utils/terrainGen";
import { util } from "../../shared/utils/util";
import { type Vec2, v2 } from "../../shared/utils/v2";
import { MapMsg, MsgStream, MsgType } from "../../shared/net";

export class GameMap {
    game: Game;

    width: number;
    height: number;

    msg = new MapMsg();
    mapStream = new MsgStream(new ArrayBuffer(1 << 14));
    seed = util.randomInt(0, 2 ** 31);

    bounds: AABB;

    objectCount: Record<string, number> = {};

    grassInset: number;
    shoreInset: number;

    terrain!: ReturnType<typeof generateTerrain>;

    mapDef: MapDef;

    riverDescs: MapRiverData[] = [];

    constructor(game: Game) {
        this.game = game;

        const mapDef = this.mapDef = MapDefs[game.config.map];
        if (mapDef === undefined) {
            throw new Error(`Invalid map name: ${game.config.map}`);
        }

        this.mapDef = mapDef;

        const mapConfig = mapDef.mapGen.map;
        this.width = (mapConfig.baseWidth * mapConfig.scale.small) + mapConfig.extension;
        this.height = (mapConfig.baseHeight * mapConfig.scale.small) + mapConfig.extension;

        this.bounds = collider.createAabb(v2.create(0, 0), v2.create(this.width, this.height));

        this.msg.mapName = game.config.map;
        this.msg.seed = this.seed;
        this.msg.width = this.width;
        this.msg.height = this.height;
        this.msg.rivers = this.riverDescs;
        this.grassInset = this.msg.grassInset = mapConfig.grassInset;
        this.shoreInset = this.msg.shoreInset = mapConfig.shoreInset;

        /* const lootPos = v2.create(this.width / 2, this.height / 2);
        for (const loot in GameObjectDefs) {
            const def = GameObjectDefs[loot];
            if ("lootImg" in def) {
                this.game.grid.addObject(new Loot(this.game, loot, lootPos, 0, 1, 0));
                this.game.grid.addObject(new Loot(this.game, loot, v2.add(lootPos, { x: 1, y: 1 }), 0, 1, 0));

                lootPos.x += 3.5;
                if (lootPos.x > this.width / 2 + 80) {
                    lootPos.x = this.width / 2;
                    lootPos.y -= 3.5;
                }
            }
        } */

        this.generateTerrain();
        this.generateObjects();

        this.mapStream.serializeMsg(MsgType.Map, this.msg);
    }

    generateTerrain(): void {
        const mapConfig = this.mapDef.mapGen.map;
        const riverWeights: number[] = [];
        const weightedWidths: number[][] = [];

        for (const weightedRiver of mapConfig.rivers.weights) {
            riverWeights.push(weightedRiver.weight);
            weightedWidths.push(weightedRiver.widths);
        }
        const randomGenerator = util.seededRand(this.seed);

        const widths = util.weightedRandom(weightedWidths, riverWeights);
        const halfWidth = this.width / 2;
        const halfHeight = this.height / 2;

        const riverRect = collider.createAabb(
            v2.create(1, 1),
            v2.create(this.width - 1, this.height - 1)
        );
        const center = v2.create(halfWidth, halfHeight);
        const mapWidth = this.width - 1;
        const mapHeight = this.height - 1;

        while (this.riverDescs.length < widths.length) {
            let start: Vec2;

            const horizontal = !!randomGenerator();
            const reverse = !!randomGenerator();

            if (horizontal) {
                const topHalf = randomGenerator(1, halfHeight);
                const bottomHalf = randomGenerator(halfHeight, mapHeight);
                start = v2.create(1, reverse ? bottomHalf : topHalf);
            } else {
                const leftHalf = randomGenerator(1, halfWidth);
                const rightHalf = randomGenerator(halfWidth, mapWidth);
                start = v2.create(reverse ? rightHalf : leftHalf, 1);
            }

            const startAngle = Math.atan2(center.y - start.y, center.x - start.x) + (reverse ? 0 : Math.PI);

            this.generateRiver(
                start,
                startAngle,
                widths[this.riverDescs.length],
                riverRect,
                randomGenerator
            );
        }

        this.terrain = generateTerrain(
            this.width,
            this.height,
            this.shoreInset,
            this.grassInset,
            this.riverDescs,
            this.seed
        );
    }

    generateObjects(): void {
        const mapDef = this.mapDef;
        const mapConfig = mapDef.mapGen.map;

        const riverWeights: number[] = [];
        const weightedWidths: number[][] = [];

        for (const weightedRiver of mapConfig.rivers.weights) {
            riverWeights.push(weightedRiver.weight);
            weightedWidths.push(weightedRiver.widths);
        }
        const randomGenerator = util.seededRand(this.seed);

        const widths = util.weightedRandom(weightedWidths, riverWeights);
        const halfWidth = this.width / 2;
        const halfHeight = this.height / 2;

        const riverRect = collider.createAabb(
            v2.create(1, 1),
            v2.create(this.width - 1, this.height - 1)
        );
        const center = v2.create(halfWidth, halfHeight);
        const mapWidth = this.width - 1;
        const mapHeight = this.height - 1;

        while (this.riverDescs.length < widths.length) {
            let start: Vec2;

            const horizontal = !!randomGenerator();
            const reverse = !!randomGenerator();

            if (horizontal) {
                const topHalf = randomGenerator(1, halfHeight);
                const bottomHalf = randomGenerator(halfHeight, mapHeight);
                start = v2.create(1, reverse ? bottomHalf : topHalf);
            } else {
                const leftHalf = randomGenerator(1, halfWidth);
                const rightHalf = randomGenerator(halfWidth, mapWidth);
                start = v2.create(reverse ? rightHalf : leftHalf, 1);
            }

            const startAngle = Math.atan2(center.y - start.y, center.x - start.x) + (reverse ? 0 : Math.PI);

            this.generateRiver(
                start,
                startAngle,
                widths[this.riverDescs.length],
                riverRect,
                randomGenerator
            );
        }

        this.terrain = generateTerrain(
            this.width,
            this.height,
            this.shoreInset,
            this.grassInset,
            this.riverDescs,
            this.seed
        );

        for (const river of this.terrain.rivers) {
            for (let i = 0.2; i < 0.8; i += 0.05) {
                if (Math.random() < 0.1) {
                    const pos = river.spline.getPos(i);

                    const rot = river.spline.getNormal(i);
                    const ori = math.radToOri(Math.atan2(rot.y, rot.x));

                    const width = river.waterWidth;

                    let bridgeType: string;
                    if (width < 9) {
                        bridgeType = mapDef.mapGen.bridgeTypes.medium;
                    } else if (width < 20) {
                        bridgeType = mapDef.mapGen.bridgeTypes.large;
                    } else {
                        bridgeType = mapDef.mapGen.bridgeTypes.xlarge;
                    }

                    const coll = collider.transform(
                        mapHelpers.getBoundingCollider(bridgeType),
                        pos,
                        math.oriToRad(ori),
                        1
                    ) as AABB;

                    if (this.getGroundSurface(coll.min, 0).type === "water" ||
                        this.getGroundSurface(coll.max, 0).type === "water") {
                        continue;
                    }

                    if (bridgeType) {
                        this.genStructure(bridgeType, pos, 0, ori);
                    }
                }
            }
        }

        for (const customSpawnRule of mapDef.mapGen.customSpawnRules.locationSpawns) {
            const pos = v2.add(
                util.randomPointInCircle(customSpawnRule.rad),
                v2.mulElems(customSpawnRule.pos,
                    v2.create(this.width, this.height)));

            this.genAuto(customSpawnRule.type, 1, pos);
        }

        // @NOTE: see comment on defs/maps/baseDefs.ts about single item arrays
        const fixedSpawns = mapDef.mapGen.fixedSpawns[0];
        for (const type in fixedSpawns) {
            let count = fixedSpawns[type];
            if (typeof count !== "number") {
                if ("small" in count) {
                    count = count.small;
                } else {
                    count = Math.random() < count.odds ? 1 : 0;
                }
            }
            if ((this.objectCount[type] ?? 0) < count) {
                this.genAuto(type, count);
            }
        }

        const randomSpawns = mapDef.mapGen.randomSpawns[0];

        if (randomSpawns) {
            const spawns = [...randomSpawns.spawns];
            for (let i = 0; i < randomSpawns.choose; i++) {
                const idx = util.randomInt(0, spawns.length - 1);
                const spawn = spawns.splice(idx, 1)[0];
                this.genAuto(spawn);
            }
        }

        const densitySpawns = mapDef.mapGen.densitySpawns[0];
        for (const type in densitySpawns) {
            const count = densitySpawns[type];
            this.genAuto(type, count);
        }

        for (const place of mapDef.mapGen.places) {
            this.msg.places.push(place);
        }
    }

    genAuto(type: string, count = 1, pos?: Vec2, ori?: number, scale?: number): void {
        const def = MapObjectDefs[type];

        for (let i = 0; i < count; i++) {
            const finalPos = pos ?? this.getRandomPositionFor(type);
            switch (def.type) {
            case "obstacle":
                this.genObstacle(
                    type,
                    finalPos,
                    0,
                    ori ?? 0,
                    scale ?? util.random(def.scale.createMax, def.scale.createMin)
                );

                break;
            case "building":
                this.genBuilding(type, finalPos);
                break;
            case "structure":
                this.genStructure(type, finalPos, 0, ori ?? 0);
                break;
            case "loot_spawner":
                for (const tier of def.loot) {
                    const items = this.game.lootBarn.getLootTable(tier.tier);

                    for (const item of items) {
                        this.game.lootBarn.addLoot(item.name, finalPos, 0, item.count);
                    }
                }
                break;
            }
        }
    }

    generateRiver(
        startPos: Vec2,
        startAngle: number,
        width: number,
        bounds: AABB,
        randomGenerator: ReturnType<typeof util["seededRand"]>
    ): void {
        const riverPoints: Vec2[] = [];

        riverPoints.push(startPos);

        let angle = startAngle;

        const smoothness = this.mapDef.mapGen.map.rivers.smoothness;

        for (let i = 1; i < 100; i++) {
            const lastPoint = riverPoints[i - 1];

            angle = angle + randomGenerator(
                -smoothness,
                smoothness
            );

            const len = randomGenerator(20, 30);
            const pos = v2.add(lastPoint, v2.create(Math.cos(angle) * len, Math.sin(angle) * len));

            let collided = false;

            // end the river if it collides with another river
            for (const river of this.riverDescs) {
                const points = river.points;
                for (let j = 1; j < points.length; j++) {
                    const intersection = coldet.intersectSegmentSegment(lastPoint, pos, points[j - 1], points[j]);
                    if (intersection) {
                        const dist = v2.distance(intersection.point, riverPoints[i - 1]);
                        if (dist > 6) riverPoints[i] = intersection.point;
                        collided = true;
                        break;
                    }
                }
                if (collided) break;
            }
            if (collided) break;
            riverPoints[i] = pos;

            if (!coldet.testPointAabb(pos, bounds.min, bounds.max)) break;
        }
        if (riverPoints.length < 20) return;

        this.riverDescs.push({ width, points: riverPoints, looped: false });
    }

    genObstacle(type: string, pos: Vec2, layer: number, ori: number, scale = 1, buildingId?: number, puzzlePiece?: string): Obstacle {
        const obstacle = new Obstacle(
            this.game,
            pos,
            type,
            layer,
            ori,
            scale,
            buildingId,
            puzzlePiece
        );
        this.game.grid.addObject(obstacle);

        const def = MapObjectDefs[type] as ObstacleDef;
        if (def.map?.display && layer === 0) this.msg.objects.push(obstacle);
        this.objectCount[type]++;
        return obstacle;
    }

    genBuilding(type: string, pos?: Vec2, layer = 0, ori?: number, parentStructure?: Structure): Building {
        ori = ori ?? util.randomInt(0, 3);

        pos = pos ?? this.getRandomPositionFor(type, ori);

        const building = new Building(this.game, type, pos, ori, layer, parentStructure);
        this.game.grid.addObject(building);

        const def = MapObjectDefs[type] as BuildingDef;

        if (def.map?.display && layer === 0) this.msg.objects.push(building);

        for (const mapObject of def.mapObjects ?? []) {
            let partType = mapObject.type;

            if (typeof partType !== "string") {
                partType = partType();
            }
            if (!partType) continue;

            const part = MapObjectDefs[partType];

            let partOrientation: number;
            if (mapObject.inheritOri === false) partOrientation = mapObject.ori;
            else partOrientation = (mapObject.ori + ori) % 4;

            const partPosition = math.addAdjust(pos, mapObject.pos, ori);

            switch (part.type) {
            case "structure":
                building.childObjects.push(
                    this.genStructure(partType, partPosition, layer, partOrientation)
                );
                break;
            case "building":
                building.childObjects.push(
                    this.genBuilding(partType, partPosition, layer, partOrientation)
                );
                break;
            case "obstacle":
                building.childObjects.push(this.genObstacle(
                    partType,
                    partPosition,
                    layer,
                    partOrientation,
                    mapObject.scale,
                    building.id,
                    mapObject.puzzlePiece
                ));
                break;
            case "decal": {
                const decal = new Decal(
                    this.game,
                    partType,
                    partPosition,
                    layer,
                    partOrientation,
                    mapObject.scale
                );
                building.childObjects.push(decal);
                this.game.grid.addObject(decal);
                break;
            }
            case "loot_spawner": {
                for (const tier of part.loot) {
                    const items = this.game.lootBarn.getLootTable(tier.tier);

                    for (const item of items) {
                        this.game.lootBarn.addLoot(item.name, partPosition, layer, item.count);
                    }
                }
            }
            }
        }

        for (const patch of def.mapGroundPatches ?? []) {
            this.msg.groundPatches.push({
                min: math.addAdjust(pos, patch.bound.min, ori),
                max: math.addAdjust(pos, patch.bound.max, ori),
                color: patch.color,
                roughness: patch.roughness ?? 0,
                offsetDist: patch.offsetDist ?? 0,
                order: patch.order ?? 0,
                useAsMapShape: patch.useAsMapShape ?? true
            });
        }

        this.objectCount[type]++;
        return building;
    }

    genStructure(type: string, pos: Vec2, layer: number, ori: number): Structure {
        const def = MapObjectDefs[type] as StructureDef;

        const structure = new Structure(this.game, type, pos, layer, ori);
        this.game.grid.addObject(structure);

        layer = 0;
        for (const layerDef of def.layers) {
            const building = this.genBuilding(
                layerDef.type,
                math.addAdjust(pos, layerDef.pos, ori),
                layer,
                (layerDef.ori + ori) % 4,
                structure
            );
            layer++;
            structure.layerObjIds.push(building.id);
        }

        this.objectCount[type]++;
        return structure;
    }

    getRandomPositionFor(type: string, ori = 0, scale = 1): Vec2 {
        const colliders = mapHelpers.getColliders(type);

        const rot = math.oriToRad(ori);

        const bounds = collider.toAabb(mapHelpers.getBoundingCollider(type));

        const width = bounds.max.x - bounds.min.x;
        const height = bounds.max.y - bounds.min.y;

        const getPos = () => {
            return {
                x: util.random(this.msg.shoreInset + width, this.width - this.msg.shoreInset - width),
                y: util.random(this.msg.shoreInset + height, this.height - this.msg.shoreInset - height)
            };
        };

        let pos = getPos();

        let attempts = 0;
        let collided = true;

        while (attempts++ < 200 && collided) {
            collided = false;
            pos = getPos();

            // if (this.getGroundSurface(pos, 0).type === "water") {
            //     collided = true;
            //     continue;
            // }

            for (const coll of colliders) {
                const newCollider = collider.transform(coll, pos, rot, scale);
                const objs = this.game.grid.intersectCollider(newCollider);

                for (const obj of objs) {
                    if (obj.layer !== 0) continue;
                    if (obj instanceof Obstacle && coldet.test(obj.collider, newCollider)) {
                        collided = true;
                        break;
                    }

                    if (obj instanceof Building || obj instanceof Structure) {
                        for (const bound of obj.mapObstacleBounds) {
                            if (coldet.test(bound, newCollider)) {
                                collided = true;
                                break;
                            }
                        }
                        if (collided) break;
                    }
                }
            }
        }

        return pos;
    }

    getRandomSpawnPosition(): Vec2 {
        const getPos = () => {
            return {
                x: util.random(this.msg.shoreInset, this.width - this.msg.shoreInset),
                y: util.random(this.msg.shoreInset, this.height - this.msg.shoreInset)
            };
        };

        let attempts = 0;
        let collided = true;

        const circle = collider.createCircle(getPos(), GameConfig.player.radius);

        while (attempts++ < 200 && collided) {
            collided = false;
            v2.set(circle.pos, getPos());

            const objs = this.game.grid.intersectCollider(circle);

            for (const obj of objs) {
                if (obj.layer !== 0) continue;
                if (obj instanceof Obstacle && coldet.test(obj.collider, circle)) {
                    collided = true;
                    break;
                }

                if (obj instanceof Building || obj instanceof Structure) {
                    for (const bound of obj.mapObstacleBounds) {
                        if (coldet.test(bound, circle)) {
                            collided = true;
                            break;
                        }
                    }
                    if (collided) break;
                }
            }
        }

        return circle.pos;
    }

    clampToMapBounds(pos: Vec2): Vec2 {
        return coldet.clampPosToAabb(pos, this.bounds);
    }

    getGroundSurface(pos: Vec2, layer: number) {
        const groundSurface = (type: string, river?: River) => {
            return { type, river };
        };

        const objs = this.game.grid.intersectPos(pos);

        // Check decals
        const decals = objs.filter(obj => obj.__type === ObjectType.Decal) as Decal[];
        for (let i = 0; i < decals.length; i++) {
            const decal = decals[i];
            if (!decal.surface) {
                continue;
            }

            if (util.sameLayer(decal.layer, layer) && collider.intersectCircle(decal.collider!, pos, 0.0001)) {
                return groundSurface(decal.surface);
            }
        }

        // Check buildings
        let surface = null;
        let zIdx = 0;
        const onStairs = layer & 0x2;

        const buildings = objs.filter(obj => obj.__type === ObjectType.Building) as Building[];

        for (let i = 0; i < buildings.length; i++) {
            const building = buildings[i];
            if (building.zIdx < zIdx) {
                continue;
            }
            // Prioritize layer0 building surfaces when on stairs
            // eslint-disable-next-line no-mixed-operators
            if (building.layer !== layer && !onStairs || building.layer === 1 && onStairs) {
                continue;
            }
            for (let j = 0; j < building.surfaces.length; j++) {
                const s = building.surfaces[j];
                for (let k = 0; k < s.colliders.length; k++) {
                    const res = collider.intersectCircle(s.colliders[k], pos, 0.0001);
                    if (res) {
                        zIdx = building.zIdx;
                        surface = s;
                        break;
                    }
                }
            }
        }

        if (surface) {
            return groundSurface(surface.type);
        }

        // Check rivers
        let onRiverShore = false;
        if (layer !== 1) {
            const { rivers } = this.terrain;
            for (let i = 0; i < rivers.length; i++) {
                const river = rivers[i];
                if (coldet.testPointAabb(pos, river.aabb.min, river.aabb.max) && math.pointInsidePolygon(pos, river.shorePoly)) {
                    onRiverShore = true;
                    if (math.pointInsidePolygon(pos, river.waterPoly)) {
                        return groundSurface("water", river);
                    }
                }
            }
        }

        // Check terrain
        if (math.pointInsidePolygon(pos, this.terrain.grass)) {
            // Use a stone step sound if we're in the main-spring def
            return groundSurface(onRiverShore ? this.mapDef.biome.sound.riverShore : "grass");
        } if (math.pointInsidePolygon(pos, this.terrain.shore)) {
            return groundSurface("sand");
        }
        return groundSurface("water");
    }
}
