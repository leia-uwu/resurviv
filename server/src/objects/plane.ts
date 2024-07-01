import { GameObjectDefs } from "../../../shared/defs/gameObjectDefs";
import type { ThrowableDef } from "../../../shared/defs/gameObjects/throwableDefs";
import { GameConfig } from "../../../shared/gameConfig";
import { type Vec2, v2 } from "../../../shared/utils/v2";
import type { Game } from "../game";

export class PlaneBarn {
    planes: Plane[] = [];

    nextPlaneid = 0;

    constructor(readonly game: Game) {}
    update(dt: number) {
        for (let i = 0; i < this.planes.length; i++) {
            const plane = this.planes[i];
            plane.update(dt);
        }
    }

    addPlane(action: number, targetPos: Vec2, dir?: Vec2) {
        const len = v2.length(targetPos);
        dir = dir ?? len > 0.00001 ? v2.div(targetPos, len) : v2.create(1, 0);
        const plane = new Plane(
            this.game,
            action,
            this.nextPlaneid++,
            v2.create(0, 0),
            targetPos,
            dir
        );
        this.planes.push(plane);
    }
}

export class Plane {
    game: Game;
    pos: Vec2;
    targetPos: Vec2;
    action: number;
    id: number;
    planeDir: Vec2;
    config: typeof GameConfig.airdrop | typeof GameConfig.airstrike;
    rad: number;

    actionComplete = false;
    bombCount = 0;

    constructor(
        game: Game,
        action: number,
        id: number,
        pos: Vec2,
        targetPos: Vec2,
        dir: Vec2
    ) {
        this.game = game;
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

        switch (this.action) {
            case GameConfig.Plane.Airstrike:
                {
                    const config = this.config as typeof GameConfig.airstrike;
                    if (v2.distance(this.pos, this.targetPos) < 10) {
                        this.actionComplete = true;

                        if (this.bombCount < config.bombCount) {
                            this.bombCount++;
                            const pos = v2.add(
                                this.pos,
                                v2.mul(v2.randomUnit(), config.bombJitter)
                            );
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
                break;
        }
    }
}
