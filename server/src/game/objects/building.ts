import { MapObjectDefs } from "../../../../shared/defs/mapObjectDefs";
import type {
    BuildingDef,
    ObstacleDef,
    StructureDef,
} from "../../../../shared/defs/mapObjectsTyping";
import { Puzzles } from "../../../../shared/defs/puzzles";
import { ObjectType } from "../../../../shared/net/objectSerializeFns";
import { type AABB, type Collider, coldet } from "../../../../shared/utils/coldet";
import { collider } from "../../../../shared/utils/collider";
import { mapHelpers } from "../../../../shared/utils/mapHelpers";
import { math } from "../../../../shared/utils/math";
import { type Vec2, v2 } from "../../../../shared/utils/v2";
import type { Game } from "../game";
import { getColliders } from "../map";
import type { Decal } from "./decal";
import { BaseGameObject } from "./gameObject";
import { Obstacle } from "./obstacle";
import type { Structure } from "./structure";

export class Building extends BaseGameObject {
    mapObstacleBounds: Collider[] = [];

    override readonly __type = ObjectType.Building;
    bounds: AABB;

    type: string;

    layer: number;

    wallsToDestroy: number;
    ceilingDead = false;
    ceilingDamaged = false;
    ori: number;
    occupiedDisabled = false;
    occupied = false;

    hasPuzzle = false;
    puzzleSolved = false;
    puzzleErrSeq = 0;
    puzzleOrder: string = "";
    puzzleResetTimeout?: NodeJS.Timeout;

    scale = 1;

    childObjects: Array<Obstacle | Building | Structure | Decal> = [];
    parentStructure?: Structure;

    surfaces: Array<{
        type: string;
        colliders: Collider[];
    }> = [];

    zoomRegions: Array<{
        zoomIn?: AABB;
        zoomOut?: AABB;
        zoom?: number;
    }> = [];

    healRegions?: Array<{
        collision: AABB;
        healRate: number;
    }> = [];

    goreRegion?: AABB;

    hasOccupiedEmitters: boolean;
    emitterBounds: AABB;

    rot: number;

    zIdx: number;

    constructor(
        game: Game,
        type: string,
        pos: Vec2,
        ori: number,
        layer: number,
        parentStructureId?: number,
    ) {
        super(game, pos);
        this.layer = layer;
        this.ori = ori;
        this.type = type;

        const parentStructure = this.game.objectRegister.getById(parentStructureId ?? 0);
        if (parentStructure?.__type === ObjectType.Structure) {
            this.parentStructure = parentStructure;
        }
        const def = MapObjectDefs[this.type] as BuildingDef;

        this.rot = math.oriToRad(ori);

        this.zIdx = def.zIdx ?? 0;

        this.bounds = collider.transform(
            mapHelpers.getBoundingCollider(type),
            v2.create(0, 0),
            this.rot,
            1,
        ) as AABB;

        // transforms heal region local coordinates to world coordinates
        this.healRegions = def.healRegions?.map((hr) => {
            return {
                collision: collider.transform(
                    hr.collision,
                    this.pos,
                    this.rot,
                    this.scale,
                ) as AABB,
                healRate: hr.healRate,
            };
        });

        if (def.goreRegion) {
            this.goreRegion = collider.transform(
                def.goreRegion,
                this.pos,
                this.rot,
                this.scale,
            ) as AABB;
        }

        this.wallsToDestroy = def.ceiling.destroy?.wallCount ?? Infinity;

        this.mapObstacleBounds = getColliders(type).ground.map((coll) => {
            return collider.transform(coll, pos, this.rot, 1);
        });

        this.surfaces = [];

        for (let i = 0; i < def.floor.surfaces.length; i++) {
            const surfaceDef = def.floor.surfaces[i];
            const surface = {
                type: surfaceDef.type,
                colliders: [] as Collider[],
            };
            for (let i = 0; i < surfaceDef.collision.length; i++) {
                surface.colliders.push(
                    collider.transform(surfaceDef.collision[i], this.pos, this.rot, 1),
                );
            }
            this.surfaces.push(surface);
        }

        const zoomInBounds: AABB[] = [];
        for (let i = 0; i < def.ceiling.zoomRegions.length; i++) {
            const region = def.ceiling.zoomRegions[i];
            const zoomIn = region.zoomIn
                ? (collider.transform(
                      region.zoomIn,
                      this.pos,
                      this.rot,
                      this.scale,
                  ) as AABB)
                : undefined;

            if (zoomIn) {
                zoomInBounds.push(zoomIn);
            }

            this.zoomRegions.push({
                zoomIn,
                zoomOut: region.zoomOut
                    ? (collider.transform(
                          region.zoomOut,
                          this.pos,
                          this.rot,
                          this.scale,
                      ) as AABB)
                    : undefined,
                zoom: region.zoom,
            });
        }

        this.hasOccupiedEmitters =
            !!def.occupiedEmitters && def.occupiedEmitters.length > 0;
        const emitterBounds = coldet.boundingAabb(zoomInBounds);
        this.emitterBounds = collider.createAabb(emitterBounds.min, emitterBounds.max);

        if (def.puzzle) {
            this.hasPuzzle = true;
        }
    }

    obstacleDestroyed(obstacle: Obstacle): void {
        const def = MapObjectDefs[obstacle.type] as ObstacleDef;

        if (def.damageCeiling) {
            this.ceilingDamaged = true;
            this.setPartDirty();
        }

        if (def.disableBuildingOccupied) {
            this.occupiedDisabled = true;
        }

        if (obstacle.isWall) {
            // ceiling destroy logic
            this.wallsToDestroy--;
            if (this.wallsToDestroy <= 0 && !this.ceilingDead) {
                this.ceilingDead = true;
                this.setPartDirty();
            }
        }
    }

    puzzlePieceToggled(piece: Obstacle): void {
        if (this.puzzleResetTimeout) clearTimeout(this.puzzleResetTimeout);

        if (this.puzzleOrder.length) this.puzzleOrder += ",";
        this.puzzleOrder += piece.puzzlePiece;

        const puzzleDef = (MapObjectDefs[this.type] as BuildingDef).puzzle!;
        const puzzleOrder = Puzzles[puzzleDef.name];

        if (this.puzzleOrder === puzzleOrder) {
            for (const obj of this.childObjects) {
                if (obj instanceof Obstacle && obj.type === puzzleDef.completeUseType) {
                    setTimeout(() => {
                        obj.toggleDoor();
                    }, puzzleDef.completeUseDelay * 1000);
                }
            }
            this.puzzleSolved = true;
            if (this.parentStructure) {
                const def = MapObjectDefs[this.parentStructure.type] as StructureDef;
                if (def.interiorSound?.puzzle === puzzleDef.name) {
                    this.parentStructure.interiorSoundAlt = true;
                    this.parentStructure.setDirty();
                }
            }
            setTimeout(this.resetPuzzle.bind(this), puzzleDef.completeOffDelay * 1000);
            this.setPartDirty();
        } else if (this.puzzleOrder.length >= puzzleOrder.length) {
            this.puzzleErrSeq++;
            this.setPartDirty();
            this.puzzleResetTimeout = setTimeout(
                this.resetPuzzle.bind(this),
                puzzleDef.errorResetDelay * 1000,
            ) as NodeJS.Timeout;
        } else {
            this.puzzleResetTimeout = setTimeout(() => {
                this.puzzleErrSeq++;
                this.setPartDirty();
                setTimeout(
                    this.resetPuzzle.bind(this),
                    puzzleDef.errorResetDelay * 1000,
                    this,
                );
            }, puzzleDef.pieceResetDelay * 1000) as NodeJS.Timeout;
        }
    }

    onGoreRegionKill() {
        for (const obj of this.childObjects) {
            if (obj.__type === ObjectType.Decal) {
                obj.goreKills++;
                obj.setDirty();
            }
        }
    }

    resetPuzzle(): void {
        this.puzzleOrder = "";
        for (const piece of this.childObjects) {
            if (piece instanceof Obstacle && piece.isButton) {
                piece.button.canUse = !this.puzzleSolved;
                piece.button.onOff = false;
                piece.button.seq++;
                piece.setDirty();
            }
        }
        this.setPartDirty();
    }
}
