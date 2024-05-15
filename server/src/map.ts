import { MapObjectDefs } from "../../shared/defs/mapObjectDefs";
import { type StructureDef, type BuildingDef, type ObstacleDef } from "../../shared/defs/mapObjectsTyping";
import { type MapDef, MapDefs } from "../../shared/defs/mapDefs";
import { type Game } from "./game";
import { GameConfig } from "../../shared/gameConfig";
import { Building } from "./objects/building";
import { ObjectType } from "../../shared/utils/objectSerializeFns";
import { Decal } from "./objects/decal";
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
import { MsgStream, MsgType } from "../../shared/net";
import { MapMsg } from "../../shared/msgs/mapMsg";

export class GameMap {
    game: Game;

    width: number;
    height: number;

    center: Vec2;

    msg = new MapMsg();
    mapStream = new MsgStream(new ArrayBuffer(1 << 14));
    seed = util.randomInt(0, 2 ** 31);

    bounds: AABB;

    objectCount: Record<string, number> = {};

    grassInset: number;
    shoreInset: number;

    terrain: ReturnType<typeof generateTerrain>;

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
        this.center = v2.create(this.width / 2, this.height / 2);
        this.grassInset = this.msg.grassInset = mapConfig.grassInset;
        this.shoreInset = this.msg.shoreInset = mapConfig.shoreInset;

        /* const lootPos = v2.create(this.width / 2, this.height / 2);
        for (const loot in GameObjectDefs) {
            const def = GameObjectDefs[loot];
            if ("lootImg" in def) {
                this.game.grid.addObject(new Loot(this.game, loot, lootPos, 0, 100, 0));
                // this.game.grid.addObject(new Loot(this.game, loot, v2.add(lootPos, { x: 1, y: 1 }), 0, 1, 0));

                lootPos.x += 3.5;
                if (lootPos.x > this.width / 2 + 80) {
                    lootPos.x = this.width / 2;
                    lootPos.y -= 3.5;
                }
            }
        } */

        this.generateTerrain();

        this.terrain = generateTerrain(
            this.width,
            this.height,
            this.shoreInset,
            this.grassInset,
            this.riverDescs,
            this.seed
        );

        this.generateObjects();

        // const data =  require("../../reference/mapMsgData.json")
        // this.msg.objects = data.objects;
        // this.msg.groundPatches = data.groundPatches;
        // this.msg.rivers = data.rivers

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

        const widths = util.weightedRandom(weightedWidths, riverWeights, randomGenerator);
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

            this.genRiver(
                start,
                startAngle,
                widths[this.riverDescs.length],
                riverRect,
                randomGenerator
            );
        }
    }

    generateObjects(): void {
        const mapDef = this.mapDef;

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
            let pos: Vec2 | undefined;
            let ori: number | undefined;

            let attempts = 0;
            while (attempts++ < 200) {
                ori = util.randomInt(0, 3);
                pos = v2.add(
                    util.randomPointInCircle(customSpawnRule.rad),
                    v2.mulElems(customSpawnRule.pos,
                        v2.create(this.width, this.height)));

                if (this.canSpawn(customSpawnRule.type, pos, ori)) {
                    break;
                }
            }
            if (pos && ori) {
                this.genAuto(customSpawnRule.type, pos);
            }
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
                this.genFromMapDef(type, count);
            }
        }

        const randomSpawns = mapDef.mapGen.randomSpawns[0];

        if (randomSpawns) {
            const spawns = [...randomSpawns.spawns];
            for (let i = 0; i < randomSpawns.choose; i++) {
                const idx = util.randomInt(0, spawns.length - 1);
                const spawn = spawns.splice(idx, 1)[0];
                this.genFromMapDef(spawn, 1);
            }
        }

        const densitySpawns = mapDef.mapGen.densitySpawns[0];
        for (const type in densitySpawns) {
            const count = densitySpawns[type];
            this.genFromMapDef(type, count);
        }

        for (const place of mapDef.mapGen.places) {
            this.msg.places.push(place);
        }
    }

    genFromMapDef(type: string, count: number): void {
        for (let i = 0; i < count; i++) {
            const def = MapObjectDefs[type];

            if (def.terrain?.waterEdge) {
                this.genOnWaterEdge(type);
            } else if (def.terrain?.bridge) {
                this.genOnRiver(type);
            } else if (def.terrain?.grass) {
                this.genOnGrass(type);
            } else if (def.terrain?.beach) {
                this.genOnBeach(type);
            }
        }
    }

    genAuto(type: string, pos: Vec2, layer = 0, ori?: number, scale?: number, parentId?: number, puzzlePiece?: string) {
        const def = MapObjectDefs[type];

        switch (def.type) {
        case "obstacle":
            return this.genObstacle(
                type,
                pos,
                layer,
                ori,
                scale,
                parentId,
                puzzlePiece
            );
        case "building":
            return this.genBuilding(type, pos, layer, ori, parentId);
        case "structure":
            return this.genStructure(type, pos, layer, ori);
        case "decal": {
            const decal = new Decal(this.game, type, pos, layer, ori, scale);
            this.game.grid.addObject(decal);
            return decal;
        }
        case "loot_spawner":
            for (const tier of def.loot) {
                const items = this.game.lootBarn.getLootTable(tier.tier!);

                for (const item of items) {
                    this.game.lootBarn.addLoot(item.name, pos, layer, item.count);
                }
            }
            break;
        }
    }

    static collidableTypes = [ObjectType.Obstacle, ObjectType.Building, ObjectType.Structure];

    /**
     * Checks if a map object can spawn at a given position, orientation and scale
     */
    canSpawn(type: string, pos: Vec2, ori: number, scale = 1): boolean {
        const def = MapObjectDefs[type];

        const rot = math.oriToRad(ori);

        const mapObstacleBounds = mapHelpers.getColliders(type)
            .map(coll => collider.transform(coll, pos, rot, scale));

        const boundCollider = collider.transform(mapHelpers.getBoundingCollider(type), pos, rot, scale);
        const objs = this.game.grid.intersectCollider(boundCollider);

        for (let i = 0; i < objs.length; i++) {
            if (!GameMap.collidableTypes.includes(objs[i].__type)) continue;

            const obj = objs[i] as Obstacle | Building | Structure;

            for (let j = 0; j < obj.mapObstacleBounds.length; j++) {
                const otherBound = obj.mapObstacleBounds[j];
                for (let k = 0; k < mapObstacleBounds.length; k++) {
                    if (coldet.test(mapObstacleBounds[k], otherBound)) {
                        return false;
                    }
                }
            }
        }

        if (!def.terrain?.river &&
            !def.terrain?.bridge
        ) {
            const aabb = collider.toAabb(boundCollider);
            for (let i = 0; i < this.terrain.rivers.length; i++) {
                const river = this.terrain.rivers[i];

                if (!coldet.test(boundCollider, river.aabb)) continue;

                if (!def.terrain?.riverShore &&
                    coldet.testAabbPolygon(aabb.min, aabb.max, river.shorePoly)) return false;

                if (math.pointInsidePolygon(pos, river.waterPoly)) return false;

                if (coldet.testAabbPolygon(aabb.min, aabb.max, river.waterPoly)) return false;
            }
        }

        return true;
    }

    getOriAndScale(type: string): { ori: number, scale: number } {
        let ori = 0;
        let scale = 1;

        const def = MapObjectDefs[type];
        if (def.type === "building" || def.type === "structure") {
            ori = def.ori ?? util.randomInt(0, 3);
            if ("oris" in def) {
                ori = def.oris![util.randomInt(0, def.oris!.length - 1)];
            }
        } else if (def.type === "obstacle") {
            scale = util.random(def.scale.createMin, def.scale.createMax);
        }

        return { ori, scale };
    }

    static MaxSpawnAttempts = 1000;

    genOnWaterEdge(type: string): void {
        const def = MapObjectDefs[type] as BuildingDef | StructureDef;
        // safety check + makes ts shut up about it being possibly undefined
        const waterEdge = def.terrain.waterEdge;
        if (!waterEdge) return;

        const aabb = collider.toAabb(mapHelpers.getBoundingCollider(type));
        // const width = aabb.max.x - aabb.min.x;
        const height = aabb.max.y - aabb.min.y;

        let ori: number;
        let pos: Vec2 | undefined;

        let attempts = 0;
        let collided = true;

        const edgeRot = Math.atan2(waterEdge.dir.y, waterEdge.dir.x);

        while (attempts++ < GameMap.MaxSpawnAttempts && collided) {
            collided = false;

            const side = util.randomInt(0, 3);

            const rot = math.oriToRad(side);

            ori = math.radToOri(rot - edgeRot);

            const dist = util.random(waterEdge.distMin, waterEdge.distMax);

            const min = v2.create(dist + 6.5, this.shoreInset);
            const max = v2.create(min.x, this.height - this.shoreInset - height);

            // generate a position and rotate it based on the orientation and map center
            const tempPos = {
                x: util.random(min.x, max.x),
                y: util.random(min.y, max.y)
            };
            const offset = v2.sub(this.center, tempPos);
            pos = v2.add(this.center, v2.rotate(offset, rot));

            if (!this.canSpawn(type, pos, ori!, 1)) {
                collided = true;
            }
        }

        if (pos && attempts < GameMap.MaxSpawnAttempts) {
            this.genAuto(type, pos, 0, ori!, 1);
        }
    }

    genOnGrass(type: string) {
        const bounds = collider.toAabb(mapHelpers.getBoundingCollider(type));

        const { ori, scale } = this.getOriAndScale(type);

        let width = bounds.max.x - bounds.min.x;
        let height = bounds.max.y - bounds.min.y;

        const def = MapObjectDefs[type];
        if (!def.terrain?.beach) {
            width += this.grassInset;
            height += this.grassInset;
        }

        const getPos = () => {
            return {
                x: util.random(this.shoreInset + width, this.width - this.shoreInset - width),
                y: util.random(this.shoreInset + height, this.height - this.shoreInset - height)
            };
        };

        let pos: Vec2 | undefined;
        let attempts = 0;
        let collided = true;

        while (attempts++ < GameMap.MaxSpawnAttempts && collided) {
            collided = false;
            pos = getPos();

            if (!this.canSpawn(type, pos, ori, scale)) {
                collided = true;
            }
        }

        if (pos && attempts < GameMap.MaxSpawnAttempts) {
            this.genAuto(type, pos, 0, ori, scale);
        }
    }

    genOnBeach(type: string) {
        const aabb = collider.toAabb(mapHelpers.getBoundingCollider(type));
        const width = aabb.max.x - aabb.min.x;
        const height = aabb.max.y - aabb.min.y;
        const { ori, scale } = this.getOriAndScale(type);

        let pos: Vec2 | undefined;

        let attempts = 0;
        let collided = true;

        while (attempts++ < GameMap.MaxSpawnAttempts && collided) {
            collided = false;

            const side = util.randomInt(0, 3);
            const rot = math.oriToRad(side);

            const min = v2.create(this.shoreInset + width, this.shoreInset + width + this.grassInset);
            const max = v2.create(min.x, this.height - this.shoreInset - height);

            // generate a position and rotate it based on the orientation and map center
            const tempPos = {
                x: util.random(min.x, max.x),
                y: util.random(min.y, max.y)
            };
            const offset = v2.sub(this.center, tempPos);
            pos = v2.add(this.center, v2.rotate(offset, rot));

            if (!this.canSpawn(type, pos, ori, 1)) {
                collided = true;
            }
        }

        if (pos && attempts < GameMap.MaxSpawnAttempts) {
            this.genAuto(type, pos, 0, ori, scale);
        }
    }

    genOnRiver(type: string) {
        const { ori, scale } = this.getOriAndScale(type);

        const getPos = () => {
            const river = this.terrain.rivers[util.randomInt(0, this.terrain.rivers.length - 1)];
            const t = util.random(0.2, 0.8);
            const pos = river.spline.getPos(t);
            return pos;
        };

        let pos: Vec2 | undefined;
        let attempts = 0;
        let collided = true;

        while (attempts++ < GameMap.MaxSpawnAttempts && collided) {
            collided = false;
            pos = getPos();

            if (!this.canSpawn(type, pos, ori, scale)) {
                collided = true;
            }
        }

        if (pos && attempts < GameMap.MaxSpawnAttempts) {
            this.genAuto(type, pos, 0, ori, scale);
        } else {
            console.warn(`Failed to generate ${type} on river`);
        }
    }

    genRiver(
        startPos: Vec2,
        startAngle: number,
        width: number,
        bounds: AABB,
        randomGenerator: ReturnType<typeof util["seededRand"]>
    ) {
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

    genObstacle(type: string, pos: Vec2, layer = 0, ori?: number, scale?: number, buildingId?: number, puzzlePiece?: string): Obstacle {
        const def = MapObjectDefs[type] as ObstacleDef;

        scale = scale ?? util.random(def.scale.createMin, def.scale.createMax);

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

        if (def.map?.display && layer === 0) this.msg.objects.push(obstacle);
        this.objectCount[type]++;
        return obstacle;
    }

    genBuilding(type: string, pos: Vec2, layer = 0, ori?: number, parentId?: number): Building {
        const def = MapObjectDefs[type] as BuildingDef;

        ori = ori ?? def.ori ?? util.randomInt(0, 3);

        const building = new Building(this.game, type, pos, ori, layer, parentId);
        this.game.grid.addObject(building);

        if (def.map?.display && layer === 0) this.msg.objects.push(building);

        for (const mapObject of def.mapObjects ?? []) {
            let partType = mapObject.type;

            if (typeof partType !== "string") {
                partType = partType();
            }

            if (!partType) continue;

            let partOri: number;
            if (mapObject.inheritOri === false) partOri = mapObject.ori;
            else partOri = (mapObject.ori + ori) % 4;

            const partPos = math.addAdjust(pos, mapObject.pos, ori);

            const obj = this.genAuto(partType,
                partPos,
                layer,
                partOri,
                mapObject.scale,
                building.__id,
                mapObject.puzzlePiece
            );
            if (obj) building.childObjects.push(obj);
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

    genStructure(type: string, pos: Vec2, layer = 0, ori?: number): Structure {
        const def = MapObjectDefs[type] as StructureDef;

        ori = ori ?? def.ori ?? util.randomInt(0, 3);

        const structure = new Structure(this.game, type, pos, layer, ori);
        this.game.grid.addObject(structure);

        layer = 0;
        for (const layerDef of def.layers) {
            const building = this.genBuilding(
                layerDef.type,
                math.addAdjust(pos, layerDef.pos, ori),
                layer,
                (layerDef.ori + ori) % 4,
                structure.__id
            );
            layer++;
            structure.layerObjIds.push(building.__id);
        }

        this.objectCount[type]++;
        return structure;
    }

    getRandomSpawnPos(): Vec2 {
        const getPos = () => {
            return {
                x: util.random(this.shoreInset, this.width - this.shoreInset),
                y: util.random(this.shoreInset, this.height - this.shoreInset)
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
