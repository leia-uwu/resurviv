import { MapObjectDefs } from "../../shared/defs/mapObjectDefs";
import type {
    BuildingDef,
    ObstacleDef,
    StructureDef
} from "../../shared/defs/mapObjectsTyping";
import type { AABBWithHeight } from "../../shared/utils/coldet";
import { collider } from "../../shared/utils/collider";
import { mapHelpers } from "../../shared/utils/mapHelpers";
import type { River } from "../../shared/utils/river";
import { type Vec2, v2 } from "../../shared/utils/v2";
import { debugLines } from "./debugLines";
import type { Building } from "./objects/building";
import type { Obstacle } from "./objects/obstacle";
import type { Structure } from "./objects/structure";

export function renderMapBuildingBounds(mapObj: Building | Structure) {
    const def = MapObjectDefs[mapObj.type] as BuildingDef;
    const boundScale = def.type == "building" || def.type == "structure" ? 1.15 : 1.0;
    const bounds = [
        collider.transform(
            mapHelpers.getBoundingCollider(mapObj.type),
            mapObj.pos,
            mapObj.rot,
            mapObj.scale * boundScale
        )
    ];
    if (def.bridgeLandBounds !== undefined) {
        for (let i = 0; i < def.bridgeLandBounds.length; i++) {
            bounds.push(
                collider.transform(
                    def.bridgeLandBounds[i],
                    mapObj.pos,
                    mapObj.rot,
                    mapObj.scale
                )
            );
        }
    }
    for (let i = 0; i < bounds.length; i++) {
        debugLines.addCollider(bounds[i], 0xffffff, 0.0);
    }
}

export function renderMapObstacleBounds(mapObj: Obstacle) {
    const def = MapObjectDefs[mapObj.type] as ObstacleDef | BuildingDef | StructureDef;
    const boundScale = def.type == "building" || def.type == "structure" ? 1.1 : 1.0;
    let bounds = [
        collider.transform(
            mapHelpers.getBoundingCollider(mapObj.type),
            mapObj.pos,
            mapObj.rot,
            mapObj.scale * boundScale
        )
    ];
    if (def.mapObstacleBounds !== undefined) {
        bounds = [];
        for (let i = 0; i < def.mapObstacleBounds.length; i++) {
            bounds.push(
                collider.transform(
                    def.mapObstacleBounds[i],
                    mapObj.pos,
                    mapObj.rot,
                    mapObj.scale
                )
            );
        }
    }
    for (let i = 0; i < bounds.length; i++) {
        debugLines.addCollider(bounds[i], 0x0000ff, 0.1);
    }
}

export function renderWaterEdge(mapObj: Structure) {
    const def = MapObjectDefs[mapObj.type] as StructureDef;
    if (def.terrain.waterEdge !== undefined) {
        const { waterEdge } = def.terrain;
        const bounds = collider.transform(
            mapHelpers.getBoundingCollider(mapObj.type),
            mapObj.pos,
            mapObj.rot,
            mapObj.scale * 1.15
        ) as AABBWithHeight;
        const center = v2.add(bounds.min, v2.mul(v2.sub(bounds.max, bounds.min), 0.5));
        const dir = v2.rotate(waterEdge.dir, mapObj.rot);

        const renderRay = (center: Vec2, dir: Vec2, len: number) => {
            if (len < 0.0) {
                dir = v2.neg(dir);
            }
            debugLines.addRay(center, dir, Math.abs(len), 0xffffff, 0.0);
        };
        renderRay(center, dir, waterEdge.distMin);
        renderRay(v2.add(center, v2.mul(v2.perp(dir), 0.5)), dir, waterEdge.distMax);
    }
}

export function renderBridge(mapObj: Building | Structure) {
    const def = MapObjectDefs[mapObj.type] as StructureDef | BuildingDef;
    if (def.terrain.bridge !== undefined) {
        const bridgeLandBounds = def.bridgeLandBounds || [];
        for (let i = 0; i < bridgeLandBounds.length; i++) {
            const col = collider.transform(
                bridgeLandBounds[i],
                mapObj.pos,
                mapObj.rot,
                mapObj.scale
            );
            debugLines.addCollider(col, 0xff7700, 0.0);
        }
        const bridgeWaterBounds = def.bridgeWaterBounds || [];
        for (let i = 0; i < bridgeWaterBounds.length; i++) {
            const col = collider.transform(
                bridgeWaterBounds[i],
                mapObj.pos,
                mapObj.rot,
                mapObj.scale
            );
            debugLines.addCollider(col, 0x0077ff, 0.0);
        }

        const dims = mapHelpers.getBridgeDims(mapObj.type);
        const dir = v2.rotate(v2.create(1.0, 0.0), mapObj.rot);
        debugLines.addRay(mapObj.pos, dir, dims.length * 0.5, 0xff0000, 0.0);
        debugLines.addRay(mapObj.pos, v2.perp(dir), dims.width * 0.5, 0x00ff00, 0.0);

        const bridgeOverlapCol = mapHelpers.getBridgeOverlapCollider(
            mapObj.type,
            mapObj.pos,
            mapObj.rot,
            mapObj.scale
        );
        debugLines.addCollider(bridgeOverlapCol, 0x7700ff, 0.0);
    }
}

export function renderSpline(spline: River["spline"], segments: number) {
    segments = Math.floor(segments);
    for (let i = 0; i < segments; i++) {
        const p0 = spline.getPos(i / segments);
        const p1 = spline.getPos((i + 1) / segments);
        debugLines.addLine(p0, p1, 0x00ff00, 0.0);
    }
}
