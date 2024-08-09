export enum EmoteSlot {
    Top,
    Right,
    Bottom,
    Left,
    Win,
    Death,
    Count
}

export enum DamageType {
    Player,
    Bleeding,
    Gas,
    Airdrop,
    Airstrike
}

export enum Action {
    None,
    Reload,
    ReloadAlt,
    UseItem,
    Revive
}

export enum WeaponSlot {
    Primary,
    Secondary,
    Melee,
    Throwable,
    Count
}

export enum GasMode {
    Inactive,
    Waiting,
    Moving
}

export enum Anim {
    None,
    Melee,
    Cook,
    Throw,
    CrawlForward,
    CrawlBackward,
    Revive
}

export enum Plane {
    Airdrop,
    Airstrike
}

export enum HasteType {
    None,
    Windwalk,
    Takedown,
    Inspire
}

export enum Input {
    MoveLeft,
    MoveRight,
    MoveUp,
    MoveDown,
    Fire,
    Reload,
    Cancel,
    Interact,
    Revive,
    Use,
    Loot,
    EquipPrimary,
    EquipSecondary,
    EquipMelee,
    EquipThrowable,
    EquipFragGrenade,
    EquipSmokeGrenade,
    EquipNextWeap,
    EquipPrevWeap,
    EquipLastWeap,
    EquipOtherGun,
    EquipPrevScope,
    EquipNextScope,
    UseBandage,
    UseHealthKit,
    UseSoda,
    UsePainkiller,
    StowWeapons,
    SwapWeapSlots,
    ToggleMap,
    CycleUIMode,
    EmoteMenu,
    TeamPingMenu,
    Fullscreen,
    HideUI,
    TeamPingSingle,
    Count
}

export const GameConfig = {
    protocolVersion: 78,
    Input,
    EmoteSlot,
    WeaponSlot,
    WeaponType: ["gun", "gun", "melee", "throwable"],
    DamageType,
    Action,
    Anim,
    GasMode,
    Plane,
    HasteType,
    gas: {
        initWaitTime: 90,
        waitTimeDecay: 15,
        waitTimeMin: 10,
        initGasTime: 30,
        gasTimeDecay: 5,
        gasTimeMin: 5,
        initWidth: 0.75,
        widthDecay: 0.5,
        movingWidthDecay: 0.7,
        firstMovingZone: 2,
        widthMin: 10,
        damageTickRate: 2,
        damage: [1.4, 2.2, 3.5, 7.5, 10, 14, 22, 22, 22]
    },
    map: {
        gridSize: 16,
        shoreVariation: 3,
        grassVariation: 2
    },
    player: {
        radius: 1,
        maxVisualRadius: 3.75,
        maxInteractionRad: 3.5,
        health: 100,
        reviveHealth: 24,
        minActiveTime: 10,
        boostDecay: 0.33,
        boostMoveSpeed: 1.85,
        boostHealAmount: 0.33,
        boostBreakpoints: [1, 1, 1.5, 0.5],
        scopeDelay: 0.25,
        baseSwitchDelay: 0.25,
        freeSwitchCooldown: 1,
        headshotChance: 0.15,
        moveSpeed: 20,
        waterSpeedPenalty: 3,
        cookSpeedPenalty: 3,
        hasteSpeedBonus: 4.8,
        bleedTickRate: 1,
        downedMoveSpeed: 4,
        downedRezMoveSpeed: 2,
        keepZoomWhileDowned: false,
        reviveDuration: 8,
        reviveRange: 5,
        crawlTime: 0.75,
        teammateSpawnRadius: 5, // radius of circle that teammates spawn inside of, relative to the first player on the team to join
        emoteSoftCooldown: 2,
        emoteHardCooldown: 6,
        emoteThreshold: 6,
        throwableMaxMouseDist: 18,
        cookTime: 0.1,
        throwTime: 0.3,
        meleeHeight: 0.25,
        touchLootRadMult: 1.4,
        medicHealRange: 8,
        medicReviveRange: 6,
        spectateDeadTimeout: 2,
        killLeaderMinKills: 3,
        minSpawnDistance: 50, // minimum distance enemy players need to spawn from each other
        gracePeriodTime: 0, // time from game start where players can't move

        /* STRIP_FROM_PROD_CLIENT:START */
        defaultItems: {
            weapons: [
                { type: "", ammo: 0 },
                { type: "", ammo: 0 },
                { type: "fists", ammo: 0 },
                { type: "", ammo: 0 }
            ],
            outfit: "outfitBase",
            backpack: "backpack00",
            helmet: "",
            chest: "",
            scope: "1xscope",
            perks: [] as Array<{ type: string; droppable?: boolean }>,
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
            } as Record<string, number>
        }
        /* STRIP_FROM_PROD_CLIENT:END */
    },
    defaultEmoteLoadout: [
        "emote_happyface",
        "emote_thumbsup",
        "emote_surviv",
        "emote_sadface",
        "",
        ""
    ],
    airdrop: {
        actionOffset: 0,
        fallTime: 8,
        crushDamage: 100,
        planeVel: 48,
        planeRad: 150,
        soundRangeMult: 2.5,
        soundRangeDelta: 0.25,
        soundRangeMax: 92,
        fallOff: 0,
        minSpawnDist: 300 //only applies to random drops on the same tick
    },
    airstrike: {
        actionOffset: 0,
        bombJitter: 4,
        bombOffset: 2,
        bombVel: 3,
        bombCount: 20,
        planeVel: 350,
        planeRad: 120,
        soundRangeMult: 18,
        soundRangeDelta: 18,
        soundRangeMax: 48,
        fallOff: 1.25
    },
    groupColors: [16776960, 16711935, 65535, 16733184],
    teamColors: [13369344, 32511],
    bullet: {
        maxReflect: 3,
        reflectDistDecay: 1.5,
        height: 0.25,
        falloff: true
    },
    gun: {
        customSwitchDelay: undefined,
        customBarrelLength: undefined,
        customShootingSpeed: {
            single: undefined,
            auto: undefined,
            burst: undefined
        } as Record<"auto" | "single" | "burst", number | undefined>,
        headshotBlacklist: [] as string[]
    },
    projectile: {
        maxHeight: 5
    },
    structureLayerCount: 2,
    tracerColors: {
        "9mm": {
            regular: 16704198,
            saturated: 16767411,
            chambered: 16744192,
            alphaRate: 0.92,
            alphaMin: 0.14
        },
        "9mm_suppressed_bonus": {
            regular: 16704198,
            saturated: 16767411,
            chambered: 16744192,
            alphaRate: 0.96,
            alphaMin: 0.28
        },
        "9mm_cursed": {
            regular: 1247488,
            saturated: 1247488,
            chambered: 1247488,
            alphaRate: 0.92,
            alphaMin: 0.14
        },
        "762mm": {
            regular: 12965630,
            saturated: 11257087,
            chambered: 19711,
            alphaRate: 0.94,
            alphaMin: 0.2
        },
        "12gauge": {
            regular: 16702684,
            saturated: 16702684,
            chambered: 16711680
        },
        "556mm": {
            regular: 11141010,
            saturated: 11141010,
            chambered: 3604224,
            alphaRate: 0.92,
            alphaMin: 0.14
        },
        "50AE": {
            regular: 16773256,
            saturated: 16773256,
            chambered: 16768768
        },
        "308sub": {
            regular: 2435840,
            saturated: 4608e3,
            chambered: 1250816,
            alphaRate: 0.92,
            alphaMin: 0.07
        },
        flare: {
            regular: 14869218,
            saturated: 14869218,
            chambered: 12895428
        },
        "45acp": {
            regular: 15515391,
            saturated: 15183103,
            chambered: 11862271
        },
        shrapnel: { regular: 3355443, saturated: 3355443 },
        frag: { regular: 13303808, saturated: 13303808 },
        invis: { regular: 0, saturated: 0, chambered: 0 }
    },
    scopeZoomRadius: {
        desktop: {
            "1xscope": 28,
            "2xscope": 36,
            "4xscope": 48,
            "8xscope": 68,
            "15xscope": 104
        } as Record<string, number>,
        mobile: {
            "1xscope": 32,
            "2xscope": 40,
            "4xscope": 48,
            "8xscope": 64,
            "15xscope": 88
        } as Record<string, number>
    },
    bagSizes: {
        "9mm": [120, 240, 330, 420],
        "762mm": [90, 180, 240, 300],
        "556mm": [90, 180, 240, 300],
        "12gauge": [15, 30, 60, 90],
        "50AE": [49, 98, 147, 196],
        "308sub": [10, 20, 40, 80],
        flare: [2, 4, 6, 8],
        "45acp": [90, 180, 240, 300],
        frag: [3, 6, 9, 12],
        smoke: [3, 6, 9, 12],
        strobe: [2, 3, 4, 5],
        mirv: [2, 4, 6, 8],
        snowball: [10, 20, 30, 40],
        potato: [10, 20, 30, 40],
        bandage: [5, 10, 15, 30],
        healthkit: [1, 2, 3, 4],
        soda: [2, 5, 10, 15],
        painkiller: [1, 2, 3, 4],
        "1xscope": [1, 1, 1, 1],
        "2xscope": [1, 1, 1, 1],
        "4xscope": [1, 1, 1, 1],
        "8xscope": [1, 1, 1, 1],
        "15xscope": [1, 1, 1, 1]
    } as Record<string, number[]>,
    lootRadius: {
        outfit: 1,
        melee: 1.25,
        gun: 1.25,
        throwable: 1,
        ammo: 1.2,
        heal: 1,
        boost: 1,
        backpack: 1,
        helmet: 1,
        chest: 1,
        scope: 1,
        perk: 1.25,
        xp: 1
    } as Record<string, number>
};
