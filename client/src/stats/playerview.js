import { EmotesDefs as EmoteDefs } from "../../../shared/defs/gameObjects/emoteDefs";
import { device } from "../device";
import $ from "jquery";
import { battletagCensoring, helpers } from "./mainview";
import loading from "./templates/loading.jsx";
import player from "./templates/player.jsx";
import playerCards from "./templates/playerCards.jsx";
import matchData from "./templates/matchData.jsx";
import matchHistory from "./templates/matchHistory.jsx";

const templates = {
    loading,
    matchData,
    matchHistory,
    player,
    playerCards
};

//
// Helpers
//
function formatTime(time) {
    const minutes = Math.floor(time / 60) % 60;
    let seconds = Math.floor(time) % 60;
    if (seconds < 10) {
        seconds = `0${seconds}`;
    }
    let timeSurv = "";
    timeSurv += `${minutes}:`;
    timeSurv += seconds;
    return timeSurv;
}
function emoteImgToSvg(img) {
    if (img && img.length > 4) {
        return `../img/emotes/${img.slice(0, -4)}.svg`;
    } else {
        return "";
    }
}
function getPlayerCardData(userData, error, teamModeFilter) {
    // get_user_stats currently returns data rows for all teamModes;
    // transform the data a bit for the player card.
    if (error || !userData) {
        return {
            profile: {},
            teamModes: [],
            error
        };
    }
    const emoteDef = EmoteDefs[userData.player_icon];
    const texture = emoteDef ? emoteImgToSvg(emoteDef.texture) : "../img/gui/player-gui.svg";
    let tmpSlug = userData.slug.toLowerCase();
    tmpSlug = tmpSlug.replace(userData.username.toLowerCase(), "");
    const tmpslugToShow = tmpSlug != "" ? battletagCensoring.getCensoredBattletag(`${userData.username}#${tmpSlug}`) : battletagCensoring.getCensoredBattletag(userData.username);
    const m = userData.slug;
    const profile = {
        username: battletagCensoring.getCensoredBattletag(userData.username),
        slugToShow: tmpslugToShow,
        slugUncensored: m,
        banned: userData.banned,
        avatarTexture: texture,
        wins: userData.wins,
        kills: userData.kills,
        games: userData.games,
        kpg: userData.kpg
    };
    // Gather card data
    const addStat = function(arr, name, val) {
        arr.push({
            name,
            val
        });
    };
    const teamModes = [];
    for (let f = 0; f < userData.modes.length; f++) {
        const v = userData.modes[f];
        // Overall rank / rating not available yet
        const mid = [];
        addStat(mid, "Rating", "-");
        addStat(mid, "Rank", "-");
        const bot = [];
        addStat(bot, "Wins", v.wins);
        addStat(bot, "Win %", v.winPct);
        addStat(bot, "Kills", v.kills);
        addStat(bot, "Avg Survived", formatTime(v.avgTimeAlive));
        addStat(bot, "Most kills", v.mostKills);
        addStat(bot, "K/G", v.kpg);
        addStat(bot, "Most damage", v.mostDamage);
        addStat(bot, "Avg Damage", v.avgDamage);
        teamModes.push({
            teamMode: v.teamMode,
            games: v.games,
            midStats: mid,
            botStats: bot
        });
    }
    // Insert blank cards for all teammodes
    const keys = Object.keys(TeamModeToString);
    for (let x = 0; x < keys.length; x++) {
        (function(e) {
            const teamMode = keys[e];
            if (!teamModes.find(x => {
                return x.teamMode == teamMode;
            })) {
                teamModes.push({
                    teamMode,
                    games: 0
                });
            }
        })(x);
    }
    teamModes.sort((e, a) => {
        return e.teamMode - a.teamMode;
    });
    for (let w = 0; w < teamModes.length; w++) {
        const teamMode = teamModes[w].teamMode;
        teamModes[w].name = TeamModeToString[teamMode];
    }
    const gameModes = helpers.getGameModes();
    return {
        profile,
        error,
        teamModes,
        teamModeFilter,
        gameModes
    };
}

//
// Query
//

const TeamModeToString = {
    1: "solo",
    2: "duo",
    4: "squad"
};
class Query {
    constructor() {
        this.inProgress = false;
        this.dataValid = false;
        this.error = false;
        this.args = {};
        this.data = null;
    }

    query(url, args, debugTimeout, onComplete) {
        const This = this;
        if (this.inProgress) {
            return;
        }
        this.inProgress = true;
        this.error = false;
        $.ajax({
            url,
            type: "POST",
            data: JSON.stringify(args),
            contentType: "application/json; charset=utf-8",
            timeout: 10000,
            success: function(data) {
                This.data = data;
                This.dataValid = !!data;
            },
            error: function() {
                This.error = true;
                This.dataValid = false;
            },
            complete: function() {
                setTimeout(() => {
                    This.inProgress = false;
                    onComplete(This.error, This.data);
                }, debugTimeout);
            }
        });
    }
}

//
// PlayerView
//
export class PlayerView {
    constructor(app) {
        this.app = app;
        this.games = [];
        this.moreGamesAvailable = true;
        this.teamModeFilter = 7;
        this.userStats = new Query();
        this.matchHistory = new Query();
        this.matchData = new Query();
        this.el = $(templates.player({
            phoneDetected: device.mobile && !device.tablet
        }));
    }

    getUrlParams() {
        const location = window.location.href;
        // const slug = (new RegExp("stats/([^/?#]+).*$").exec(location) || [])[1] || "";
        const slug = (location.match("stats/([^/?#]+).*$") || [])[1] || "";
        const interval = helpers.getParameterByName("t") || "all";
        const mapId = helpers.getParameterByName("mapId") || "-1";
        return {
            // move to variables with the same name.
            // params[1] || ""
            slug,
            interval,
            mapId
        };
    }

    getGameByGameId(gameId) {
        return this.games.find(x => {
            return x.summary.guid == gameId;
        });
    }

    load() {
        const getUrlParams = this.getUrlParams();
        const slug = getUrlParams.slug;
        const interval = getUrlParams.interval;
        const mapId = getUrlParams.mapId;
        this.loadUserStats(slug, interval, mapId);
        this.loadMatchHistory(slug, 0, 7);
        this.render();
    }

    loadUserStats(slug, interval, mapIdFilter) {
        const This = this;
        const args = {
            slug,
            interval,
            mapIdFilter
        };
        this.userStats.query("/api/user_stats", args, 0, () => {
            This.render();
            console.log("loaded");
        });
    }

    loadMatchHistory(slug, offset, teamModeFilter) {
        const This = this;
        const args = {
            slug,
            offset,
            count: 10,
            teamModeFilter
        };
        this.matchHistory.query("/api/match_history", args, 0, (_, data) => {
            const gameModes = helpers.getGameModes();
            const games = data || [];
            for (let s = 0; s < games.length; s++) {
                (function(e) {
                    games[e].team_mode = TeamModeToString[games[e].team_mode];
                    const gameMode = gameModes.find(x => {
                        return x.mapId == games[e].map_id;
                    });
                    games[e].icon = gameMode ? gameMode.desc.icon : "";
                    This.games.push({
                        expanded: false,
                        summary: games[e],
                        data: null,
                        dataError: false
                    });
                })(s);
            }
            This.moreGamesAvailable = games.length >= 10;
            This.render();
        });
    }

    loadMatchData(gameId) {
        const This = this;
        const args = {
            gameId
        };
        this.matchData.query("/api/match_data", args, 0, (err, data) => {
            const game = This.getGameByGameId(gameId);
            if (game) {
                game.data = data;
                game.dataError = err || !data;
            }
            This.render();
        });
    }

    toggleMatchData(e) {
        const game = this.getGameByGameId(e);
        if (!game) {
            return;
        }
        const wasExpanded = game.expanded;
        for (let n = 0; n < this.games.length; n++) {
            this.games[n].expanded = false;
        }
        game.expanded = !wasExpanded;
        if (!game.data && !game.dataError) {
            this.loadMatchData(e);
        }
        this.render();
    }

    onChangedParams() {
        const time = $("#player-time").val();
        const mapId = $("#player-map-id").val();
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        window.history.pushState("", "", `?t=${time}&mapId=${mapId}`);
        const params = this.getUrlParams();
        this.loadUserStats(params.slug, params.interval, params.mapId);
    }

    render() {
        const This = this;
        const params = this.getUrlParams();
        // User stats
        let content = "";
        if (this.userStats.inProgress) {
            content = templates.loading({
                type: "player"
            });
        } else {
            const cardData = getPlayerCardData(this.userStats.data, this.userStats.error, this.teamModeFilter);
            content = templates.playerCards(cardData);
        }
        this.el.find(".content").html(content);
        const timeSelector = this.el.find("#player-time");
        if (timeSelector) {
            timeSelector.val(params.interval);
            timeSelector.change(() => {
                This.onChangedParams();
            });
        }
        const mapIdSelector = this.el.find("#player-map-id");
        if (mapIdSelector) {
            mapIdSelector.val(params.mapId);
            mapIdSelector.change(() => {
                This.onChangedParams();
            });
        } // Match history
        let historyContent = "";
        if (this.games.length == 0 && this.matchHistory.inProgress) {
            historyContent = templates.loading({
                type: "match_history"
            });
        } else {
            historyContent = templates.matchHistory({
                games: this.games,
                moreGamesAvailable: this.moreGamesAvailable,
                loading: this.matchHistory.inProgress,
                error: this.matchHistory.error
            });
        }
        const historySelector = this.el.find("#match-history");
        if (historySelector) {
            historySelector.html(historyContent);
            $(".js-match-data").click(e => {
                if (!$(e.target).is("a")) {
                    This.toggleMatchData($(e.currentTarget).data("game-id"));
                }
            });
            $(".js-match-load-more").click(a => {
                const params = This.getUrlParams();
                This.loadMatchHistory(params.slug, This.games.length, This.teamModeFilter);
                This.render();
            });
            $(".extra-team-mode-filter").click(e => {
                if (!This.matchHistory.inProgress) {
                    const params = This.getUrlParams();
                    This.games = [];
                    This.teamModeFilter = $(e.currentTarget).data("filter");
                    This.loadMatchHistory(params.slug, 0, This.teamModeFilter);
                    This.render();
                }
            });

            // Match data
            let matchDataContent = "";
            const expandedGame = this.games.find(x => {
                return x.expanded;
            });
            if (expandedGame) {
                const params = this.getUrlParams();
                let localId = 0;
                // Get this player's player_id in this match
                if (expandedGame.data) {
                    for (let h = 0; h < expandedGame.data.length; h++) {
                        const d = expandedGame.data[h];
                        if (params.slug == d.slug) {
                            localId = d.player_id || 0;
                            break;
                        }
                    }
                }
                matchDataContent = templates.matchData({
                    data: expandedGame.data,
                    error: expandedGame.dataError,
                    loading: this.matchData.inProgress,
                    localId
                });
            }
            $("#match-data").html(matchDataContent);
        }
    // this.app.localization.localizeIndex()
    }
}
