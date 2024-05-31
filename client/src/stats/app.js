import $ from "jquery";
import { ConfigManager as Config } from "../config";
import { Localization } from "../ui/localization";
import { MainView } from "./mainview";
import { PlayerView } from "./playerview";
import language from "./templates/language.jsx";
import slugify from "slugify";

const templates = {
    language
};
class Router {
    constructor(app) {
        this.app = app;
        this.routes = [];
        const routeChange = this.onRouteChange.bind(this);
        window.addEventListener("load", routeChange);
    }

    addRoute(name, url) {
        this.routes.push({
            name,
            url
        });
    }

    onRouteChange() {
        const location = window.location.href;
        const route = this.routes.find(r => {
            return location.match(new RegExp(r.url));
        });
        if (route) {
            this.app.setView(route.name);
        } else {
            this.app.setView();
        }
    }
}
export class App {
    constructor() {
        this.el = $("#content");
        this.mainView = new MainView(this);
        this.playerView = new PlayerView(this);
        const router = new Router(this);
        router.addRoute("player", "stats/([^/?#]+).*$");
        router.addRoute("main", "stats");
        $("#search-players").on("submit", e => {
            e.preventDefault();
            const name = $("#search-players :input").val();
            const slug = slugify(name);
            // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
            window.location.href = `/stats/${slug}`;
        }); // Load slug for "My Profile" link
        try {
            const config = JSON.parse(localStorage.getItem("surviv_config"));
            if (config.profile?.slug) {
                $("#my-profile").css("display", "block").attr("href", `/stats/${config.profile.slug}`);
            }
        } catch (e) {}

        // Load config
        this.config = new Config();
        this.config.load(() => {});
        this.localization = new Localization();
        this.localization.setLocale(this.config.get("language"));
        this.localization.localizeIndex(); // this.adManager = new h;
    }

    setView(name) {
        // const phoneDetected = device.mobile && !device.tablet;
        const elAdsLeaderboardTop = $("#adsLeaderBoardTop");
        const elAdsLeaderboardBottom = $("#adsLeaderBoardBottom");
        const elAdsPlayerTop = $("#adsPlayerTop");
        const elAdsPlayerBottom = $("#adsPlayerBottom");
        const premiumPass = localStorage.getItem("premium");
        // name == "player"
        //     ? (elAdsLeaderboardTop.css("display", "none"),
        //     elAdsLeaderboardBottom.css("display", "none"),
        //     phoneDetected
        //         ? (elAdsPlayerTop.css("display", "none"),
        //         elAdsPlayerBottom.css("display", "block"))
        //         : (elAdsPlayerTop.css("display", "block"),
        //         elAdsPlayerBottom.css("display", "none")),
        //     this.view = this.playerView)
        //     : (elAdsPlayerTop.css("display", "none"),
        //     elAdsPlayerBottom.css("display", "none"),
        //     phoneDetected
        //         ? (elAdsLeaderboardTop.css("display", "none"),
        //         elAdsLeaderboardBottom.css("display", "block"))
        //         : (elAdsLeaderboardTop.css("display", "block"),
        //         elAdsLeaderboardBottom.css("display", "none")),
        //     this.view = this.mainView);

        if (name == "player") {
            // elAdsLeaderboardTop.css('display', 'none');
            // elAdsLeaderboardBottom.css('display', 'none');
            // if (phoneDetected) {
            //     elAdsPlayerTop.css('display', 'none');
            //     elAdsPlayerBottom.css('display', 'block');
            // } else {
            //     elAdsPlayerTop.css('display', 'block');
            //     elAdsPlayerBottom.css('display', 'none');
            // }
            this.view = this.playerView;
        } else {
            // elAdsPlayerTop.css('display', 'none');
            // elAdsPlayerBottom.css('display', 'none');

            // if (phoneDetected) {
            //     elAdsLeaderboardTop.css('display', 'none');
            //     elAdsLeaderboardBottom.css('display', 'block');
            // } else {
            //     elAdsLeaderboardTop.css('display', 'block');
            //     elAdsLeaderboardBottom.css('display', 'none');
            // }
            this.view = this.mainView;
        }

        // show ads
        const slotIds = [];
        if (elAdsLeaderboardTop && elAdsLeaderboardTop.css("display") != "none" && premiumPass == "false") {
            slotIds.push("survivio_300x250_leaderboard_top");
            slotIds.push("survivio_728x90_leaderboard_top");
        }
        if (elAdsLeaderboardBottom && elAdsLeaderboardBottom.css("display") != "none" && premiumPass == "false") {
            slotIds.push("survivio_300x250_leaderboard_bottom");
        }
        if (elAdsPlayerTop && elAdsPlayerTop.css("display") != "none" && premiumPass == "false") {
            slotIds.push("survivio_728x90_playerprofile_top");
            slotIds.push("survivio_300x250_playerprofile_top");
        }
        if (elAdsPlayerBottom && elAdsPlayerBottom.css("display") != "none" && premiumPass == "false") {
            slotIds.push("survivio_300x250_playerprofile_bottom");
        }
        // this.adManager.showFreestarAds(slotIds, !1),
        this.view.load();
        this.el.html(this.view.el);
        this.render();
    }

    render() {
        $("#language-select").html(templates.language({
            code: this.localization.getLocale()
        }));

        // Listen for changes in language select
        $(".dropdown-language").off("click");
        $(".dropdown-language").on("click", a => {
            const el = a.target;
            const code = $(el).attr("value");
            $(el).html();
            if (code) {
                // Set the config language
                $("#selected-language").html(code.toUpperCase());
                this.localization.setLocale(code);
                this.localization.localizeIndex();
                this.config.set("language", code);
            }
        });
    }
}
export const app = new App();
