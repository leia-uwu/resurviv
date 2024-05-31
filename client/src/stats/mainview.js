import { device } from "../device";
import $ from "jquery";
import loading from "./templates/loading.jsx";
import main from "./templates/main.jsx";
import leaderboard from "./templates/leaderboard.jsx";
import leaderboardError from "./templates/leaderboardError.jsx";
import { MapDefs } from "../../../shared/defs/mapDefs";
const templates = {
    loading,
    main,
    leaderboard,
    leaderboardError
};

//
// Helpers
//
function getParameterByName(name, url) {
    const searchParams = new URLSearchParams(url || window.location.href || window.location.search);
    return searchParams.get(name) || "";
}
function getGameModes() {
    const gameModes = [];

    // Gather unique mapIds and assosciated map descriptions from the list of maps
    const mapKeys = Object.keys(MapDefs);
    const _loop = function _loop(i) {
        const mapKey = mapKeys[i];
        const mapDef = MapDefs[mapKey];
        if (!gameModes.find(x => {
            return x.mapId == mapDef.mapId;
        })) {
            gameModes.push({
                mapId: mapDef.mapId,
                desc: mapDef.desc
            });
        }
    };
    for (let i = 0; i < mapKeys.length; i++) {
        _loop(i);
    }
    gameModes.sort((a, b) => {
        return a.mapId - b.mapId;
    });
    return gameModes;
}

// move them to helpers.js

export const helpers = {
    getGameModes,
    getParameterByName
};
export const battletagCensoring = {
    getCensoredBattletag(content) {
        if (content) {
            // bad words here
            const words = [];
            const asterisk = "*";
            const re = new RegExp(words.join("|"), "ig");
            const newString = content.replace(re, matched => {
                return asterisk.repeat(matched.length);
            });
            return newString;
        }
        return content;
    }
};

//
// MainView
//

console.log(templates);
export class MainView {
    constructor(app) {
        this.app = app;
        this.loading = false;
        this.error = false;
        this.data = {};
        this.el = $(templates.main({
            phoneDetected: device.mobile && !device.tablet,
            gameModes: helpers.getGameModes()
        }).children);
        this.el.find(".leaderboard-opt").change(() => {
            this.onChangedParams();
        });
    }

    load() {
        const This = this;
        this.loading = true;
        this.error = false; // Supported args so far:
        //   type:     most_kills, most_damage_dealt, kills, wins, kpg
        //   interval: daily, weekly, alltime
        //   teamMode: solo, duo, squad
        //   maxCount: 10, 100
        let type = helpers.getParameterByName("type") || "most_kills";
        const interval = helpers.getParameterByName("t") || "daily";
        const teamMode = helpers.getParameterByName("team") || "solo";
        const mapId = helpers.getParameterByName("mapId") || "0";
        if (type == "most_kills" && mapId == 3) {
            type = "most_damage_dealt";
        }
        const maxCount = 100;
        const args = {
            type,
            interval,
            teamMode,
            mapId,
            maxCount
        };
        $.ajax({
            url: "/api/leaderboard",
            type: "POST",
            data: JSON.stringify(args),
            contentType: "application/json; charset=utf-8",
            success: function(data) {
                This.data = {
                    type,
                    interval,
                    teamMode,
                    mapId,
                    maxCount: 100,
                    data
                };
            },
            error: function(a, t) {
                This.error = true;
            },
            complete: function() {
                This.loading = false;
                This.render();
            }
        });
        this.render();
    }

    onChangedParams() {
        const type = $("#leaderboard-type").val();
        const time = $("#leaderboard-time").val();
        const teamMode = $("#leaderboard-team-mode").val();
        const mapId = $("#leaderboard-map-id").val();
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        window.history.pushState("", "", `?type=${type}&team=${teamMode}&t=${time}&mapId=${mapId}`);
        this.load();
    }

    render() {
    // Compute derived values
        const TypeToString = {
            most_kills: "stats-most-kills",
            most_damage_dealt: "stats-most-damage",
            kills: "stats-total-kills",
            wins: "stats-total-wins",
            kpg: "stats-kpg"
        };
        // @TODO: Refactor shared leaderboard constants with app/src/db.js
        const MinGames = {
            kpg: {
                daily: 15,
                weekly: 50,
                alltime: 100
            }
        };
        let content = "";
        if (this.loading) {
            content = templates.loading({
                type: "leaderboard"
            });
        } else if (this.error || !this.data.data) {
            content = templates.leaderboardError();
        } else {
            for (let n = 0; n < this.data.data.length; n++) {
                if (this.data.data[n].username) {
                    this.data.data[n].username = battletagCensoring.getCensoredBattletag(this.data.data[n].username);
                } else {
                    this.data.data[n].usernames &&= this.data.data[n].usernames.map(battletagCensoring.getCensoredBattletag);
                }
                if (this.data.data[n].slug) {
                    this.data.data[n].slugUncensored = this.data.data[n].slug;
                    this.data.data[n].slug = battletagCensoring.getCensoredBattletag(this.data.data[n].slug);
                } else if (this.data.data[n].slugs) {
                    this.data.data[n].slugsUncensored = this.data.data[n].slugs;
                    this.data.data[n].slugs = this.data.data[n].slugs.map(battletagCensoring.getCensoredBattletag);
                }
            }
            const statName = TypeToString[this.data.type] || "";
            let minGames = MinGames[this.data.type] ? MinGames[this.data.type][this.data.interval] : 1;
            minGames = minGames || 1;
            content = templates.leaderboard(Object.assign({
                statName,
                minGames
            }, this.data));
            // Set the select options
            $("#leaderboard-team-mode").val(this.data.teamMode);
            $("#leaderboard-map-id").val(this.data.mapId);
            $("#leaderboard-type").val(this.data.type);
            $("#leaderboard-time").val(this.data.interval); // Disable most kills option if 50v50 selected
            const factionMode = this.data.mapId == 3;
            if (factionMode) {
                $("#leaderboard-type option[value=\"most_kills\"]").attr("disabled", "disabled");
            } else {
                $("#leaderboard-type option[value=\"most_kills\"]").removeAttr("disabled");
            }
        }
        this.el.find(".content").html(content);
        this.app.localization.localizeIndex();
    }
}
