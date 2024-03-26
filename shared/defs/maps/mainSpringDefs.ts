import { util } from "../../utils/util";
import { Main } from "./baseDefs";
import { type MapDef } from "../mapDefs";

const mapDef = {
    assets: {
        audio: [],
        atlases: ["gradient", "loadout", "shared", "main"]
    },
    biome: {
        colors: {
            background: 2118510,
            water: 3310251,
            waterRipple: 11792639,
            beach: 16035400,
            riverbank: 9079434,
            grass: 6066442,
            underground: 1772803,
            playerSubmerge: 2854052,
            playerGhillie: 4285194
        },
        sound: { riverShore: "stone" },
        particles: { camera: "falling_leaf_spring" }
    },
    mapGen: {
        densitySpawns: [
            {
                stone_01: 350,
                barrel_01: 76,
                silo_01: 8,
                crate_01: 50,
                crate_02: 4,
                crate_03: 8,
                bush_01: 78,
                cache_06: 12,
                tree_01: 300,
                tree_08sp: 30,
                tree_08spb: 30,
                tree_07spr: 160,
                tree_08spr: 80,
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
                warehouse_01: 2,
                house_red_01: { small: 2, large: 3 },
                house_red_02: { small: 2, large: 3 },
                barn_01: { small: 2, large: 4 },
                bank_01: 1,
                police_01: 1,
                hut_01: 4,
                hut_02: 1,
                shack_03a: 2,
                shack_03b: { small: 2, large: 3 },
                greenhouse_01: 1,
                cache_01: 1,
                cache_02: 1,
                cache_07: 1,
                mansion_structure_01: 1,
                bunker_structure_01: { odds: 0.05 },
                bunker_structure_02: 1,
                bunker_structure_03: 1,
                bunker_structure_04: 1,
                bunker_structure_05: 1,
                warehouse_complex_01: 1,
                chest_01: 1,
                chest_03: { odds: 0.2 },
                mil_crate_02: { odds: 0.25 },
                tree_02: 3,
                teahouse_01: { small: 2, large: 3 }
            }
        ],
        randomSpawns: [],
        spawnReplacements: [{ tree_01: "tree_07sp" }]
    }
};

export const MainSpring = util.mergeDeep({}, Main, mapDef) as MapDef;
