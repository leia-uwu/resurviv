import * as PIXI from "pixi.js-legacy";
import { GameObjectDefs } from "../../../shared/defs/gameObjectDefs";
import type { OutfitDef } from "../../../shared/defs/gameObjects/outfitDefs";
import { GameConfig } from "../../../shared/gameConfig";
import type { MapMsg } from "../../../shared/net/mapMsg";
import { type ObjectData, ObjectType } from "../../../shared/net/objectSerializeFns";
import { collider } from "../../../shared/utils/collider";
import type { Loadout } from "../../../shared/utils/helpers";
import { math } from "../../../shared/utils/math";
import { v2 } from "../../../shared/utils/v2";
import type { Account } from "../account";
import type { AudioManager } from "../audioManager";
import { Camera } from "../camera";
import type { ConfigManager } from "../config";
import { debugLines } from "../debugLines";
import { device } from "../device";
import type { DebugOptions, Game } from "../game";
import type { InputBinds } from "../inputBinds";
import { Map } from "../map";
import { DecalBarn } from "../objects/decal";
import { Creator } from "../objects/objectPool";
import { ParticleBarn } from "../objects/particles";
import { type Player, PlayerBarn } from "../objects/player";
import { SmokeBarn } from "../objects/smoke";
import { Renderer } from "../renderer";
import type { LocalDataWithDirty } from "./../../../shared/net/updateMsg";
import loadouts from "./loadouts";

export class LoadoutDisplay {
    active = false;
    initialized = false;

    canvasMode!: boolean;
    camera!: Camera;
    renderer!: Renderer;
    particleBarn!: ParticleBarn;
    decalBarn!: DecalBarn;
    map!: Map;
    playerBarn!: PlayerBarn;
    smokeBarn!: SmokeBarn;
    objectCreator!: Creator;
    debugDisplay!: PIXI.Graphics;

    loadout!: Loadout;
    view!: string;
    viewOld!: string;
    cameraOffset = v2.create(0, 0);
    q = 1;
    debugZoom = 1;
    useDebugZoom = false;

    outfitOld!: string;

    animIdleTicker!: number;
    animSeq!: number;
    actionSeq!: number;

    activeId = 98;
    activePlayer!: Player;

    constructor(
        public pixi: PIXI.Application,
        public audioManager: AudioManager,
        public config: ConfigManager,
        public inputBinds: InputBinds,
        public account: Account,
    ) {}

    init() {
        this.canvasMode = this.pixi.renderer.type == PIXI.RENDERER_TYPE.CANVAS;
        this.camera = new Camera();
        this.renderer = new Renderer(this as unknown as Game, this.canvasMode);
        this.particleBarn = new ParticleBarn(this.renderer);
        this.decalBarn = new DecalBarn();
        this.map = new Map(this.decalBarn);
        this.playerBarn = new PlayerBarn();
        this.smokeBarn = new SmokeBarn();

        // Register types
        const TypeToPool = {
            [ObjectType.Player]: this.playerBarn.playerPool,
            [ObjectType.Obstacle]: this.map.obstaclePool,
            [ObjectType.Building]: this.map.buildingPool,
            [ObjectType.Structure]: this.map.structurePool,
            [ObjectType.Decal]: this.decalBarn.decalPool,
            [ObjectType.Smoke]: this.smokeBarn.smokePool,
        };

        this.objectCreator = new Creator();
        for (const type in TypeToPool) {
            if (TypeToPool.hasOwnProperty(type)) {
                this.objectCreator.registerType(
                    type,
                    TypeToPool[type as unknown as keyof typeof TypeToPool],
                );
            }
        }

        // Render ordering
        this.debugDisplay = new PIXI.Graphics();

        const pixiContainers = [
            this.map.display.ground,
            this.renderer.layers[0],
            this.renderer.ground,
            this.renderer.layers[1],
            this.renderer.layers[2],
            this.renderer.layers[3],
            this.debugDisplay,
        ];
        for (let i = 0; i < pixiContainers.length; i++) {
            const container = pixiContainers[i];
            if (container) {
                container.interactiveChildren = false;
                this.pixi.stage.addChild(container);
            }
        }

        this.loadout = loadouts.defaultLoadout();
        this.setLoadout(this.loadout);
        this.view = "outfit";
        this.viewOld = this.view;

        this.outfitOld = this.loadout.outfit;

        this.map.loadMap(
            {
                grassInset: 18,
                groundPatches: [],
                height: 720,
                mapName: "main",
                objects: [],
                places: [],
                rivers: [],
                seed: 218051654,
                shoreInset: 48,
                width: 720,
            } as unknown as MapMsg,
            this.camera,
            this.canvasMode,
            this.particleBarn,
        );

        this.activePlayer = this.playerBarn.getPlayerById(this.activeId)!;
        this.activePlayer.setLocalData(
            {
                boost: 100,
                boostDirty: true,
                hasAction: false,
                health: 100,
                inventoryDirty: false,
                scopedIn: false,
                spectatorCountDirty: false,
                weapsDirty: true,
                curWeapIdx: 2,
                weapons: [
                    {
                        name: "",
                        ammo: 0,
                    },
                    {
                        name: "",
                        ammo: 0,
                    },
                    {
                        name: "bayonet_rugged",
                        ammo: 0,
                    },
                    {
                        name: "",
                        ammo: 0,
                    },
                ],
            } as unknown as LocalDataWithDirty,
            this.playerBarn,
        );

        this.activePlayer.layer = this.activePlayer.netData.layer;
        this.activePlayer.isLoadoutAvatar = true;
        this.renderer.setActiveLayer(this.activePlayer.layer);
        this.audioManager.activeLayer = this.activePlayer.layer;

        // Idle anim ticker
        this.animIdleTicker = 3;
        this.animSeq = 0;
        this.actionSeq = 0;

        this.hide();
        this.account.addEventListener("loadout", (loadout) => {
            this.setLoadout(loadout, true);
        });

        // @NOTE: Necessary because the account could have already loaded
        this.setLoadout(this.account.loadout, true);

        this.initialized = true;

        this.resize();
    }

    free() {
        if (this.initialized) {
            this.map.free();
            this.particleBarn.free();
            this.renderer.free();
            while (this.pixi.stage.children.length > 0) {
                const e = this.pixi.stage.children[0];
                this.pixi.stage.removeChild(e);
                e.destroy({
                    children: true,
                });
            }
        }
        this.initialized = false;
    }

    setLoadout(loadout: Loadout, skipEffects?: boolean) {
        this.loadout = loadouts.validate(loadout);
        this.updateCharDisplay();
        if (skipEffects) {
            this.outfitOld = this.loadout.outfit;
        }
        if (this.activePlayer) {
            this.activePlayer.playActionStartSfx = true;
        }
        this.animIdleTicker = 0;
    }

    setView(view: string) {
        this.viewOld = this.view;
        this.view = view;
    }

    updateCharDisplay(
        options = {} as Partial<{
            animType: number;
            animSeq: number;
            actionSeq: number;
            actionType: number;
            actionItem: string;
        }>,
    ) {
        const ctx = {
            audioManager: this.audioManager,
            renderer: this.renderer,
            particleBarn: this.particleBarn,
            map: this.map,
            smokeBarn: this.smokeBarn,
            decalBarn: this.decalBarn,
        };

        // HACK: clear the player particle emitter and reset the anim counter
        if (this.activePlayer?.useItemEmitter) {
            this.activePlayer.useItemEmitter.stop();
            this.activePlayer.useItemEmitter = null;
            this.animIdleTicker = 0;
        }

        const obj = {
            outfit: this.loadout.outfit,
            backpack: "backpack02",
            helmet: "helmet01",
            chest: "chest03",
            activeWeapon: this.loadout.melee,
            layer: 0,
            dead: false,
            downed: false,
            animType: options.animType || 0,
            animSeq: options.animSeq || 0,
            actionSeq: options.actionSeq || 0,
            actionType: options.actionType || 0,
            actionItem: options.actionItem || "",
            wearingPan: false,
            healEffect: false,
            frozen: false,
            frozenOri: 0,
            hasteType: 0,
            hasteSeq: 0,
            scale: 1,
            role: "",
            perks: [],
            $r: false,
            pos: v2.create(50, 50),
            dir: v2.create(0, -1),
        };

        this.objectCreator.updateObjFull(
            ObjectType.Player,
            98,
            obj as unknown as ObjectData<ObjectType.Player>,
            ctx,
        );

        this.playerBarn.setPlayerInfo({
            playerId: 98,
            teamId: 0,
            groupId: 0,
            name: "",
            loadout: {
                heal: this.loadout.heal,
                boost: this.loadout.boost,
            },
        });
    }

    getCameraTargetZoom() {
        return (
            ((document.getElementById("modal-content-left")!.getBoundingClientRect()
                .height /
                this.camera.screenHeight) *
                0.2 *
                this.camera.screenHeight *
                0.5) /
            this.camera.ppu
        );
    }

    getCameraLoadoutOffset() {
        const zoomPrev = this.camera.zoom;

        const targetZoom = this.getCameraTargetZoom();
        this.camera.zoom = targetZoom;

        const modal = document.getElementById("modal-content-left")!;
        const modalBound = modal.getBoundingClientRect();
        const modalAabb = collider.createAabb(
            this.camera.screenToPoint(
                v2.create(modalBound.left, modalBound.top + modalBound.height),
            ),
            this.camera.screenToPoint(
                v2.create(modalBound.left + modalBound.width, modalBound.top),
            ),
        );
        const modalExt = v2.mul(v2.sub(modalAabb.max, modalAabb.min), 0.5);
        const modalPos = v2.add(modalAabb.min, modalExt);

        const screenAabb = collider.createAabb(
            this.camera.screenToPoint(v2.create(0, this.camera.screenHeight)),
            this.camera.screenToPoint(v2.create(this.camera.screenWidth, 0)),
        );

        const screenExt = v2.mul(v2.sub(screenAabb.max, screenAabb.min), 0.5);
        const screenPos = v2.add(screenAabb.min, screenExt);
        const modalOffset = v2.sub(modalPos, screenPos);
        const viewWidth = screenExt.x - modalOffset.x - modalExt.x;
        const offsetX = math.clamp(viewWidth * 0.5, 2.5, 6);
        const offsetY = 0.33;
        const offset = v2.create(
            modalOffset.x + modalExt.x + offsetX,
            modalOffset.y + offsetY,
        );
        this.camera.zoom = zoomPrev;
        return offset;
    }

    show() {
        if (!this.active) {
            this.active = true;
            this.resize();
        }
    }

    hide() {
        if (this.active) {
            this.active = false;
            this.camera.zoom = 2;
        }
    }

    update(dt: number, hasFocus: boolean) {
        const debug: DebugOptions = {};

        // Camera
        this.camera.pos = v2.sub(this.activePlayer.pos, this.cameraOffset);
        this.camera.zoom = math.lerp(dt * 5, this.camera.zoom, this.camera.targetZoom);

        this.audioManager.cameraPos = v2.copy(this.camera.pos);

        // DebugLines.addAabb(modalAabb.min, modalAabb.max, 0xff0000, 0.0);
        // DebugLines.addCircle(this.m_activePlayer.pos, 1.5, 0xff0000, 0.0);

        if (
            hasFocus &&
            (this.view == this.viewOld ||
                (this.view != "heal" && this.view != "boost") ||
                (this.animIdleTicker = 0),
            (this.viewOld = this.view),
            (this.animIdleTicker -= dt),
            this.animIdleTicker < 0)
        ) {
            if (this.view == "heal") {
                this.actionSeq = (this.actionSeq + 1) % 8;
                const options = {
                    actionType: GameConfig.Action.UseItem,
                    actionItem: "bandage",
                    actionSeq: this.actionSeq,
                };
                this.updateCharDisplay(options);
                this.animIdleTicker = 2 + Math.random();
            } else if (this.view == "boost") {
                this.actionSeq = (this.actionSeq + 1) % 8;
                const options = {
                    actionType: GameConfig.Action.UseItem,
                    actionItem: "soda",
                    actionSeq: this.actionSeq,
                };
                this.updateCharDisplay(options);
                this.animIdleTicker = 2 + Math.random();
            } else if (this.view != "emote" && this.view != "crosshair") {
                this.animSeq = (this.animSeq + 1) % 8;
                const options = {
                    animType: GameConfig.Anim.Melee,
                    animSeq: this.animSeq,
                };
                this.updateCharDisplay(options);
                this.animIdleTicker = 1.5 + Math.random();
            }
        }

        // Play a sound when changing oufits
        const outfitDirty = this.loadout.outfit != this.outfitOld;
        this.outfitOld = this.loadout.outfit;
        if (hasFocus && outfitDirty) {
            const itemDef = GameObjectDefs[this.loadout.outfit] as OutfitDef;
            if (itemDef) {
                this.audioManager.playSound(itemDef.sound.pickup, {
                    channel: "ui",
                });
            }
        }
        this.playerBarn.update(
            dt,
            this.activeId,
            // @ts-expect-error not defined locally.
            this.teamMode,
            this.renderer,
            this.particleBarn,
            this.camera,
            this.map,
            this.inputBinds,
            this.audioManager,
            // @ts-expect-error big mismatch between params passed and expected, need to debug later;
            false,
            false,
            false,
        );
        this.smokeBarn.update(
            dt,
            this.camera,
            this.activePlayer,
            this.map,
            this.renderer,
        );
        this.particleBarn.update(dt, this.camera, debug);
        this.decalBarn.update(dt, this.camera, this.renderer, debug);
        this.renderer.update(dt, this.camera, this.map, debug);
        this.activePlayer.playActionStartSfx = false;

        this.render(dt, debug);
    }

    render(_dt: number, debug: DebugOptions) {
        const grassColor = this.map.mapLoaded
            ? this.map.getMapDef().biome.colors.grass
            : 8433481;

        this.pixi.renderer.background.color = grassColor;

        // Module rendering
        this.playerBarn.render(this.camera, debug);
        this.map.render(this.camera);

        debugLines.render(this.camera, this.debugDisplay);
        debugLines.flush();
    }

    resize() {
        if (this.initialized) {
            this.camera.screenWidth = device.screenWidth;
            this.camera.screenHeight = device.screenHeight;
            this.map.resize(this.pixi.renderer, this.canvasMode);
            this.renderer.resize(this.map, this.camera);
            this.camera.targetZoom = this.getCameraTargetZoom();
            this.cameraOffset = this.getCameraLoadoutOffset();
        }
    }
}
