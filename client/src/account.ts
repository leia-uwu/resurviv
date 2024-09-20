import $ from "jquery";
import type { ItemStatus, Loadout } from "../../shared/utils/helpers";
import { util } from "../../shared/utils/util";
import { api } from "./api";
import type { ConfigManager } from "./config";
import { helpers } from "./helpers";
import type { Item } from "./ui/loadoutMenu";
import loadouts from "./ui/loadouts";

type DataOrCallback =
    | Record<string, unknown>
    | ((err: null | JQuery.jqXHR<any>, res?: any) => void)
    | null;

function ajaxRequest(
    url: string,
    data: DataOrCallback,
    cb: (err: null | JQuery.jqXHR<any>, res?: any) => void,
) {
    if (typeof data === "function") {
        cb = data;
        data = null;
    }
    const opts: JQueryAjaxSettings = {
        url: api.resolveUrl(url),
        type: "POST",
        timeout: 10 * 1000,
        headers: {
            // Set a header to guard against CSRF attacks.
            //
            // JQuery does this automatically, however we'll add it here explicitly
            // so the intent is clear incase of refactoring in the future.
            "X-Requested-With": "XMLHttpRequest",
        },
    };
    if (data) {
        opts.contentType = "application/json; charset=utf-8";
        opts.data = JSON.stringify(data);
    }
    $.ajax(opts)
        .done((res) => {
            cb(null, res);
        })
        .fail((e) => {
            cb(e);
        });
}

export class Account {
    events: Record<string, Array<(...args: any[]) => void>> = {};
    requestsInFlight = 0;
    loggingIn = false;
    loggedIn = false;
    profile = {
        linkedTwitch: false,
        linkedDiscord: false,
        linkedGithub: false,
        usernameSet: false,
        username: "",
        slug: "",
        usernameChangeTime: 0,
    };

    loadout = loadouts.defaultLoadout();
    loadoutPriv = "";
    items: Item[] = [];
    quests = [];
    questPriv = "";
    pass = {};

    constructor(public config: ConfigManager) {
        window.login = () => {
            this.login();
        };
        window.deleteAccount = () => {
            this.deleteAccount();
        };
        window.deleteItems = () => {
            this.ajaxRequest("/api/user/delete_items", {}, (_e, _t) => {
                this.loadProfile();
            });
        };
        window.setQuest = (questType, idx = 0) => {
            this.ajaxRequest(
                "/api/user/set_quest",
                {
                    questType,
                    idx,
                },
                (_e, _t) => {
                    this.getPass();
                },
            );
        };
        window.refreshQuest = (idx) => {
            this.refreshQuest(idx);
        };
        window.setPassUnlock = (unlockType) => {
            this.setPassUnlock(unlockType);
        };
    }

    ajaxRequest(url: string, data: DataOrCallback, cb?: (err: any, res?: any) => void) {
        if (typeof data === "function") {
            cb = data;
            data = null;
        }
        this.requestsInFlight++;
        this.emit("request", this);
        ajaxRequest(url, data, (err, res) => {
            cb!(err, res);
            this.requestsInFlight--;
            this.emit("request", this);
            if (this.requestsInFlight == 0) {
                this.emit("requestsComplete");
            }
        });
    }

    addEventListener(event: string, callback: (...args: any[]) => void) {
        this.events[event] = this.events[event] || [];
        this.events[event].push(callback);
    }

    removeEventListener(event: string, callback: () => void) {
        const listeners = this.events[event] || [];
        for (let i = listeners.length - 1; i >= 0; i--) {
            if (listeners[i] == callback) {
                listeners.splice(i, 1);
            }
        }
    }

    emit(event: string, ...args: any[]) {
        const listenersCopy = (this.events[event] || []).slice(0);
        // const len = arguments.length;
        // const data = Array(len > 1 ? len - 1 : 0);
        // for (let i = 1; i < len; i++) {
        //     data[i - 1] = arguments[i];
        // }
        for (let i = 0; i < listenersCopy.length; i++) {
            // listenersCopy[i].apply(listenersCopy, args);
            listenersCopy[i](...args);
        }
    }

    init() {
        if (this.config.get("sessionCookie")) {
            this.setSessionCookies();
        }
        if (helpers.getCookie("app-data")) {
            this.login();
        } else {
            this.emit("request", this);
            this.emit("items", []);

            const storedLoadout = this.config.get("loadout");
            this.loadout = util.mergeDeep({}, loadouts.defaultLoadout(), storedLoadout);
            this.emit("loadout", this.loadout);
        }
    }

    setSessionCookies() {
        this.clearSessionCookies();
        document.cookie = this.config.get("sessionCookie")!;
        document.cookie = `app-data=${Date.now()}`;
    }

    clearSessionCookies() {
        document.cookie = "app-sid=;expires=Thu, 01 Jan 1970 00:00:01 GMT;";
        document.cookie = "app-data=;expires=Thu, 01 Jan 1970 00:00:01 GMT;";
    }

    loginWithAccessToken(
        authUrl: string,
        requestTokenFn: (cb: (...args: any[]) => void) => void,
        extractTokenFn: (...args: any[]) => void,
    ) {
        requestTokenFn((err, data) => {
            if (err) {
                this.emit("error", "login_failed");
                return;
            }
            const token = extractTokenFn(data) as unknown as string;
            this.ajaxRequest(`${authUrl}?access_token=${token}`, (err, res) => {
                if (err) {
                    this.emit("error", "login_failed");
                } else {
                    this.config.set("sessionCookie", res.cookie);
                    this.setSessionCookies();
                    this.login();
                }
            });
        });
    }

    login() {
        if (helpers.getCookie("app-data")) {
            this.loadProfile();
            this.getPass(true);
        }
    }

    logout() {
        this.config.set("profile", null);
        this.config.set("sessionCookie", null);
        this.ajaxRequest("/api/user/logout", (_e, _t) => {
            window.location.reload();
        });
    }

    loadProfile() {
        this.loggingIn = !this.loggedIn;
        this.ajaxRequest("/api/user/profile", (err, data) => {
            const a = this.loggingIn;
            this.loggingIn = false;
            this.loggedIn = false;
            this.profile = {} as this["profile"];
            this.loadoutPriv = "";
            this.items = [];
            if (err) {
                console.error("account", "load_profile_error");
            } else if (data.banned) {
                this.emit("error", "account_banned", data.reason);
            } else if (data.success) {
                this.loggedIn = true;
                this.profile = data.profile;
                this.loadoutPriv = data.loadoutPriv;
                this.items = data.items;
                this.emit("loadout", data.loadout);
                const profile = this.config.get("profile") || { slug: "" };
                profile.slug = data.profile.slug;
                this.config.set("profile", profile);
            }
            if (!this.loggedIn) {
                this.config.set("sessionCookie", null);
            }
            if (a && this.loggedIn) {
                this.emit("login", this);
            }
            this.emit("items", this.items);
        });
    }

    resetStats() {
        this.ajaxRequest("/api/user/reset_stats", (t, _r) => {
            if (t) {
                console.error("account", "reset_stats_error");
                this.emit("error", "server_error");
            }
        });
    }

    deleteAccount() {
        this.ajaxRequest("/api/user/delete", (err, _res) => {
            if (err) {
                console.error("account", "delete_error");
                this.emit("error", "server_error");
                return;
            }
            this.config.set("profile", null);
            this.config.set("sessionCookie", null);
            window.location.reload();
        });
    }

    setUsername(username: string, callback: (err?: string) => void) {
        this.ajaxRequest(
            "/api/user/username",
            {
                username,
            },
            (err, res) => {
                if (err) {
                    console.error("account", "set_username_error");
                    callback(err);
                    return;
                }
                if (res.result == "success") {
                    this.loadProfile();
                    callback();
                } else {
                    callback(res.result);
                }
            },
        );
    }

    setLoadout(loadout: Loadout) {
        // Preemptively set the new loadout and revert if the call fail
        const loadoutPrev = this.loadout;
        this.loadout = loadout;
        this.emit("loadout", this.loadout);
        this.config.set("loadout", loadout);

        if (!helpers.getCookie("app-data")) return;

        this.ajaxRequest(
            "/api/user/loadout",
            {
                loadout: loadout,
            },
            (err, res) => {
                if (err) {
                    console.error("account", "set_loadout_error");
                    this.emit("error", "server_error");
                }
                if (err || !res.loadout) {
                    this.loadout = loadoutPrev;
                } else {
                    this.loadout = res.loadout;
                    this.loadoutPriv = res.loadoutPriv;
                }
                this.emit("loadout", this.loadout);
            },
        );
    }

    setItemStatus(status: ItemStatus, itemTypes: string[]) {
        if (itemTypes.length != 0) {
            // Preemptively mark the item status as modified on our local copy
            for (let i = 0; i < itemTypes.length; i++) {
                const item = this.items.find((x) => {
                    return x.type == itemTypes[i];
                });
                if (item) {
                    item.status = Math.max(item.status!, status);
                }
            }
            this.emit("items", this.items);
            this.ajaxRequest(
                "/api/user/set_item_status",
                {
                    status,
                    itemTypes,
                },
                (err, _res) => {
                    if (err) {
                        console.error("account", "set_item_status_error");
                    }
                },
            );
        }
    }

    getPass(_tryRefreshQuests?: boolean) {
        /* const This = this;
            this.ajaxRequest(
                "/api/user/get_pass",
                {
                    tryRefreshQuests
                },
                (err, res) => {
                    This.pass = {};
                    This.quests = [];
                    This.questPriv = "";
                    if (err || !res.success) {
                        console.error(
                            "account",
                            "get_pass_error"
                        );
                    } else {
                        This.pass = res.pass || {};
                        This.quests = res.quests || [];
                        This.questPriv = res.questPriv || "";
                        This.quests.sort((a, b) => {
                            return a.idx - b.idx;
                        });
                        This.emit("pass", This.pass, This.quests, true);
                        if (This.pass.newItems) {
                            This.loadProfile();
                        }
                    }
                }
            ); */
    }

    setPassUnlock(unlockType: string) {
        this.ajaxRequest(
            "/api/user/set_pass_unlock",
            {
                unlockType,
            },
            (err, res) => {
                if (err || !res.success) {
                    console.error("account", "set_pass_unlock_error");
                } else {
                    this.getPass(false);
                }
            },
        );
    }

    refreshQuest(idx: number) {
        this.ajaxRequest(
            "/api/user/refresh_quest",
            {
                idx,
            },
            (err, res) => {
                if (err) {
                    console.error("account", "refresh_quest_error");
                    return;
                }
                if (res.success) {
                    this.getPass(false);
                } else {
                    // Give the pass UI a chance to update quests
                    this.emit("pass", this.pass, this.quests, false);
                }
            },
        );
    }
}
