import { math } from "./math";
import { type Vec2, v2 } from "./v2";

/**
 * Custom function to not bundle nodejs assert polyfill with the client
 */
export function assert(value: unknown, message?: string | Error): asserts value {
    if (!value) {
        const error =
            message instanceof Error
                ? message
                : new Error(message ?? "Assertation failed");
        throw error;
    }
}

export function defineSkin<Def>(
    baseDefs: Record<string, Def>,
    baseType: string,
    params: Partial<Def>,
) {
    return util.mergeDeep({}, baseDefs[baseType], { baseType }, params) as Def;
}

export const util = {
    //
    // Game objects can belong to the following layers:
    //   0: ground layer
    //   1: bunker layer
    //   2: ground and stairs (both)
    //   3: bunker and stairs (both)
    //
    // Objects on the same layer should interact with one another.
    sameLayer(a: number, b: number) {
        // Which is faster?
        // return (a == b && a < 2) || (a >= 2 && b >= 2);
        return (a & 0x1) === (b & 0x1) || (a & 0x2 && b & 0x2);
    },

    sameAudioLayer(a: number, b: number) {
        return a === b || a & 0x2 || b & 0x2;
    },

    toGroundLayer(a: number) {
        // return a < 2 ? a : (a == 2 ? 0 : 1);
        return a & 0x1;
    },

    toStairsLayer(a: number) {
        // return a >= 2 ? a : (a == 0 ? 2 : 3);
        //  return a | 0x2;
        return a & 0x1;
    },

    random(min: number, max: number) {
        return math.lerp(Math.random(), min, max);
    },

    randomInt(min: number, max: number) {
        min = Math.ceil(min);
        max = Math.floor(max);
        return Math.floor(Math.random() * (max - min + 1)) + min;
    },

    pickRandomInArr<T>(arr: T[]) {
        return arr[Math.floor(Math.random() * arr.length)];
    },

    // Uniformly distributed random point within circle
    // Taken from https://stackoverflow.com/questions/5837572/generate-a-random-point-within-a-circle-uniformly
    randomPointInCircle(rad: number) {
        let a = Math.random();
        let b = Math.random();
        if (b < a) {
            const c = a;
            a = b;
            b = c;
        }
        const pos = v2.create(
            b * rad * Math.cos((2.0 * Math.PI * a) / b),
            b * rad * Math.sin((2.0 * Math.PI * a) / b),
        );
        return pos;
    },

    randomPointInAabb(aabb: { min: Vec2; max: Vec2 }) {
        return v2.create(
            util.random(aabb.min.x, aabb.max.x),
            util.random(aabb.min.y, aabb.max.y),
        );
    },

    seededRand(seed: number) {
        // Park-Miller PRNG
        let rng = seed;
        return function (min = 0, max = 1) {
            rng = (rng * 16807) % 2147483647;
            const t = rng / 2147483647;
            return math.lerp(t, min, max);
        };
    },

    // Taken from: https://gist.github.com/mjackson/5311256
    rgbToHsv(r: number, g: number, b: number) {
        r /= 255;
        g /= 255;
        b /= 255;

        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        let h: number = 0;
        let s: number = 0;
        const v = max;

        const d = max - min;
        s = max == 0 ? 0 : d / max;

        if (max == min) {
            h = 0; // achromatic
        } else {
            switch (max) {
                case r:
                    h = (g - b) / d + (g < b ? 6 : 0);
                    break;
                case g:
                    h = (b - r) / d + 2;
                    break;
                case b:
                    h = (r - g) / d + 4;
                    break;
            }

            h /= 6;
        }

        return { h, s, v };
    },

    // Taken from: https://stackoverflow.com/questions/17242144/javascript-convert-hsb-hsv-color-to-rgb-accurately
    hsvToRgb(h: number, s: number, v: number) {
        let r = 0;
        let g = 0;
        let b = 0;
        let i = 0;
        let f = 0;
        let p = 0;
        let q = 0;
        let t = 0;

        i = Math.floor(h * 6.0);
        f = h * 6.0 - i;
        p = v * (1.0 - s);
        q = v * (1.0 - f * s);
        t = v * (1.0 - (1.0 - f) * s);
        switch (i % 6) {
            case 0:
                r = v;
                g = t;
                b = p;
                break;
            case 1:
                r = q;
                g = v;
                b = p;
                break;
            case 2:
                r = p;
                g = v;
                b = t;
                break;
            case 3:
                r = p;
                g = q;
                b = v;
                break;
            case 4:
                r = t;
                g = p;
                b = v;
                break;
            case 5:
                r = v;
                g = p;
                b = q;
                break;
        }
        return {
            r: Math.round(r * 255.0),
            g: Math.round(g * 255.0),
            b: Math.round(b * 255.0),
        };
    },

    adjustValue(tint: number, value: number) {
        let r = (tint >> 16) & 0xff;
        let g = (tint >> 8) & 0xff;
        let b = tint & 0xff;
        r = Math.round(r * value);
        g = Math.round(g * value);
        b = Math.round(b * value);
        return (r << 16) + (g << 8) + b;
    },

    lerpColor(t: number, start: number, end: number) {
        const toLinear = function toLinear(c: { r: number; g: number; b: number }) {
            return {
                r: c.r ** 2.2,
                g: c.g ** 2.2,
                b: c.b ** 2.2,
            };
        };
        const toSRGB = function toSRGB(c: { r: number; g: number; b: number }) {
            return {
                r: c.r ** (1.0 / 2.2),
                g: c.g ** (1.0 / 2.2),
                b: c.b ** (1.0 / 2.2),
            };
        };

        const s = toLinear(util.intToRgb(start));
        const e = toLinear(util.intToRgb(end));

        return util.rgbToInt(
            toSRGB({
                r: math.lerp(t, s.r, e.r),
                g: math.lerp(t, s.g, e.g),
                b: math.lerp(t, s.b, e.b),
            }),
        );
    },

    rgbToInt(c: { r: number; g: number; b: number }) {
        return (c.r << 16) + (c.g << 8) + c.b;
    },

    intToRgb(c: number) {
        return {
            r: (c >> 16) & 0xff,
            g: (c >> 8) & 0xff,
            b: c & 0xff,
        };
    },

    // https://stackoverflow.com/questions/5623838/rgb-to-hex-and-hex-to-rgb
    rgbToHex(c: { r: number; g: number; b: number }) {
        const rgb = util.rgbToInt(c);
        return `#${(0x1000000 + rgb).toString(16).slice(-6)}`;
    },

    // https://stackoverflow.com/questions/13348129/using-native-javascript-to-desaturate-a-colour
    hexToRgb(hex: string) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result
            ? {
                  r: parseInt(result[1], 16),
                  g: parseInt(result[2], 16),
                  b: parseInt(result[3], 16),
              }
            : null;
    },

    intToHex(int: number) {
        return `#${(0x1000000 + int).toString(16).slice(-6)}`;
    },

    hexToInt(hex: string) {
        return parseInt(hex.slice(-6), 16);
    },

    updateColor(sat: number, hex: string) {
        sat /= 100.0;
        const col = util.hexToRgb(hex)!;
        const black = 0.0;

        col.r = Math.round(col.r * sat + black * (1 - sat));
        col.g = Math.round(col.g * sat + black * (1 - sat));
        col.b = Math.round(col.b * sat + black * (1 - sat));

        const out = util.rgbToInt(col);

        return out;
    },

    // Taken from https://stackoverflow.com/questions/27936772/how-to-deep-merge-instead-of-shallow-merge
    isObject(item: unknown) {
        return (
            item &&
            (typeof item === "undefined" ? "undefined" : typeof item) === "object" &&
            !Array.isArray(item)
        );
    },

    mergeDeep(target: any, ...sources: any[]): any {
        if (!sources.length) return target;
        const source = sources.shift();

        if (this.isObject(target) && this.isObject(source)) {
            for (const key in source) {
                if (this.isObject(source[key])) {
                    if (!target[key]) Object.assign(target, { [key]: {} });
                    this.mergeDeep(target[key], source[key]);
                } else {
                    Object.assign(target, { [key]: source[key] });
                }
            }
        }

        return this.mergeDeep(target, ...sources);
    },

    cloneDeep(source: unknown) {
        // @TODO: This does not properly handle arrays
        return util.mergeDeep({}, source);
    },

    shuffleArray(arr: unknown[]) {
        for (let i = arr.length - 1; i >= 0; i--) {
            const idx = Math.floor(Math.random() * (i + 1));
            const tmp = arr[i];
            arr[i] = arr[idx];
            arr[idx] = tmp;
        }
    },

    wrappedArrayIndex<T>(arr: T[], index: number): T {
        return arr.at(index % arr.length) as T;
    },

    weightedRandom<T extends Object>(items: Array<T & { weight: number }>) {
        let total = 0.0;
        for (let i = 0; i < items.length; i++) {
            total += items[i].weight;
        }
        let rng = util.random(0, total);
        let idx = 0;
        while (rng > items[idx].weight) {
            rng -= items[idx].weight;
            idx++;
        }
        return items[idx];
    },
};
