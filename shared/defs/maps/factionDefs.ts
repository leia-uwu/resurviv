import { GameConfig } from "../../gameConfig";
import { util } from "../../utils/util";
import { v2 } from "../../utils/v2";
import type { MapDef } from "../mapDefs";
import { Main } from "./baseDefs";

export enum TeamColor {
    // NONE = 0, //can be used ambiguously with code that runs the same regardless of team color
    RED = 1,
    BLUE = 2
}

const mapDef = {
    mapId: 3,
    desc: {
        name: "50v50",
        icon: "img/gui/star.svg",
        buttonCss: "btn-mode-faction",
        buttonText: "50v50"
    },
    assets: {
        audio: [
            {
                name: "lt_assigned_01",
                channel: "ui"
            },
            {
                name: "medic_assigned_01",
                channel: "ui"
            },
            {
                name: "marksman_assigned_01",
                channel: "ui"
            },
            {
                name: "recon_assigned_01",
                channel: "ui"
            },
            {
                name: "grenadier_assigned_01",
                channel: "ui"
            },
            {
                name: "bugler_assigned_01",
                channel: "ui"
            },
            {
                name: "last_man_assigned_01",
                channel: "ui"
            },
            {
                name: "ping_leader_01",
                channel: "ui"
            },
            {
                name: "bugle_01",
                channel: "activePlayer"
            },
            {
                name: "bugle_02",
                channel: "activePlayer"
            },
            {
                name: "bugle_03",
                channel: "activePlayer"
            },
            {
                name: "bugle_01",
                channel: "otherPlayers"
            },
            {
                name: "bugle_02",
                channel: "otherPlayers"
            },
            {
                name: "bugle_03",
                channel: "otherPlayers"
            }
        ],
        atlases: ["gradient", "loadout", "shared", "faction"]
    },
    biome: {
        colors: {
            background: 333348,
            water: 465718,
            waterRipple: 11792639,
            beach: 9328178,
            riverbank: 6632211,
            grass: 5136680,
            underground: 1772803,
            playerSubmerge: 1192009,
            playerGhillie: 5005348
        }
    },
    gameMode: {
        maxPlayers: 100,
        factionMode: true,
        factions: 2
    },
    /* STRIP_FROM_PROD_CLIENT:START */
    gameConfig: {
        planes: {
            timings: [
                {
                    circleIdx: 1,
                    wait: 10,
                    options: {
                        type: GameConfig.Plane.Airstrike,
                        numPlanes: [
                            { count: 3, weight: 5 },
                            { count: 4, weight: 1 },
                            { count: 5, weight: 0.1 }
                        ],
                        airstrikeZoneRad: 60,
                        wait: 1.5,
                        delay: 1
                    }
                },
                {
                    circleIdx: 2,
                    wait: 6,
                    options: { type: GameConfig.Plane.Airdrop }
                },
                {
                    circleIdx: 2,
                    wait: 24,
                    options: {
                        type: GameConfig.Plane.Airstrike,
                        numPlanes: [
                            { count: 3, weight: 4 },
                            { count: 4, weight: 1 },
                            { count: 5, weight: 0.1 }
                        ],
                        airstrikeZoneRad: 55,
                        wait: 1.5,
                        delay: 1
                    }
                },
                {
                    circleIdx: 3,
                    wait: 8,
                    options: {
                        type: GameConfig.Plane.Airstrike,
                        numPlanes: [
                            { count: 3, weight: 3 },
                            { count: 4, weight: 1 },
                            { count: 5, weight: 0.1 }
                        ],
                        airstrikeZoneRad: 50,
                        wait: 1.5,
                        delay: 1
                    }
                },
                {
                    circleIdx: 4,
                    wait: 3,
                    options: { type: GameConfig.Plane.Airdrop }
                },
                {
                    circleIdx: 4,
                    wait: 18,
                    options: {
                        type: GameConfig.Plane.Airstrike,
                        numPlanes: [
                            { count: 3, weight: 2 },
                            { count: 4, weight: 1 },
                            { count: 5, weight: 0.1 }
                        ],
                        airstrikeZoneRad: 45,
                        wait: 1.5,
                        delay: 1
                    }
                },
                {
                    circleIdx: 5,
                    wait: 6,
                    options: {
                        type: GameConfig.Plane.Airstrike,
                        numPlanes: [
                            { count: 3, weight: 1 },
                            { count: 4, weight: 1 },
                            { count: 5, weight: 0.1 }
                        ],
                        airstrikeZoneRad: 40,
                        wait: 1.5,
                        delay: 1
                    }
                }
            ],
            crates: [{ name: "airdrop_crate_03", weight: 1 }]
        },
        bagSizes: {},
        bleedDamage: 2,
        bleedDamageMult: 1.25
    },
    lootTable: {
        tier_guns: [
            { name: "famas", count: 1, weight: 0.9 },
            { name: "hk416", count: 1, weight: 4 },
            { name: "mk12", count: 1, weight: 0.1 },
            { name: "pkp", count: 1, weight: 0.005 },
            { name: "m249", count: 1, weight: 0.006 },
            { name: "ak47", count: 1, weight: 2.7 },
            { name: "scar", count: 1, weight: 0.01 },
            { name: "dp28", count: 1, weight: 0.5 },
            { name: "mosin", count: 1, weight: 0.1 },
            { name: "m39", count: 1, weight: 0.1 },
            { name: "vss", count: 1, weight: 0.1 },
            { name: "mp5", count: 1, weight: 10 },
            { name: "mac10", count: 1, weight: 6 },
            { name: "ump9", count: 1, weight: 3 },
            { name: "m870", count: 1, weight: 9 },
            { name: "m1100", count: 1, weight: 6 },
            { name: "mp220", count: 1, weight: 2 },
            { name: "saiga", count: 1, weight: 0.1 },
            { name: "ot38", count: 1, weight: 8 },
            { name: "m9", count: 1, weight: 19 },
            { name: "m93r", count: 1, weight: 5 },
            { name: "glock", count: 1, weight: 7 },
            { name: "deagle", count: 1, weight: 0.05 },
            { name: "vector", count: 1, weight: 0.01 },
            { name: "sv98", count: 1, weight: 0.01 },
            { name: "spas12", count: 1, weight: 1 },
            { name: "qbb97", count: 1, weight: 0.01 },
            { name: "flare_gun", count: 1, weight: 0.1 },
            { name: "groza", count: 1, weight: 0.8 },
            { name: "scout", count: 1, weight: 0.05 }
        ],
        tier_toilet: [
            { name: "tier_guns", count: 1, weight: 0.1 },
            { name: "tier_scopes", count: 1, weight: 0.05 },
            { name: "tier_medical", count: 1, weight: 0.6 },
            {
                name: "tier_throwables",
                count: 1,
                weight: 0.05
            },
            {
                name: "tier_faction_outfits",
                count: 1,
                weight: 0.025
            }
        ],
        tier_container: [
            { name: "tier_guns", count: 1, weight: 0.29 },
            { name: "tier_ammo", count: 1, weight: 0.04 },
            { name: "tier_scopes", count: 1, weight: 0.15 },
            { name: "tier_armor", count: 1, weight: 0.1 },
            {
                name: "tier_medical",
                count: 1,
                weight: 0.17
            },
            {
                name: "tier_throwables",
                count: 1,
                weight: 0.05
            },
            { name: "tier_packs", count: 1, weight: 0.09 },
            {
                name: "tier_faction_outfits",
                count: 1,
                weight: 0.035
            }
        ],
        tier_medical: [
            { name: "bandage", count: 5, weight: 16 },
            { name: "healthkit", count: 1, weight: 4 },
            { name: "soda", count: 1, weight: 15 },
            { name: "painkiller", count: 1, weight: 5 },
            { name: "frag", count: 1, weight: 2 }
        ],
        tier_airdrop_uncommon: [
            { name: "mk12", count: 1, weight: 2.5 },
            { name: "scar", count: 1, weight: 0.75 },
            { name: "mosin", count: 1, weight: 2.5 },
            { name: "m39", count: 1, weight: 2.5 },
            { name: "saiga", count: 1, weight: 1 },
            { name: "deagle", count: 1, weight: 1 },
            { name: "vector", count: 1, weight: 1 },
            { name: "sv98", count: 1, weight: 0.5 },
            { name: "qbb97", count: 1, weight: 1.5 },
            { name: "m9", count: 1, weight: 0.01 },
            { name: "scout", count: 1, weight: 1.5 }
        ],
        tier_ghillie: [
            {
                name: "outfitDarkGhillie",
                count: 1,
                weight: 0.5
            }
        ],
        tier_airdrop_outfits: [
            { name: "", count: 1, weight: 25 },
            { name: "outfitHeaven", count: 1, weight: 1 },
            {
                name: "outfitDarkGhillie",
                count: 1,
                weight: 0.5
            }
        ],
        tier_ammo_crate: [
            { name: "9mm", count: 60, weight: 3 },
            { name: "762mm", count: 60, weight: 3 },
            { name: "556mm", count: 60, weight: 3 },
            { name: "12gauge", count: 10, weight: 3 },
            { name: "50AE", count: 21, weight: 1 },
            { name: "308sub", count: 5, weight: 1 }
        ],
        tier_mansion_floor: [{ name: "outfitCamo", count: 1, weight: 1 }],
        tier_conch: [{ name: "outfitKeyLime", count: 1, weight: 1 }],
        tier_chrys_01: [
            {
                name: "outfitCarbonFiber",
                count: 1,
                weight: 1
            }
        ]
    },
    mapGen: {
        map: {
            baseWidth: 512,
            baseHeight: 512,
            scale: { small: 1.5, large: 1.5 },
            extension: 112,
            shoreInset: 48,
            grassInset: 18,
            rivers: {
                weights: [
                    { weight: 1, widths: [20] },
                    { weight: 1, widths: [20, 4] },
                    { weight: 1, widths: [20, 8, 4] }
                ],
                smoothness: 0.15
            }
        },
        places: [
            { name: "Riverside", pos: v2.create(0.51, 0.5) },
            {
                name: "Pineapple",
                pos: v2.create(0.84, 0.18)
            },
            { name: "Tarkhany", pos: v2.create(0.21, 0.79) }
        ],
        bridgeTypes: {
            medium: "bridge_md_structure_01",
            large: "bridge_lg_structure_01",
            xlarge: "bridge_xlg_structure_01"
        },
        customSpawnRules: {
            locationSpawns: [],
            placeSpawns: []
        },
        densitySpawns: [
            {
                stone_01: 350,
                barrel_01: 76,
                silo_01: 8,
                crate_01: 38,
                crate_02f: 5,
                crate_22: 5,
                crate_03: 8,
                bush_01: 78,
                tree_08f: 320,
                hedgehog_01: 24,
                container_01: 5,
                container_02: 5,
                container_03: 5,
                container_04: 5,
                shack_01: 7,
                outhouse_01: 5,
                loot_tier_1: 24,
                loot_tier_beach: 4
            }
        ],
        fixedSpawns: [
            {
                warehouse_01f: 6,
                house_red_01: 4,
                house_red_02: 4,
                barn_01: 4,
                bank_01: 1,
                police_01: 1,
                hut_01: 4,
                hut_02: 1,
                shack_03a: 2,
                shack_03b: 3,
                greenhouse_01: 1,
                cache_01: 1,
                cache_02: 1,
                cache_07: 1,
                mansion_structure_01: 1,
                bunker_structure_01: { odds: 1 },
                bunker_structure_03: 1,
                bunker_structure_04: 1,
                warehouse_complex_01: 1,
                chest_01: 1,
                chest_03f: 1,
                mil_crate_02: { odds: 1 },
                tree_02: 3,
                river_town_01: 1
            }
        ],
        randomSpawns: [],
        spawnReplacements: [
            {
                bush_01: "bush_01f",
                crate_02: "crate_01",
                stone_01: "stone_01f",
                stone_03: "stone_03f",
                tree_01: "tree_08f"
            }
        ],
        importantSpawns: [
            "river_town_01",
            "police_01",
            "bank_01",
            "mansion_structure_01",
            "warehouse_complex_01"
        ]
    }
    /* STRIP_FROM_PROD_CLIENT:END */
};

export const Faction = util.mergeDeep({}, Main, mapDef) as MapDef;
