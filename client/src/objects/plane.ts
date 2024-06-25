import * as PIXI from "pixi.js-legacy";
import { GameConfig } from "../../../shared/gameConfig";
import type { Plane as PlaneData, UpdateMsg } from "../../../shared/msgs/updateMsg";
import { collider } from "../../../shared/utils/collider";
import { math } from "../../../shared/utils/math";
import { util } from "../../../shared/utils/util";
import { v2 } from "../../../shared/utils/v2";
import type { AudioManager } from "../audioManager";
import type { Camera } from "../camera";
import type { SoundHandle } from "../createJS";
import type { Map } from "../map";
import type { Renderer } from "../renderer";
import type { UiManager } from "../ui/ui";
import type { Vec2 } from "./../../../shared/utils/v2";
import type { Player } from "./player";

const planeElevateTime = 2;

class Plane {
    active = false;
    sprite = new PIXI.Sprite();

    soundRangeMult!: number;
    id!: number;
    pos!: Vec2;
    planeDir!: Vec2;
    actionComplete!: boolean;

    dirty!: boolean;

    soundInstance!: SoundHandle | null;
    soundUpdateThrottle!: number;

    alpha!: number;
    renderAlpha!: number;
    spriteUpdateTime!: number;

    type!: number;
    config!: typeof GameConfig.airdrop | typeof GameConfig.airstrike;

    rad!: number;
    planeSound!: string;

    constructor() {
        this.sprite.anchor.set(0.5, 0.5);
        this.sprite.visible = false;
    }

    init(data: PlaneData, map: Map) {
        this.id = data.id;
        this.pos = v2.copy(data.pos);
        this.planeDir = v2.copy(data.planeDir);
        this.actionComplete = data.actionComplete;

        this.active = true;
        this.dirty = false;

        this.soundInstance = null;
        this.soundUpdateThrottle = 0;

        this.alpha = 0.75;
        this.renderAlpha = 1;
        this.spriteUpdateTime = 0;

        this.type = data.action;
        this.config =
            this.type == GameConfig.Plane.Airdrop
                ? GameConfig.airdrop
                : GameConfig.airstrike;

        this.rad = this.config.planeRad;
        switch (this.type) {
            case GameConfig.Plane.Airdrop:
                this.sprite.texture = PIXI.Texture.from(
                    map.getMapDef().biome.airdrop.planeImg
                );
                this.planeSound = map.getMapDef().biome.airdrop.planeSound;
                break;
            case GameConfig.Plane.Airstrike:
                this.sprite.texture = PIXI.Texture.from("map-plane-02.img");
                this.planeSound = "fighter_01";
        }

        this.sprite.visible = true;
        this.sprite.rotation = Math.atan2(this.planeDir.x, this.planeDir.y);
    }

    free(audioManager: AudioManager) {
        // Don't free this plane until it's fully elevated
        if (this.spriteUpdateTime >= planeElevateTime) {
            if (this.soundInstance) {
                audioManager.stopSound(this.soundInstance);
                this.soundInstance = null;
            }
            this.sprite.visible = false;
            this.active = false;
        }
    }
}

class AirstrikeZone {
    active = false;
    pos = v2.create(0, 0);
    rad = 0;
    duration = 0;
    ticker = 0;
    gfx = new PIXI.Graphics();

    renderPos!: Vec2;
    renderRad!: number;

    constructor(public container: PIXI.Container) {
        container.addChild(this.gfx);
    }

    init(pos: Vec2, rad: number, duration: number) {
        this.active = true;
        this.pos = v2.copy(pos);
        this.rad = rad;
        this.duration = duration;
        this.ticker = 0;
        this.renderPos = v2.create(0, 0);
        this.renderRad = 0;
        this.gfx.visible = true;
    }

    update(dt: number) {
        this.ticker += dt;
        this.gfx.visible = true;
        if (this.ticker >= this.duration) {
            this.gfx.visible = false;
            this.active = false;
        }
    }

    render(uiManager: UiManager, map: Map, _debug: unknown) {
        // uiManager.getMapPosFromWorldPos is only valid after
        // uiManager.update() is run, so this logic must be run
        // afterward; render() is a reasonable place to do it.
        const pos = uiManager.getMapPosFromWorldPos(this.pos, map);
        const edge = uiManager.getMapPosFromWorldPos(
            v2.add(this.pos, v2.create(this.rad, 0)),
            map
        );
        const rad = v2.length(v2.sub(edge, pos));

        const posChanged = !v2.eq(this.renderPos, pos, 0.0001);
        const radChanged = !math.eqAbs(this.renderRad, rad, 0.0001);
        if (posChanged) {
            this.renderPos = v2.copy(pos);
        }
        if (radChanged) {
            this.renderRad = rad;
        }

        if (posChanged) {
            this.gfx.position.set(this.renderPos.x, this.renderPos.y);
        }

        if (radChanged) {
            this.gfx.clear();
            this.gfx.lineStyle(1.5, 0xeaff00);
            this.gfx.beginFill(0xeaff00, 0.2);
            this.gfx.drawCircle(0, 0, this.renderRad);
            this.gfx.endFill();
        }

        const alpha =
            math.smoothstep(this.ticker, 0, 0.5) *
            (1 - math.smoothstep(this.ticker, this.duration - 0.5, this.duration));
        this.gfx.alpha = alpha;
    }
}

export class PlaneBarn {
    planes: Plane[] = [];
    airstrikeZones: AirstrikeZone[] = [];
    airstrikeZoneContainer = new PIXI.Container();

    constructor(public audioManager: AudioManager) {}

    free() {
        for (let i = 0; i < this.planes.length; i++) {
            this.planes[i].free(this.audioManager);
        }
    }

    updatePlanes(planeData: PlaneData[], map: Map) {
        // Mark existing planes as dirty
        for (let i = 0; i < this.planes.length; i++) {
            this.planes[i].dirty = true;
        }

        // Update planes and allocate new ones as needed
        for (let i = 0; i < planeData.length; i++) {
            const data = planeData[i];
            let plane = null;
            for (let j = 0; j < this.planes.length; j++) {
                const p = this.planes[j];
                if (p.active && p.id == data.id) {
                    plane = p;
                    break;
                }
            }
            plane ||= this.addPlane(data, map);
            plane.dirty = false;
            plane.actionComplete = data.actionComplete;
        }
        // Delete old planes
        for (let i = 0; i < this.planes.length; i++) {
            const p = this.planes[i];
            if (p.active && p.dirty) {
                p.free(this.audioManager);
            }
        }
    }

    addPlane(data: PlaneData, map: Map) {
        let p = null;
        for (let i = 0; i < this.planes.length; i++) {
            if (!this.planes[i].active) {
                p = this.planes[i];
                break;
            }
        }
        if (!p) {
            p = new Plane();
            this.planes.push(p);
        }

        p.init(data, map);
        return p;
    }

    createAirstrikeZone(data: UpdateMsg["airstrikeZones"][number]) {
        let zone = null;
        for (let i = 0; i < this.airstrikeZones.length; i++) {
            if (!this.airstrikeZones[i]) {
                zone = this.airstrikeZones[i];
                break;
            }
        }
        if (!zone) {
            zone = new AirstrikeZone(this.airstrikeZoneContainer);
            this.airstrikeZones.push(zone);
        }
        zone.init(data.pos, data.rad, data.duration);
        return zone;
    }

    update(
        dt: number,
        camera: Camera,
        activePlayer: Player,
        map: Map,
        renderer: Renderer
    ) {
        for (let i = 0; i < this.planes.length; i++) {
            const p = this.planes[i];
            if (p.active) {
                let layer = 0;
                if (
                    (!!util.sameLayer(layer, activePlayer.layer) ||
                        !!(activePlayer.layer & 2)) &&
                    (!(activePlayer.layer & 2) ||
                        !map.insideStructureMask(collider.createCircle(p.pos, 1)))
                ) {
                    layer |= 2;
                }

                // Do we need to reconcile the client plane and the server plane pos?
                p.pos = v2.add(p.pos, v2.mul(p.planeDir, dt * p.config.planeVel));

                // If the drop is deployed, lerp towards the elevated sprite values
                if (p.actionComplete) {
                    p.spriteUpdateTime = Math.min(
                        p.spriteUpdateTime + dt,
                        planeElevateTime
                    );
                    p.rad = math.lerp(
                        p.spriteUpdateTime,
                        p.config.planeRad,
                        p.config.planeRad * 1.25
                    );
                    p.alpha = math.lerp(p.spriteUpdateTime, 0.75, 0.5625);
                    p.soundRangeMult = math.max(
                        0,
                        math.lerp(
                            p.spriteUpdateTime,
                            p.config.soundRangeMult,
                            p.config.soundRangeMult - p.config.soundRangeDelta
                        )
                    );
                }
                if (p.soundInstance) {
                    if (p.soundUpdateThrottle < 0) {
                        this.audioManager.updateSound(p.soundInstance, "sfx", p.pos, {
                            layer,
                            rangeMult: p.config.soundRangeMult,
                            ignoreMinAllowable: true,
                            fallOff: p.config.fallOff
                        });
                        p.soundUpdateThrottle = 0.1;
                    } else {
                        p.soundUpdateThrottle -= dt;
                    }
                } else {
                    const distToPlane = v2.length(v2.sub(activePlayer.pos, p.pos));
                    const maxRange = p.config.soundRangeMax * p.config.soundRangeMult;
                    let offset = 0;
                    // Offset fighter sounds to compensate for distToPlane
                    if (p.type == GameConfig.Plane.Airstrike) {
                        const maxDistToOffset = 800;
                        const minDist = 150;
                        const maxSoundOffset = 2.25;
                        const distToCompare = math.max(minDist, distToPlane);
                        offset =
                            (1 -
                                math.clamp(
                                    math.max(0, distToCompare) / maxDistToOffset,
                                    0,
                                    1
                                )) *
                            maxSoundOffset;
                    }
                    if (distToPlane < maxRange) {
                        p.soundInstance = this.audioManager.playSound(p.planeSound, {
                            channel: "sfx",
                            soundPos: p.pos,
                            layer,
                            loop: true,
                            rangeMult: 2.5,
                            ignoreMinAllowable: true,
                            fallOff: p.config.fallOff,
                            offset
                        });
                    }
                }
                renderer.addPIXIObj(p.sprite, layer, 1501, p.id);
                const screenPos = camera.pointToScreen(p.pos);
                const screenScale = camera.pixels(p.rad / camera.ppu);
                const activePlayerIndoors = map.insideBuildingCeiling(
                    collider.createCircle(activePlayer.pos, 0.01),
                    true
                );
                let alphaTarget = p.alpha;
                if (activePlayer.layer == 1) {
                    alphaTarget = 0;
                } else if (activePlayerIndoors || activePlayer.layer & 1) {
                    alphaTarget = 0.15;
                }
                p.renderAlpha = math.lerp(dt * 3, p.renderAlpha, alphaTarget);
                p.sprite.position.set(screenPos.x, screenPos.y);
                p.sprite.scale.set(screenScale, screenScale);
                p.sprite.tint = 16776960;
                p.sprite.alpha = p.renderAlpha;
                p.sprite.visible = true;
            }
        }

        // Update airstrike zones
        for (let i = 0; i < this.airstrikeZones.length; i++) {
            const zone = this.airstrikeZones[i];
            if (zone.active) {
                zone.update(dt);
            }
        }
    }

    renderAirstrikeZones(uiManager: UiManager, map: Map, debug: unknown) {
        for (let i = 0; i < this.airstrikeZones.length; i++) {
            const zone = this.airstrikeZones[i];
            if (zone.active) {
                zone.render(uiManager, map, debug);
            }
        }
    }
}
