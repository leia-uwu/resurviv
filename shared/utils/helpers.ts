import { GameObjectDefs } from "../defs/gameObjectDefs";
import type { CrosshairDefs } from "../defs/gameObjects/crosshairDefs";
import { GameConfig } from "../gameConfig";

export interface Crosshair {
    type: keyof typeof CrosshairDefs;
    color: number;
    size: string;
    stroke: string;
}

export interface Loadout {
    player_icon: string;
    outfit: string;
    heal: string;
    boost: string;
    melee: string;
    emotes: string[];
    crosshair: Crosshair;
}

export enum ItemStatus {
    New,
    Confirmed,
    Ackd,
}

export function validateLoadout(userLoadout: Loadout): Loadout {
    const getGameType = function (type: string, gameType: string, defaultValue: string) {
        const def = GameObjectDefs[gameType];
        if (def && def.type == type) {
            return gameType;
        }
        return defaultValue;
    };
    const getFloat = function (flt: string, defaultValue: number) {
        const val = parseFloat(flt);
        if (Number.isNaN(val)) {
            return defaultValue;
        }
        return val;
    };
    const mergedLoadout = {
        ...{
            crosshair: {
                type: "",
                color: 0xffffff,
                size: 1,
                stroke: 0,
            },
            emotes: [],
        },
        ...userLoadout,
    } as Loadout;
    const validatedLoadout: Loadout = {
        outfit: getGameType("outfit", mergedLoadout.outfit, "outfitBase"),
        melee: getGameType("melee", mergedLoadout.melee, "fists"),
        heal: getGameType("heal_effect", mergedLoadout.heal, "heal_basic"),
        boost: getGameType("boost_effect", mergedLoadout.boost, "boost_basic"),
        player_icon: getGameType("emote", mergedLoadout.player_icon, ""),
        crosshair: {
            type: getGameType(
                "crosshair",
                mergedLoadout.crosshair.type,
                "crosshair_default",
            ),
            color:
                parseInt(mergedLoadout.crosshair.color as unknown as string) || 0xffffff,
            size: getFloat(mergedLoadout.crosshair.size, 1).toFixed(2),
            stroke: getFloat(mergedLoadout.crosshair.stroke, 0).toFixed(2),
        },
        emotes: [] as string[],
    };

    const defaultEmotes = GameConfig.defaultEmoteLoadout.slice();
    for (let i = 0; i < GameConfig.EmoteSlot.Count; i++) {
        const inputEmote = i < mergedLoadout.emotes.length ? mergedLoadout.emotes[i] : "";
        validatedLoadout.emotes.push(getGameType("emote", inputEmote, defaultEmotes[i]));
    }
    return validatedLoadout;
}
