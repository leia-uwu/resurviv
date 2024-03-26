import { type Vec2 } from "../utils/v2";

interface BulletDef {
    type: "bullet"
    damage: number
    obstacleDamage: number
    falloff: number
    speed: number
    distance: number
    variance: number
    shrapnel: boolean
    tracerColor: string
    tracerWidth: number
    tracerLength: number
    onHit?: string
    flareColor?: number
    addFlare?: boolean
    maxFlareScale?: number
    skipCollision?: boolean
}

interface EmoteDef {
    type: "emote"
    teamOnly: boolean
    noCustom?: boolean
}

interface ExplosionDef {
    type: "explosion"
    damage: number
    obstacleDamage: number
    rad: {
        min: number
        max: number
    }
    shrapnelCount: number
    shrapnelType: string
    decalType: string
    teamDamage?: boolean
}

interface BaseLootDef {
    noDrop?: boolean
    noDropOnDeath?: boolean
}

interface AmmoDef extends BaseLootDef {
    type: "ammo"
    name: string
    minStackSize: number
    special?: boolean
    hideUi?: boolean
}

interface HealDef extends BaseLootDef {
    type: "heal"
    name: string
    useTime: number
    heal: number
    maxHeal: number
}

interface BoostDef extends BaseLootDef {
    type: "boost"
    name: string
    useTime: number
    boost: number
}

interface BackpackDef extends BaseLootDef {
    type: "backpack"
    name: string
    level: number
}

interface HelmetDef extends BaseLootDef {
    type: "helmet"
    name: string
    level: number
    damageReduction: number
    role?: string
}

interface ChestDef extends BaseLootDef {
    type: "chest"
    name: string
    level: number
    damageReduction: number
}

interface ScopeDef extends BaseLootDef {
    type: "scope"
    name: string
    level: number
}

interface GunDef extends BaseLootDef {
    name: string
    type: "gun"
    quality: number
    fireMode: "single" | "auto" | "burst"
    caseTiming: "shoot" | "reload"
    ammo: string
    ammoSpawnCount: number
    dualWieldType?: string
    pistol?: boolean
    isDual?: boolean
    toMouseHit?: boolean
    jitter?: number
    dualOffset?: number
    maxClip: number
    maxReload: number
    ammoInfinite?: boolean
    extendedClip: number
    extendedReload: number
    reloadTime: number
    fireDelay: number
    switchDelay: number
    barrelLength: number
    barrelOffset: number
    recoilTime: number
    moveSpread: number
    shotSpread: number
    bulletCount: number
    bulletType: string
    projType?: string
    bulletTypeBonus?: string
    headshotMult: 2
    noSplinter?: boolean
    outsideOnly?: boolean
    ignoreEndlessAmmo?: boolean
    noPotatoSwap?: boolean
    noDropOnDeath?: boolean
    speed: {
        equip: number
        attack: number
    }
}

interface MeleeDef extends BaseLootDef {
    type: "melee"
    name: string
    quality: number
    autoAttack: boolean
    switchDelay: number
    damage: number
    obstacleDamage: number
    headshotMult: number
    cleave?: boolean
    armorPiercing?: boolean
    stonePiercing?: boolean
    noDropOnDeath?: boolean
    noPotatoSwap?: boolean
    wallCheck?: boolean
    attack: {
        offset: {
            x: number
            y: number
        }
        rad: number
        damageTimes: number[]
        cooldownTime: number
    }
    speed: {
        equip: number
    }
    anim: {
        idlePose: string
        attackAnims: string[]
    }
    reflectSurface?: {
        equipped: {
            p0: Vec2
            p1: Vec2
        }
        unequipped: {
            p0: Vec2
            p1: Vec2
        }
    }
}

interface OutfitDef extends BaseLootDef {
    type: "outfit"
    name: string
    obstacleType?: string
}

interface PerkDef extends BaseLootDef {
    type: "perk"
    name: string
}

interface PingDef extends BaseLootDef {
    type: "ping"
    pingMap: boolean
    pingLife: number
    mapLife: number
    mapEvent: number
    worldDisplay: number
}

interface RoleDef extends BaseLootDef {
    type: "role"
    announce: boolean
    killFeed: {
        assign: boolean
        dead: boolean
    }
    perks: string[]
}

interface ThrowableDef extends BaseLootDef {
    type: "throwable"
    name: string
    quality: number
    explosionType: string
    inventoryOrder: number
    cookable: boolean
    explodeOnImpact: boolean
    playerCollision: boolean
    fuseTime: number
    aimDistance: number
    rad: number
    noPotatoSwap?: boolean
    noDropOnDeath?: boolean
    throwPhysics: {
        playerVelMult: number
        velZ: number
        speed: number
        spinVel: number
        spinDrag: number
        randomizeSpinDir?: boolean
    }
    speed: {
        equip: number
        attack: number
    }
}

interface XPDef extends BaseLootDef {
    type: "xp"
    name: string
    xp: number
}

type GameObjectDef = BulletDef |
EmoteDef |
ExplosionDef |
AmmoDef |
HealDef |
BoostDef |
BackpackDef |
HelmetDef |
ChestDef |
ScopeDef |
GunDef |
MeleeDef |
OutfitDef |
PerkDef |
PingDef |
RoleDef |
ThrowableDef |
XPDef;

type LootDef = AmmoDef |
HealDef |
BoostDef |
BackpackDef |
HelmetDef |
ChestDef |
ScopeDef |
GunDef |
MeleeDef |
OutfitDef |
PerkDef |
ThrowableDef |
XPDef;
