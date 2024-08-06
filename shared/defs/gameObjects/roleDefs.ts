import { util } from "../../utils/util";
import { TeamColor } from "../maps/factionDefs";

type BasicRoleWeapon = {
    type: string;
    ammo: number;
    /** guns only, fill inventory to the max of the respective ammo */
    fillInv?: boolean;
};
/**
 * a role weapon not only needs to be conditionally defined depending on what team the player with the role is,
 * but it also needs to be able to be randomly chosen to satisfy the requirements of certain roles like marksman
 */
type RoleWeapon = BasicRoleWeapon | ((teamcolor: TeamColor) => BasicRoleWeapon);

function getTeamWeapon(
    colorToWeaponMap: Record<TeamColor, BasicRoleWeapon>,
    teamcolor: TeamColor
): BasicRoleWeapon {
    return colorToWeaponMap[teamcolor];
}

type DeepPartial<T> = T extends object
    ? {
          [P in keyof T]?: DeepPartial<T[P]>;
      }
    : T;

type DefaultItems = {
    weapons: [RoleWeapon, RoleWeapon, RoleWeapon, RoleWeapon];
    backpack: string;
    helmet: string;
    chest: string;
    scope: string;
    inventory: {
        "9mm": number;
        "762mm": number;
        "556mm": number;
        "12gauge": number;
        "50AE": number;
        "308sub": number;
        flare: number;
        "45acp": number;
        frag: number;
        smoke: number;
        strobe: number;
        mirv: number;
        snowball: number;
        potato: number;
        bandage: number;
        healthkit: number;
        soda: number;
        painkiller: number;
        "1xscope": number;
        "2xscope": number;
        "4xscope": number;
        "8xscope": number;
        "15xscope": number;
    };
};

export interface RoleDef {
    readonly type: "role";
    announce: boolean;
    killFeed?: {
        assign?: boolean;
        dead?: boolean;
        color?: string;
    };
    sound: {
        assign?: string;
        dead?: string;
    };

    mapIcon?: {
        alive: string;
        dead: string;
    };
    defaultItems?: DefaultItems;
    perks?: string[];
    mapIndicator?: {
        sprite: string;
        tint: number;
        pulse: boolean;
        pulseTint: number;
    };
    visorImg?: {
        baseSprite: string;
        spriteScale: number;
    };
    guiImg?: string;
    color?: number;
}

// const x = util.weightedRandom([
//     {
//         weapon: { type: "m870", ammo: 5},
//         weight: 1
//     },
//     {
//         weapon: { type: "mp220", ammo: 5},
//         weight: 1
//     },
// ])
// console.log(x.weapon);

function createDefaultItems<T extends DefaultItems>(e: DeepPartial<T>): T {
    const defaultItems: DefaultItems = {
        weapons: [
            { type: "", ammo: 0 },
            { type: "", ammo: 0 },
            { type: "fists", ammo: 0 },
            { type: "", ammo: 0 }
        ],
        backpack: "backpack00",
        helmet: "",
        chest: "",
        scope: "1xscope",
        // perks: [] as Array<{ type: string; droppable?: boolean }>,
        inventory: {
            "9mm": 0,
            "762mm": 0,
            "556mm": 0,
            "12gauge": 0,
            "50AE": 0,
            "308sub": 0,
            flare: 0,
            "45acp": 0,
            frag: 0,
            smoke: 0,
            strobe: 0,
            mirv: 0,
            snowball: 0,
            potato: 0,
            bandage: 0,
            healthkit: 0,
            soda: 0,
            painkiller: 0,
            "1xscope": 1,
            "2xscope": 0,
            "4xscope": 0,
            "8xscope": 0,
            "15xscope": 0
        }
    };
    return util.mergeDeep(defaultItems, e || {});
}

export const RoleDefs: Record<string, RoleDef> = {
    leader: {
        type: "role",
        announce: true,
        killFeed: { assign: true, dead: true },
        sound: {
            assign: "leader_assigned_01",
            dead: "leader_dead_01"
        },
        mapIcon: {
            alive: "player-star.img",
            dead: "skull-leader.img"
        },
        perks: ["leadership"],
        defaultItems: createDefaultItems({
            weapons: [
                (teamcolor: TeamColor) =>
                    getTeamWeapon(
                        {
                            [TeamColor.RED]: { type: "m1014", ammo: 8, fillInv: true },
                            [TeamColor.BLUE]: { type: "an94", ammo: 45, fillInv: true }
                        },
                        teamcolor
                    ),
                { type: "flare_gun", ammo: 1 },
                (teamcolor: TeamColor) =>
                    getTeamWeapon(
                        {
                            [TeamColor.RED]: { type: "machete_taiga", ammo: 0 },
                            [TeamColor.BLUE]: { type: "kukri_trad", ammo: 0 }
                        },
                        teamcolor
                    ),
                { type: "", ammo: 0 }
            ],
            backpack: "backpack03",
            helmet: "helmet04_leader",
            chest: "chest03",
            scope: "8xscope",
            inventory: {
                "8xscope": 1
            }
        })
    },
    lieutenant: {
        type: "role",
        announce: true,
        killFeed: { assign: true },
        sound: { assign: "lt_assigned_01" },
        perks: ["firepower"]
    },
    medic: {
        type: "role",
        announce: true,
        killFeed: { assign: true },
        sound: { assign: "medic_assigned_01" },
        mapIcon: {
            alive: "player-medic.img",
            dead: "skull-leader.img"
        },
        perks: ["aoe_heal", "self_revive"]
    },
    marksman: {
        type: "role",
        announce: true,
        killFeed: { assign: true },
        sound: { assign: "marksman_assigned_01" },
        perks: ["targeting"]
    },
    recon: {
        type: "role",
        announce: true,
        killFeed: { assign: true },
        sound: { assign: "recon_assigned_01" },
        perks: ["small_arms"]
    },
    grenadier: {
        type: "role",
        announce: true,
        killFeed: { assign: true },
        sound: { assign: "grenadier_assigned_01" },
        perks: ["flak_jacket"]
    },
    bugler: {
        type: "role",
        announce: true,
        killFeed: { assign: true },
        sound: { assign: "bugler_assigned_01" },
        perks: ["inspiration", "final_bugle"]
    },
    last_man: {
        type: "role",
        announce: true,
        killFeed: { assign: true },
        sound: { assign: "last_man_assigned_01" },
        perks: ["steelskin", "splinter"]
    },
    woods_king: {
        type: "role",
        announce: false,
        killFeed: { dead: true, color: "#12ff00" },
        sound: { dead: "leader_dead_01" },
        perks: ["gotw", "windwalk"]
    },
    kill_leader: {
        type: "role",
        announce: false,
        killFeed: { assign: true, dead: true, color: "#ff8400" },
        sound: {
            assign: "leader_assigned_01",
            dead: "leader_dead_01"
        }
    },
    the_hunted: {
        type: "role",
        announce: true,
        killFeed: { assign: true, dead: true, color: "#ff8400" },
        sound: {
            assign: "leader_assigned_01",
            dead: "leader_dead_01"
        },
        mapIndicator: {
            sprite: "player-the-hunted.img",
            tint: 16745472,
            pulse: true,
            pulseTint: 16745472
        },
        perks: ["hunted"]
    },
    healer: {
        type: "role",
        announce: false,
        sound: { assign: "spawn_01" },
        perks: ["field_medic", "windwalk"],
        visorImg: {
            baseSprite: "player-visor-healer.img",
            spriteScale: 0.3
        },
        guiImg: "img/gui/role-healer.svg",
        color: 11468975
    },
    tank: {
        type: "role",
        announce: false,
        sound: { assign: "spawn_01" },
        perks: ["steelskin", "endless_ammo"],
        visorImg: {
            baseSprite: "player-visor-tank.img",
            spriteScale: 0.3
        },
        guiImg: "img/gui/role-tank.svg",
        color: 13862400
    },
    sniper: {
        type: "role",
        announce: false,
        sound: { assign: "spawn_01" },
        perks: ["chambered", "takedown"],
        visorImg: {
            baseSprite: "player-visor-sniper.img",
            spriteScale: 0.3
        },
        guiImg: "img/gui/role-sniper.svg",
        color: 30696
    },
    scout: {
        type: "role",
        announce: false,
        sound: { assign: "spawn_01" },
        perks: ["small_arms", "tree_climbing"],
        visorImg: {
            baseSprite: "player-visor-scout.img",
            spriteScale: 0.3
        },
        guiImg: "img/gui/role-scout.svg",
        color: 6725632
    },
    demo: {
        type: "role",
        announce: false,
        sound: { assign: "spawn_01" },
        perks: ["fabricate", "flak_jacket"],
        visorImg: {
            baseSprite: "player-visor-demo.img",
            spriteScale: 0.3
        },
        guiImg: "img/gui/role-demo.svg",
        color: 6750976
    },
    assault: {
        type: "role",
        announce: false,
        sound: { assign: "spawn_01" },
        perks: ["firepower", "bonus_assault"],
        visorImg: {
            baseSprite: "player-visor-assault.img",
            spriteScale: 0.3
        },
        guiImg: "img/gui/role-assault.svg",
        color: 16772119
    }
};
