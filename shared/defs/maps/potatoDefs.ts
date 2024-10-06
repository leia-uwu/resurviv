import { GameConfig } from "../../gameConfig";
import { util } from "../../utils/util";
import { v2 } from "../../utils/v2";
import type { MapDef } from "../mapDefs";
import { Main } from "./baseDefs";

const mapDef = {
    mapId: 4,
    desc: {
        name: "Potato",
        icon: "img/loot/loot-throwable-potato.svg",
        buttonCss: "btn-mode-potato",
    },
    assets: {
        audio: [
            { name: "pumpkin_break_01", channel: "sfx" },
            { name: "potato_01", channel: "sfx" },
            { name: "potato_02", channel: "sfx" },
            { name: "potato_pickup_01", channel: "ui" },
            { name: "club_music_01", channel: "ambient" },
            { name: "club_music_02", channel: "ambient" },
            {
                name: "ambient_steam_01",
                channel: "ambient",
            },
            { name: "log_11", channel: "sfx" },
            { name: "log_12", channel: "sfx" },
        ],
        atlases: ["gradient", "loadout", "shared", "potato"],
    },
    biome: {
        colors: {
            background: 2118510,
            water: 3310251,
            waterRipple: 11792639,
            beach: 13480795,
            riverbank: 9461284,
            grass: 8433481,
            underground: 1772803,
            playerSubmerge: 2854052,
        },
        particles: { camera: "falling_potato" },
        frozenSprites: ["player-mash-01.img", "player-mash-02.img", "player-mash-03.img"],
    },
    gameMode: { maxPlayers: 80, potatoMode: true },
    /* STRIP_FROM_PROD_CLIENT:START */
    gameConfig: {
        planes: {
            timings: [
                {
                    circleIdx: 1,
                    wait: 10,
                    options: { type: GameConfig.Plane.Airdrop },
                },
                {
                    circleIdx: 3,
                    wait: 2,
                    options: { type: GameConfig.Plane.Airdrop },
                },
            ],
            crates: [
                { name: "airdrop_crate_01", weight: 1 },
                { name: "airdrop_crate_02", weight: 1 },
            ],
        },
    },
    lootTable: {
        tier_guns: [
            { name: "mp5", count: 1, weight: 10 },
            { name: "mac10", count: 1, weight: 6 },
            { name: "m870", count: 1, weight: 9 },
            { name: "m1100", count: 1, weight: 6 },
            { name: "ot38", count: 1, weight: 8 },
            { name: "m9", count: 1, weight: 19 },
            { name: "m93r", count: 1, weight: 5 },
            { name: "glock", count: 1, weight: 7 },
        ],
        tier_throwables: [
            { name: "frag", count: 2, weight: 1 },
            { name: "smoke", count: 1, weight: 1 },
            { name: "mirv", count: 2, weight: 0.05 },
            { name: "potato", count: 5, weight: 2 },
        ],
        tier_airdrop_throwables: [
            { name: "frag", count: 2, weight: 1 },
            { name: "mirv", count: 2, weight: 0.5 },
            { name: "potato", count: 10, weight: 2 },
        ],
        tier_ammo: [
            { name: "9mm", count: 60, weight: 1 },
            { name: "762mm", count: 60, weight: 3 },
            { name: "556mm", count: 60, weight: 3 },
            { name: "12gauge", count: 10, weight: 3 },
            { name: "45acp", count: 60, weight: 3 },
        ],
        tier_ammo_crate: [
            { name: "9mm", count: 60, weight: 1 },
            { name: "762mm", count: 60, weight: 3 },
            { name: "556mm", count: 60, weight: 3 },
            { name: "12gauge", count: 10, weight: 3 },
            { name: "45acp", count: 60, weight: 3 },
        ],
        tier_airdrop_ammo: [
            { name: "9mm", count: 60, weight: 1 },
            { name: "762mm", count: 60, weight: 3 },
            { name: "556mm", count: 60, weight: 3 },
            { name: "12gauge", count: 10, weight: 3 },
            { name: "45acp", count: 60, weight: 3 },
        ],
        tier_armor: [
            { name: "helmet01", count: 1, weight: 9 },
            { name: "helmet02", count: 1, weight: 6 },
            { name: "helmet03", count: 1, weight: 0.2 },
            {
                name: "helmet03_potato",
                count: 1,
                weight: 0.1,
            },
            { name: "chest01", count: 1, weight: 15 },
            { name: "chest02", count: 1, weight: 6 },
            { name: "chest03", count: 1, weight: 0.2 },
        ],
        tier_police: [
            { name: "scar", count: 1, weight: 0.5 },
            { name: "helmet03", count: 1, weight: 0.15 },
            {
                name: "helmet03_potato",
                count: 1,
                weight: 0.1,
            },
            { name: "chest03", count: 1, weight: 0.1 },
            { name: "backpack03", count: 1, weight: 0.25 },
        ],
        tier_airdrop_armor: [
            { name: "helmet03", count: 1, weight: 1 },
            {
                name: "helmet03_potato",
                count: 1,
                weight: 0.1,
            },
            { name: "chest03", count: 1, weight: 1 },
            { name: "backpack03", count: 1, weight: 1 },
        ],
        tier_ring_case: [
            { name: "potato_cannon", count: 1, weight: 1 },
            { name: "spud_gun", count: 1, weight: 0.1 },
        ],
        tier_airdrop_rare: [
            { name: "potato_cannon", count: 1, weight: 1 },
            { name: "spud_gun", count: 1, weight: 0.1 },
        ],
    },
    mapGen: {
        customSpawnRules: {
            locationSpawns: [
                {
                    type: "shilo_01",
                    pos: v2.create(0.5, 0.5),
                    rad: 150,
                    retryOnFailure: true,
                },
            ],
        },
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
                tree_01: 320,
                hedgehog_01: 24,
                potato_01: 50,
                potato_02: 50,
                potato_03: 50,
                container_01: 5,
                container_02: 5,
                container_03: 5,
                container_04: 5,
                shack_01: 7,
                outhouse_01: 5,
                loot_tier_1: 24,
                loot_tier_beach: 4,
            },
        ],
        fixedSpawns: [
            {
                warehouse_01: 2,
                house_red_01: { small: 3, large: 4 },
                house_red_02: { small: 3, large: 4 },
                barn_01: { small: 1, large: 3 },
                barn_02: 1,
                hut_01: 4,
                hut_02: 1,
                shack_03a: 2,
                shack_03b: { small: 2, large: 3 },
                greenhouse_01: 1,
                cache_01: 1,
                cache_02: 1,
                cache_07: 1,
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
                teahouse_complex_01s: { small: 1, large: 2 },
                stone_04: 1,
                club_complex_01: 1,
            },
        ],
        randomSpawns: [
            {
                spawns: ["mansion_structure_01", "police_01", "bank_01"],
                choose: 2,
            },
        ],
        importantSpawns: ["club_complex_01"],
    },
    /* STRIP_FROM_PROD_CLIENT:END */
};
export const Potato = util.mergeDeep({}, Main, mapDef) as MapDef;
