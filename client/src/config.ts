import { util } from "../../shared/utils/util";
import loadout from "./ui/loadouts";
import type { Locale } from "./ui/localization";

const defaultConfig = {
    muteAudio: false,
    masterVolume: 1,
    soundVolume: 1,
    musicVolume: 1,
    highResTex: true,
    clientSideInterp: false,
    showFps: false,
    screenShake: true,
    anonPlayerNames: false,
    touchMoveStyle: "anywhere" as "locked" | "anywhere",
    touchAimStyle: "anywhere" as "locked" | "anywhere",
    touchAimLine: true,
    profile: null as { slug: string } | null,
    playerName: "",
    region: "na",
    gameModeIdx: 2,
    teamAutoFill: true,
    language: "en" as Locale,
    prerollGamesPlayed: 0,
    totalGamesPlayed: 0,
    promptAppRate: true,
    regionSelected: false,
    lastNewsTimestamp: 0,
    perkModeRole: "",
    loadout: loadout.defaultLoadout(),
    sessionCookie: "" as string | null,
    binds: "",
    version: 1
};

export type ConfigType = typeof defaultConfig;
export type ConfigKey = keyof ConfigType;

export class ConfigManager {
    loaded = false;
    localStorageAvailable = true;
    config = {} as ConfigType;
    onModifiedListeners: Array<(key?: string) => void> = [];

    load(onLoadCompleteCb: () => void) {
        const onLoaded = (strConfig: string) => {
            let data = {};
            try {
                data = JSON.parse(strConfig);
            } catch (_e) {}
            this.config = util.mergeDeep({}, defaultConfig, data);
            this.checkUpgradeConfig();
            this.onModified();
            this.loaded = true;
            onLoadCompleteCb();
        };
        let storedConfig: string | null = "{}";
        try {
            storedConfig = localStorage.getItem("surviv_config")!;
        } catch (_err) {
            this.localStorageAvailable = false;
        }
        onLoaded(storedConfig);
    }

    store() {
        const strData = JSON.stringify(this.config);
        if (this.localStorageAvailable) {
            // In browsers, like Safari, localStorage setItem is
            // disabled in private browsing mode.
            // This try/catch is here to handle that situation.
            try {
                localStorage.setItem("surviv_config", strData);
            } catch (_e) {}
        }
    }

    set<T extends ConfigKey>(key: T, value: ConfigType[T]) {
        if (!key) {
            return;
        }
        const path = key.split(".");

        let elem = this.config;
        while (path.length > 1) {
            // @ts-expect-error bleh
            elem = elem[path.shift()];
        }
        // @ts-expect-error bleh
        elem[path.shift()] = value;

        this.store();
        this.onModified(key);
    }

    get<T extends ConfigKey>(key: T): ConfigType[T] | undefined {
        if (!key) {
            return undefined;
        }

        const path = key.split(".");
        let elem = this.config as any;
        for (let i = 0; i < path.length; i++) {
            elem = elem[path[i]];
        }
        return elem;
    }

    addModifiedListener(e: (key?: string) => void) {
        this.onModifiedListeners.push(e);
    }

    onModified(key?: string) {
        for (let i = 0; i < this.onModifiedListeners.length; i++) {
            this.onModifiedListeners[i](key);
        }
    }

    checkUpgradeConfig() {
        // seem not to be implemeted yet
        // this.get("version");
        // // @TODO: Put upgrade code here
        // this.set("version", 1);
    }
}
