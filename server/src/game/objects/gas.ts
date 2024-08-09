import { GameConfig, GasMode } from "../../../../shared/gameConfig";
import { math } from "../../../../shared/utils/math";
import { util } from "../../../../shared/utils/util";
import { type Vec2, v2 } from "../../../../shared/utils/v2";
import type { GameMap } from "../map";

export class Gas {
    /**
     * Current gas mode
     * Inactive: The gas is not active, used when only a single player is on the lobby
     * Waiting: The Gas has started and is waiting to advance to the next stage
     * Moving: The gas is moving between one stage and another
     */
    mode = GasMode.Inactive;

    /**
     * Current gas stage used to track the gas damage from `GameConfig.gas.damage`
     * Is incremented when gas mode changes
     */
    stage = 0;

    circleIdx = 0;

    /**
     * Current gas stage damage
     */
    damage = 0;

    /**
     * Gets current gas duration
     * returns 0 if gas if inactive
     * time the gas needs if gas is moving
     * or time the gas needs to wait to trigger the next stage
     */
    get duration() {
        if (this.mode === GasMode.Inactive) return 0;
        if (this.mode === GasMode.Moving) return this.gasTime;
        return this.waitTime;
    }

    /**
     * Gas wait time
     * This is the time to wait when on waiting mode
     */
    waitTime: number = GameConfig.gas.initWaitTime;
    /**
     * Gas Time
     * This is the time for the gas to move between one stage to another
     * When on moving mode
     */
    gasTime: number = GameConfig.gas.initGasTime;

    /**
     * Old gas radius
     * When gas mode is waiting this will be the same as `currentRad`
     * When gas mode is moving this will be the radius from the previous state
     * And will be used for lerping `currentRad`
     */
    radOld: number;
    /**
     * New gas radius
     * When gas mode is waiting this will be the radius for the new stage
     * When gas mode is moving this will be the radius at the end of the stage
     */
    radNew: number;
    /**
     * Current gas radius
     * When gas mode is waiting this and `radOld` will be the same
     * When gas mode is moving this will be a lerp between `radOld` and `radNew` using `gasT` as the interpolation factor
     */
    currentRad: number;

    /**
     * Old gas position
     * When gas mode is waiting this will be the same as `currentPos`
     * When gas mode is moving this will be the position from the previous state
     * And will be used for lerping `currentPos`
     */
    posOld: Vec2;
    /**
     * New gas position
     * When gas mode is waiting this will be the position for the new stage
     * When gas mode is moving this will be the position at the end of the stage
     */
    posNew: Vec2;
    /**
     * Current gas position
     * When gas mode is waiting this and `posOld` will be the same
     * When gas mode is moving this will be a lerp between `posOld` and `posNew` using `gasT` as the interpolation factor
     */
    currentPos: Vec2;

    /**
     * Gas Timer
     * in a range between 0 and 1
     */
    gasT = 0;

    /**
     * Current duration ticker
     */
    private _gasTicker = 0;

    /**
     * If the gas full state needs to be sent to clients
     */
    dirty = true;
    /**
     * If the gas time needs to be sent to clients
     */
    timeDirty = true;

    private _damageTicker = 0;

    doDamage = false;

    constructor(readonly map: GameMap) {
        const mapSize = (map.width + map.height) / 2;

        this.radNew = this.radOld = this.currentRad = GameConfig.gas.initWidth * mapSize;

        this.posOld = v2.create(map.width / 2, map.height / 2);

        this.posNew = v2.copy(this.posOld);
        this.currentPos = v2.copy(this.posOld);
    }

    update(dt: number) {
        if (this.gasT >= 1) {
            this.advanceGasStage();
        }

        this._gasTicker += dt;

        if (this.mode != GasMode.Inactive) {
            this.gasT = math.clamp(this._gasTicker / this.duration, 0, 1);
            this.timeDirty = true;
        }

        this.doDamage = false;
        this._damageTicker += dt;

        if (this._damageTicker >= GameConfig.gas.damageTickRate) {
            this._damageTicker = 0;
            this.doDamage = true;
        }

        if (this.mode === GasMode.Moving) {
            this.currentPos = v2.lerp(this.gasT, this.posOld, this.posNew);
            this.currentRad = math.lerp(this.gasT, this.radOld, this.radNew);
        }
    }

    advanceGasStage() {
        if (this.currentRad <= 0) {
            return;
        }
        if (this.mode !== GasMode.Waiting) {
            this.radOld = this.currentRad;

            if (this.radNew > 0) {
                this.radNew =
                    this.circleIdx < GameConfig.gas.firstMovingZone
                        ? this.currentRad * GameConfig.gas.widthDecay
                        : this.currentRad * GameConfig.gas.movingWidthDecay;

                if (this.radNew < GameConfig.gas.widthMin) {
                    this.radNew = 0;
                }

                this.posOld = v2.copy(this.posNew);

                if (this.circleIdx < GameConfig.gas.firstMovingZone) {
                    this.posNew = v2.add(
                        this.posOld,
                        util.randomPointInCircle(this.radNew)
                    );
                } else {
                    this.posNew = v2.add(
                        this.posOld,
                        util.randomPointOnCircle(this.radOld)
                    );
                }

                const rad = this.radNew;
                this.posNew = math.v2Clamp(
                    this.posNew,
                    v2.create(rad, rad),
                    v2.create(this.map.width - rad, this.map.height - rad)
                );
            }

            this.currentRad = this.radOld;
            this.currentPos = this.posOld;
        }

        switch (this.mode) {
            case GasMode.Inactive: {
                this.mode = GasMode.Waiting;
                break;
            }
            case GasMode.Waiting: {
                this.mode = GasMode.Moving;
                this.gasTime = math.max(
                    this.gasTime - GameConfig.gas.gasTimeDecay,
                    GameConfig.gas.gasTimeMin
                );
                if (this.radNew > 0) {
                    this.stage++;
                }
                break;
            }
            case GasMode.Moving: {
                this.waitTime = math.max(
                    this.waitTime - GameConfig.gas.waitTimeDecay,
                    GameConfig.gas.waitTimeMin
                );
                this.mode = GasMode.Waiting;
                if (this.radNew > 0) {
                    this.circleIdx++;
                    this.stage++;
                }
                break;
            }
        }

        this.damage =
            GameConfig.gas.damage[
                math.clamp(this.stage - 1, 0, GameConfig.gas.damage.length - 1)
            ];
        this._gasTicker = 0;
        this.dirty = true;
        this.timeDirty = true;
    }

    isInGas(pos: Vec2) {
        return v2.distance(pos, this.currentPos) >= this.currentRad;
    }

    flush() {
        this.dirty = false;
        this.timeDirty = false;
    }
}
