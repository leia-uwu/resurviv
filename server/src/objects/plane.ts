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

    addPlane(action: number, targetPos: Vec2) {
        const len = v2.length(targetPos);
        const dir = len > 0.00001 ? v2.div(targetPos, len) : v2.create(1, 0);
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
    actionComplete = false;
    config: typeof GameConfig.airdrop | typeof GameConfig.airstrike;
    rad: number;

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
                    if (
                        !this.actionComplete &&
                        v2.distance(this.pos, this.targetPos) < 5
                    ) {
                        this.actionComplete = true;

                        for (let i = 0; i < config.bombCount; i++) {
                            const pos = v2.add(
                                this.pos,
                                v2.mul(v2.randomUnit(), config.bombJitter)
                            );
                            this.game.projectileBarn.addProjectile(
                                0,
                                "bomb_iron",
                                pos,
                                5,
                                0,
                                v2.mul(v2.randomUnit(), config.bombVel),
                                4,
                                GameConfig.DamageType.Airstrike
                            );
                        }
                    }
                }
                break;
        }
    }
}
