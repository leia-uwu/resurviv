import { z } from "zod";
import { Constants } from "../../../shared/net/net";

export const loadoutSchema = z.object({
    outfit: z.string(),
    melee: z.string(),
    heal: z.string(),
    boost: z.string(),
    player_icon: z.string(),
    crosshair: z.object({
        type: z.string(),
        color: z.number(),
        size: z.string(),
        stroke: z.string(),
    }),
    emotes: z.array(z.string()).length(6),
});

export type Loadout = z.infer<typeof loadoutSchema>;

export const usernameSchema = z.object({
    username: z.string().trim().min(1).max(Constants.PlayerNameMaxLen),
});
