import { GameObjectDefs } from "../../../../shared/defs/gameObjectDefs";
import { MapObjectDefs } from "../../../../shared/defs/mapObjectDefs";
import type { ObstacleDef } from "../../../../shared/defs/mapObjectsTyping";
import { DamageType, GameConfig } from "../../../../shared/gameConfig";
import { ObjectType } from "../../../../shared/net/objectSerializeFns";
import { type AABB, type Collider, coldet } from "../../../../shared/utils/coldet";
import { collider } from "../../../../shared/utils/collider";
import { math } from "../../../../shared/utils/math";
import { util } from "../../../../shared/utils/util";
import { type Vec2, v2 } from "../../../../shared/utils/v2";
import type { Game } from "../game";
import type { Building } from "./building";
import { BaseGameObject, type DamageParams } from "./gameObject";
import { Player } from "./player";

export class Obstacle extends BaseGameObject {
    override readonly __type = ObjectType.Obstacle;
    bounds: AABB;
    collider!: Collider;

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
        openCollider: Collider;
        openAltCollider: Collider;
        closedCollider: Collider;
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
    isSkin: boolean;
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
        puzzlePiece?: string,
        isSkin?: boolean,
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

        if (def.type !== "obstacle") {
            throw new Error(`Invalid obstacle with type ${type}`);
        }
        this.bounds = collider.toAabb(
            collider.transform(def.collision, v2.create(0, 0), this.rot, this.scale),
        );

        this.height = def.height;

        this.isSkin = isSkin ?? false;
        this.collidable = (def.collidable && !this.isSkin) ?? true;
        this.isWindow = def.isWindow ?? false;
        this.isWall = def.isWall ?? false;

        this.maxHealth = def.health;
        this.health = def.health;

        this.maxScale = scale;
        this.minScale = def.scale.destroy;

        this.updateCollider();

        this.mapObstacleBounds = [this.collider];

        this.destructible = !!def.destructible;

        if (def.door) {
            this.isDoor = true;

            let openOri = this.ori;
            let openAltOri = this.ori;
            if (!def.door.slideToOpen) {
                switch (ori) {
                    case 0:
                        openOri = 1;
                        openAltOri = 3;
                        break;
                    case 1:
                        openOri = 2;
                        openAltOri = 0;
                        break;
                    case 2:
                        openOri = 3;
                        openAltOri = 1;
                        break;
                    case 3:
                        openOri = 0;
                        openAltOri = 2;
                        break;
                }
            }

            let slideOffset = def.door.slideOffset ?? 0;
            let openPos = def.door.slideToOpen
                ? v2.add(this.pos, v2.rotate(v2.create(0, -slideOffset), this.rot))
                : this.pos;

            this.door = {
                open: false,
                canUse: def.door.canUse,
                hinge: def.hinge!,
                closedOri: this.ori,
                openOri,
                openAltOri,
                openDelay: def.door.openDelay ?? 0,
                seq: 1,
                locked: def.door.locked ?? false,
                openOneWay: def.door.openOneWay ?? false,
                openOnce: def.door.openOnce ?? false,
                autoOpen: def.door.autoOpen ?? false,
                autoClose: def.door.autoClose ?? false,
                autoCloseDelay: def.door.autoCloseDelay ?? 0,
                slideToOpen: def.door.slideToOpen ?? false,
                slideOffset: slideOffset,
                closedPos: v2.copy(this.pos),
                openPos,
                openCollider: collider.transform(
                    def.collision,
                    openPos,
                    math.oriToRad(openOri),
                    this.scale,
                ),
                openAltCollider: collider.transform(
                    def.collision,
                    openPos,
                    math.oriToRad(openAltOri),
                    this.scale,
                ),
                closedCollider: collider.copy(this.collider),
            };

            this.interactionRad = def.door.interactionRad;
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
                useDir: def.button.useDir,
            };
            this.interactionRad = def.button.interactionRad;
        }

        if (this.interactionRad) {
            // add interaction radius margin to the bounds
            const margin = v2.create(this.interactionRad, this.interactionRad);
            v2.set(this.bounds.min, v2.sub(this.bounds.min, margin));
            v2.set(this.bounds.max, v2.add(this.bounds.max, margin));
        }
    }

    updateCollider() {
        const def = MapObjectDefs[this.type] as ObstacleDef;
        this.collider = collider.transform(def.collision, this.pos, this.rot, this.scale);
        this.game.grid.updateObject(this);
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
        if (this.isSkin) return;

        const def = MapObjectDefs[this.type] as ObstacleDef;
        if (this.health === 0 || !this.destructible) return;

        if (params.damageType === DamageType.Player) {
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
        }

        this.health -= params.amount!;
        this.health = math.max(0, this.health);

        this.healthT = math.clamp(this.health / this.maxHealth, 0, 1);

        if (this.minScale < 1) {
            this.scale = math.lerp(this.healthT, this.minScale, this.maxScale);
            this.updateCollider();
        }

        // need to send full object for obstacles with explosions
        // so smoke particles work on the client
        // since they depend on healthT
        if (def.explosion) this.setDirty();
        else this.setPartDirty();

        if (this.health <= 0) {
            this.kill(params);
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

        const loot = [...def.loot];

        if (params.source instanceof Player && params.source.hasPerk("scavenger")) {
            loot.push({
                tier: "tier_world",
                min: 1,
                max: 1,
                props: {},
            });
        }

        for (const lootTierOrItem of loot) {
            if ("tier" in lootTierOrItem) {
                const count = util.randomInt(lootTierOrItem.min!, lootTierOrItem.max!);

                for (let i = 0; i < count; i++) {
                    const items = this.game.lootBarn.getLootTable(lootTierOrItem.tier!);

                    for (const item of items) {
                        this.game.lootBarn.addLoot(
                            item.name,
                            v2.add(lootPos, v2.mul(v2.randomUnit(), 0.2)),
                            this.layer,
                            item.count,
                            undefined,
                            undefined, // undefined to use default push speed value
                            params.dir,
                            lootTierOrItem.props?.preloadGuns,
                        );
                    }
                }
            } else {
                this.game.lootBarn.addLoot(
                    lootTierOrItem.type!,
                    v2.add(lootPos, v2.mul(v2.randomUnit(), 0.2)),
                    this.layer,
                    lootTierOrItem.count!,
                    undefined,
                    undefined,
                    params.dir,
                    lootTierOrItem.props?.preloadGuns,
                );
            }
        }

        if (def.createSmoke) {
            this.game.smokeBarn.addEmitter(this.pos, this.layer);
        }

        if (def.explosion) {
            this.game.explosionBarn.addExplosion(
                def.explosion,
                this.pos,
                this.layer,
                "",
                this.type,
                params.damageType,
                params.source,
            );
        }

        if (def.swapWeaponOnDestroy && params.source instanceof Player) {
            const player = params.source as Player;

            player.potatoModeWeaponSwitch(params.gameSourceType);
        }

        this.parentBuilding?.obstacleDestroyed(this);

        if (this.isWall) {
            const objs = this.game.grid.intersectCollider(this.collider);
            for (let i = 0; i < objs.length; i++) {
                const obj = objs[i];
                if (obj.__type !== ObjectType.Obstacle) continue;
                if (obj.dead) continue;
                if (!util.sameLayer(this.layer, obj.layer)) continue;

                let collision: Collider | undefined = undefined;
                if (obj.isDoor) {
                    collision = collider.createCircle(obj.pos, 0.5);
                } else if (obj.type.includes("window_open")) {
                    collision = obj.collider;
                }
                if (!collision) continue;

                if (coldet.test(this.collider, collision)) {
                    obj.kill(params);
                    break;
                }
            }
        }
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
                        this,
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
                    dir: v2.create(0, 0),
                });
            }, this.button.useDelay * 1000);
        }
        this.setDirty();
    }

    toggleDoor(player?: Player, useDir?: Vec2): void {
        this.door.open = !this.door.open;

        if (!this.door.slideToOpen) {
            if (this.door.open) {
                if (
                    (player?.isOnOtherSide(this) && !this.door.openOneWay) ??
                    useDir?.x === 1
                ) {
                    this.ori = this.door.openAltOri;
                    this.collider = this.door.openAltCollider;
                } else {
                    this.ori = this.door.openOri;
                    this.collider = this.door.openCollider;
                }
            } else {
                this.ori = this.door.closedOri;
                this.collider = this.door.closedCollider;
            }
        } else {
            if (this.door.open) {
                this.pos = this.door.openPos;
                this.collider = this.door.openCollider;
            } else {
                this.collider = this.door.closedCollider;
                this.pos = this.door.closedPos;
            }
        }
        this.rot = math.oriToRad(this.ori);

        const def = MapObjectDefs[this.type] as ObstacleDef;
        this.bounds = collider.toAabb(
            collider.transform(def.collision, v2.create(0, 0), this.rot, this.scale),
        );

        const margin = v2.create(this.interactionRad, this.interactionRad);
        v2.set(this.bounds.min, v2.sub(this.bounds.min, margin));
        v2.set(this.bounds.max, v2.add(this.bounds.max, margin));
        this.game.grid.updateObject(this);
        this.checkLayer();
        this.setDirty();
    }
}
