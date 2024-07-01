import { MapObjectDefs } from "../../../shared/defs/mapObjectDefs";
import type { BuildingDef, ObstacleDef } from "../../../shared/defs/mapObjectsTyping";
import { GameConfig } from "../../../shared/gameConfig";
import { coldet } from "../../../shared/utils/coldet";
import { collider } from "../../../shared/utils/collider";
import { math } from "../../../shared/utils/math";
import { ObjectType } from "../../../shared/utils/objectSerializeFns";
import { util } from "../../../shared/utils/util";
import { type Vec2, v2 } from "../../../shared/utils/v2";
import type { Game } from "../game";
import { BaseGameObject } from "./gameObject";

export class AirdropBarn {
    airdrops: Airdrop[] = [];

    constructor(readonly game: Game) {}

    addAirdrop(pos: Vec2) {
        const obstacle = "airdrop_crate_01";

        const airdrop = new Airdrop(this.game, pos, obstacle);
        this.airdrops.push(airdrop);
        this.game.objectRegister.register(airdrop);
    }

    update(dt: number) {
        for (let i = 0; i < this.airdrops.length; i++) {
            const airdrop = this.airdrops[i];
            airdrop.update(dt);
        }
    }

    flush() {
        for (let i = 0; i < this.airdrops.length; i++) {
            const airdrop = this.airdrops[i];
            if (airdrop.landed) {
                this.airdrops.splice(i, 1);
            }
        }
    }
}

export class Airdrop extends BaseGameObject {
    bounds = collider.createAabbExtents(v2.create(0, 0), v2.create(5, 5));

    override readonly __type = ObjectType.Airdrop;

    layer = 0;

    fallTime = GameConfig.airdrop.fallTime;
    fallT = 0;
    landed = false;

    obstacleType: string;

    constructor(game: Game, pos: Vec2, obstacleType: string) {
        super(game, pos);
        this.obstacleType = obstacleType;
    }

    update(dt: number) {
        if (this.landed) return;
        this.fallTime -= dt;
        this.fallT = math.remap(this.fallTime, 0, GameConfig.airdrop.fallTime, 1, 0);

        this.fallT = math.clamp(this.fallT, 0, 1);
        this.setPartDirty();
        if (this.fallT === 1) {
            this.landed = true;
            this.setDirty();

            const def = MapObjectDefs[this.obstacleType] as ObstacleDef;
            const collision = collider.transform(def.collision, this.pos, 0, 1);

            const objs = this.game.grid.intersectCollider(collision);
            for (const obj of objs) {
                if (
                    (obj.__type === ObjectType.Player ||
                        obj.__type === ObjectType.Obstacle) &&
                    coldet.test(obj.collider, collision) &&
                    util.sameLayer(obj.layer, 0)
                ) {
                    obj.damage({
                        amount: 100,
                        damageType: GameConfig.DamageType.Airdrop,
                        dir: "dir" in obj ? obj.dir : v2.create(0, 0)
                    });
                } else if (obj.__type === ObjectType.Building) {
                    const def = MapObjectDefs[obj.type] as BuildingDef;
                    if (def.ceiling.destroy) {
                        obj.ceilingDead = true;
                        obj.setPartDirty();
                    } else {
                    }
                }
            }

            this.game.map.genObstacle(this.obstacleType, this.pos, 0);
        }
    }
}
