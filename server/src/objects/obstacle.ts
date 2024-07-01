import { GameObjectDefs } from "../../../shared/defs/gameObjectDefs";
import { MapObjectDefs } from "../../../shared/defs/mapObjectDefs";
import type { ObstacleDef } from "../../../shared/defs/mapObjectsTyping";
import { GameConfig } from "../../../shared/gameConfig";
import * as net from "../../../shared/net";
import { type Collider, coldet } from "../../../shared/utils/coldet";
import { collider } from "../../../shared/utils/collider";
import { mapHelpers } from "../../../shared/utils/mapHelpers";
import { math } from "../../../shared/utils/math";
import { ObjectType } from "../../../shared/utils/objectSerializeFns";
import { util } from "../../../shared/utils/util";
import { type Vec2, v2 } from "../../../shared/utils/v2";
import type { Game } from "../game";
import type { Building } from "./building";
import { BaseGameObject, type DamageParams } from "./gameObject";
import type { Player } from "./player";

export class Obstacle extends BaseGameObject {
    override readonly __type = ObjectType.Obstacle;

    bounds: Collider;

    collider: Collider;

    mapObstacleBounds: Collider[];

    type: string;
    ori: number;
    scale: number;

    healthT = 1;

    health: number;
    maxHealth: number;

    minScale: number;
    maxScale: number;

    dead = false;
    isDoor = false;

    interactionRad = 0;

    door!: {
        open: boolean;
        canUse: boolean;
        locked: boolean;
        hinge: Vec2;
        closedOri: number;
        openOri: number;
        openAltOri: number;
        openOneWay: number | boolean;
        openDelay: number;
        seq: number;
        openOnce: boolean;
        autoOpen: boolean;
        autoClose: boolean;
        autoCloseDelay: number;
        slideToOpen: boolean;
        slideOffset: number;
        closedPos: Vec2;
        openPos: Vec2;
    };

    closeTimeout?: NodeJS.Timeout;

    isButton = false;
    button!: {
        onOff: boolean;
        canUse: boolean;
        seq: number;
        useOnce: boolean;
        useType: string;
        useDelay: number;
        useDir: Vec2;
    };

    isPuzzlePiece = false;
    puzzlePiece?: string;
    parentBuildingId?: number;
    parentBuilding?: Building;
    isSkin = false;
    skinPlayerId?: number;

    height: number;

    collidable: boolean;
    isWindow: boolean;
    isWall: boolean;

    layer: number;

    originalLayer: number;

    destructible: boolean;

    rot: number;

    get interactable() {
        return this.button?.canUse ?? this.door?.canUse;
    }

    constructor(
        game: Game,
        pos: Vec2,
        type: string,
        layer: number,
        ori = 0,
        scale = 1,
        parentBuildingId?: number,
        puzzlePiece?: string
    ) {
        super(game, pos);
        this.type = type;
        this.ori = ori;
        this.scale = scale;
        this.layer = layer;
        this.originalLayer = layer;
        this.parentBuildingId = parentBuildingId;

        const building = this.game.objectRegister.getById(this.parentBuildingId ?? 0);
        if (building?.__type === ObjectType.Building) {
            this.parentBuilding = building;
        }

        this.isPuzzlePiece = !!puzzlePiece;
        this.puzzlePiece = puzzlePiece;
        const def = MapObjectDefs[type];

        this.rot = math.oriToRad(ori);

        this.bounds = collider.transform(
            mapHelpers.getBoundingCollider(type),
            v2.create(0, 0),
            this.rot,
            net.Constants.MapObjectMaxScale
        );

        if (def === undefined || def.type !== "obstacle") {
            throw new Error(`Invalid obstacle with type ${type}`);
        }

        this.height = def.height;

        this.collidable = def.collidable ?? true;
        this.isWindow = def.isWindow ?? false;
        this.isWall = def.isWall ?? false;

        this.maxHealth = def.health;
        this.health = def.health;

        this.maxScale = scale;
        this.minScale = def.scale.destroy;

        this.collider = collider.transform(def.collision, pos, this.rot, scale);

        this.mapObstacleBounds = [this.collider];

        this.destructible = !!def.destructible;

        if (def.door) {
            this.isDoor = true;
            this.door = {
                open: false,
                canUse: def.door.canUse,
                hinge: def.hinge!,
                closedOri: this.ori,
                openOri: 0,
                openAltOri: 0,
                openDelay: def.door.openDelay ?? 0,
                seq: 1,
                locked: def.door.locked ?? false,
                openOneWay: def.door.openOneWay ?? false,
                openOnce: def.door.openOnce ?? false,
                autoOpen: def.door.autoOpen ?? false,
                autoClose: def.door.autoClose ?? false,
                autoCloseDelay: def.door.autoCloseDelay ?? 0,
                slideToOpen: def.door.slideToOpen ?? false,
                slideOffset: def.door.slideOffset ?? 0,
                closedPos: v2.copy(this.pos),
                openPos: v2.create(0, 0)
            };

            this.interactionRad = def.door.interactionRad;

            if (!this.door.slideToOpen) {
                switch (ori) {
                    case 0:
                        this.door.openOri = 1;
                        this.door.openAltOri = 3;
                        break;
                    case 1:
                        this.door.openOri = 2;
                        this.door.openAltOri = 0;
                        break;
                    case 2:
                        this.door.openOri = 3;
                        this.door.openAltOri = 1;
                        break;
                    case 3:
                        this.door.openOri = 0;
                        this.door.openAltOri = 2;
                        break;
                }
            }
            this.checkLayer();
        }

        if (def.button) {
            this.isButton = true;
            this.button = {
                onOff: false,
                canUse: true,
                seq: 1,
                useOnce: def.button.useOnce,
                useType: def.button.useType!,
                useDelay: def.button.useDelay,
                useDir: def.button.useDir
            };
            this.interactionRad = def.button.interactionRad;
        }
    }

    checkLayer(): void {
        // @hack this door shouldn't switch layers
        if (this.type === "saloon_door_secret" || this.type === "house_door_01") return;
        let newLayer = this.originalLayer;
        const def = MapObjectDefs[this.type] as ObstacleDef;
        const coll = collider.createCircle(this.pos, def.door!.interactionRad + 1);
        const objs = this.game.grid.intersectCollider(coll);
        for (const obj of objs) {
            if (obj.__type === ObjectType.Structure) {
                for (const stair of obj.stairs) {
                    if (coldet.test(coll, stair.downAabb)) {
                        newLayer = 3;
                    } else if (coldet.test(coll, stair.upAabb)) {
                        newLayer = 2;
                    }
                }
            }
        }
        if (newLayer !== this.layer) {
            this.layer = newLayer;
            this.setDirty();
        }
    }

    damage(params: DamageParams): void {
        const def = MapObjectDefs[this.type] as ObstacleDef;
        if (this.health === 0 || !this.destructible) return;

        let armorPiercing = false;
        let stonePiercing = false;

        if (params.gameSourceType) {
            const sourceDef = GameObjectDefs[params.gameSourceType] as
                | {
                      armorPiercing?: boolean;
                      stonePiercing?: boolean;
                  }
                | undefined;
            armorPiercing = sourceDef?.armorPiercing ?? false;
            stonePiercing = sourceDef?.stonePiercing ?? false;
        }

        if (def.armorPlated && !armorPiercing) return;
        if (def.stonePlated && !stonePiercing) return;

        this.health -= params.amount!;

        if (this.health <= 0) {
            this.kill(params);
        } else {
            this.healthT = this.health / this.maxHealth;
            if (this.minScale < 1) {
                this.scale =
                    this.healthT * (this.maxScale - this.minScale) + this.minScale;
                this.collider = collider.transform(
                    def.collision,
                    this.pos,
                    math.oriToRad(this.ori),
                    this.scale
                );
            }

            // need to send full object for obstacles with explosions
            // so smoke particles work on the client
            // since they depend on healthT
            if (def.explosion) this.setDirty();
            else this.setPartDirty();
        }
    }

    kill(params: DamageParams) {
        const def = MapObjectDefs[this.type] as ObstacleDef;
        this.health = this.healthT = 0;
        this.dead = true;
        this.setDirty();

        if (def.destroyType) {
            this.game.map.genObstacle(def.destroyType, this.pos, this.layer, this.ori);
        }

        const lootPos = v2.copy(this.pos);
        if (def.lootSpawn) {
            v2.set(lootPos, v2.add(this.pos, v2.rotate(def.lootSpawn.offset, this.rot)));
        }

        for (const lootTierOrItem of def.loot) {
            if ("tier" in lootTierOrItem) {
                const count = util.randomInt(lootTierOrItem.min!, lootTierOrItem.max!);

                for (let i = 0; i < count; i++) {
                    const items = this.game.lootBarn.getLootTable(lootTierOrItem.tier!);

                    for (const item of items) {
                        this.game.lootBarn.addLoot(
                            item.name,
                            lootPos,
                            this.layer,
                            item.count,
                            undefined,
                            undefined,
                            params.dir
                        );
                    }
                }
            } else {
                this.game.lootBarn.addLoot(
                    lootTierOrItem.type!,
                    lootPos,
                    this.layer,
                    lootTierOrItem.count!,
                    undefined,
                    undefined,
                    params.dir
                );
            }
        }

        if (def.explosion) {
            this.game.explosionBarn.addExplosion(
                def.explosion,
                this.pos,
                this.layer,
                "",
                this.type,
                params.damageType,
                params.source
            );
        }

        this.parentBuilding?.obstacleDestroyed(this);
    }

    interact(player?: Player, auto = false): void {
        if (this.dead) return;

        if (this.isDoor) {
            if (this.door.autoOpen && !auto) return;
            clearTimeout(this.closeTimeout);

            if (this.door.autoClose) {
                this.closeTimeout = setTimeout(() => {
                    if (this.door.open) {
                        this.toggleDoor(player);
                    }
                }, this.door.autoCloseDelay * 1000);
            }

            if (this.door.autoOpen && this.door.open) return;

            if (
                this.door.canUse &&
                (player?.isOnOtherSide(this) || !(this.door.openOneWay === true))
            ) {
                this.door.seq++;
                if (this.door.openOnce) {
                    this.door.canUse = false;
                }

                this.setDirty();
                if (this.door.openDelay > 0) {
                    setTimeout(
                        () => {
                            this.toggleDoor(player);
                        },
                        this.door.openDelay * 1000,
                        this
                    );
                } else {
                    this.toggleDoor(player);
                }
            }
        }

        if (this.isButton && this.button.canUse) {
            this.useButton();
        }
    }

    useButton(): void {
        if (!this.button.canUse) return;

        this.button.onOff = !this.button.onOff;
        this.button.seq++;

        if (this.button.useOnce) {
            this.button.canUse = false;
        }

        if (this.button.useType && this.parentBuilding) {
            for (const obj of this.parentBuilding.childObjects) {
                if (obj instanceof Obstacle && obj.type === this.button.useType) {
                    setTimeout(() => {
                        obj.toggleDoor(undefined, this.button.useDir);
                    }, this.button.useDelay * 1000);
                }
            }
        }
        if (this.button.onOff && this.isPuzzlePiece) {
            this.parentBuilding?.puzzlePieceToggled(this);
        }
        const def = MapObjectDefs[this.type] as ObstacleDef;
        if (def.button?.destroyOnUse && def.destroyType) {
            setTimeout(() => {
                this.kill({
                    damageType: GameConfig.DamageType.Airdrop,
                    dir: v2.create(0, 0)
                });
            }, this.button.useDelay * 1000);
        }
        this.setDirty();
    }

    toggleDoor(player?: Player, useDir?: Vec2): void {
        this.door.open = !this.door.open;
        const def = MapObjectDefs[this.type] as ObstacleDef;

        if (!this.door.slideToOpen) {
            if (this.door.open) {
                if (
                    (player?.isOnOtherSide(this) && !this.door.openOneWay) ??
                    useDir?.x === 1
                ) {
                    this.ori = this.door.openAltOri;
                } else {
                    this.ori = this.door.openOri;
                }
            } else {
                this.ori = this.door.closedOri;
                this.collider = collider.transform(
                    def.collision,
                    this.pos,
                    math.oriToRad(this.ori),
                    this.scale
                );
            }
        } else {
            if (this.door.open) {
                this.pos = v2.add(
                    this.pos,
                    v2.rotate(v2.create(0, -this.door.slideOffset), this.rot)
                );
            } else {
                this.pos = this.door.closedPos;
            }
        }
        this.rot = math.oriToRad(this.ori);
        this.collider = collider.transform(def.collision, this.pos, this.rot, this.scale);

        this.bounds = collider.transform(def.collision, v2.create(0, 0), this.rot, 1);
        this.game.grid.updateObject(this);
        this.checkLayer();
        this.setDirty();
    }
}
