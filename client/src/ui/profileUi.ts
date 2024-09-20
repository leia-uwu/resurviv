import $ from "jquery";
import type { Account } from "../account";
import { api } from "../api";
import { device } from "../device";
import { helpers } from "../helpers";
import type { LoadoutMenu } from "./loadoutMenu";
import loadout from "./loadouts";
import type { Localization } from "./localization";
import { MenuModal } from "./menuModal";

function createLoginOptions(
    parentElem: JQuery<HTMLElement>,
    localization: Localization,
    loginMethods: { method: string; linked: boolean }[],
) {
    const contentsElem = parentElem.find(".login-options-content");
    contentsElem.empty();

    const buttonParentElem = $("<div/>", {
        class: "account-buttons",
    });
    contentsElem.append(buttonParentElem);
    const addLoginOption = function (
        method: string,
        _linked: boolean,
        onClick: () => void,
    ) {
        const el = $("<div/>", {
            class: `menu-option btn-darken btn-standard btn-login-${method}`,
        });
        el.append(
            $("<span/>", {
                class: "login-button-name",
            })
                .append(
                    $("<span/>", {
                        html: localization.translate(`index-${method}`),
                    }),
                )
                .append(
                    $("<div/>", {
                        class: "icon",
                    }),
                ),
        );
        el.click((_e) => {
            onClick();
        });
        buttonParentElem.append(el);
    };

    // Define the available login methods
    loginMethods.map(({ method, linked }) =>
        addLoginOption(method, linked, () => {
            window.location.href = `/api/user/auth/${method}`;
        }),
    );
}

export class ProfileUi {
    setNameModal: MenuModal | null = null;
    resetStatsModal: MenuModal | null = null;
    deleteAccountModal: MenuModal | null = null;
    userSettingsModal: MenuModal | null = null;
    loginOptionsModal: MenuModal | null = null;
    createAccountModal: MenuModal | null = null;

    loginOptionsModalMobile!: MenuModal;
    modalMobileAccount!: MenuModal;

    constructor(
        public account: Account,
        public localization: Localization,
        public loadoutMenu: LoadoutMenu,
        public errorModal: MenuModal,
    ) {
        this.account = account;
        this.localization = localization;
        this.loadoutMenu = loadoutMenu;
        this.errorModal = errorModal;

        account.addEventListener("error", this.onError.bind(this));
        account.addEventListener("login", this.onLogin.bind(this));
        account.addEventListener("loadout", this.onLoadoutUpdated.bind(this));
        account.addEventListener("items", this.onItemsUpdated.bind(this));
        account.addEventListener("request", this.render.bind(this));
        this.initUi();
        this.render();
    }

    initUi() {
        // Set username
        const clearNamePrompt = function () {
            $("#modal-body-warning").css("display", "none");
            $("#modal-account-name-input").val("");
        };
        this.setNameModal = new MenuModal($("#modal-account-name-change"));
        this.setNameModal.onShow(clearNamePrompt);
        this.setNameModal.onHide(clearNamePrompt);
        $("#modal-account-name-finish").click((t) => {
            t.stopPropagation();
            const name = $("#modal-account-name-input").val() as string;
            this.account.setUsername(name, (error?: string) => {
                if (error) {
                    const ERROR_CODE_TO_LOCALIZATION = {
                        failed: "Failed setting username.",
                        invalid: "Invalid username.",
                        taken: "Name already taken!",
                        change_time_not_expired:
                            "Username has already been set recently.",
                    };
                    const message =
                        ERROR_CODE_TO_LOCALIZATION[
                            error as keyof typeof ERROR_CODE_TO_LOCALIZATION
                        ] || ERROR_CODE_TO_LOCALIZATION.failed;
                    $("#modal-body-warning").hide();
                    $("#modal-body-warning").html(message);
                    $("#modal-body-warning").fadeIn();
                } else {
                    this.setNameModal!.hide();
                }
            });
        });
        $("#modal-account-name-input").on("keypress", (e) => {
            if ((e.which || e.keyCode) === 13) {
                $("#modal-account-name-finish").trigger("click");
            }
        });

        // Reset stats
        this.resetStatsModal = new MenuModal($("#modal-account-reset-stats"));
        this.resetStatsModal.onShow(() => {
            $("#modal-account-reset-stats-input").val("");
            this.modalMobileAccount.hide();
        });
        $("#modal-account-reset-stats-finish").click((t) => {
            t.stopPropagation();
            if ($("#modal-account-reset-stats-input").val() == "RESET STATS") {
                this.account.resetStats();
                this.resetStatsModal!.hide();
            }
        });
        $("#modal-account-reset-stats-input").on("keypress", (e) => {
            if ((e.which || e.keyCode) === 13) {
                $("#modal-account-reset-stats-finish").trigger("click");
            }
        });
        // Delete account
        this.deleteAccountModal = new MenuModal($("#modal-account-delete"));
        this.deleteAccountModal.onShow(() => {
            $("#modal-account-delete-input").val("");
            this.modalMobileAccount.hide();
        });
        $("#modal-account-delete-finish").click((t) => {
            t.stopPropagation();
            if ($("#modal-account-delete-input").val() == "DELETE") {
                this.account.deleteAccount();
                this.deleteAccountModal!.hide();
            }
        });
        $("#modal-account-delete-input").on("keypress", (e) => {
            if ((e.which || e.keyCode) === 13) {
                $("#modal-account-delete-finish").trigger("click");
            }
        });

        // User settings
        this.userSettingsModal = new MenuModal($(".account-buttons-settings"));
        this.userSettingsModal.checkSelector = false;
        this.userSettingsModal.skipFade = true;
        this.userSettingsModal.onShow(() => {
            $(".account-details-top").css("display", "none");
        });
        this.userSettingsModal.onHide(() => {
            $(".account-details-top").css("display", "block");
        });

        // Login and link options
        this.loginOptionsModal = new MenuModal($("#account-login-options"));
        this.loginOptionsModal.checkSelector = false;
        this.loginOptionsModal.skipFade = true;
        this.loginOptionsModal.onShow(() => {
            $(".account-details-top").css("display", "none");
        });
        this.loginOptionsModal.onHide(() => {
            $(".account-details-top").css("display", "block");
        });

        // Login and link options mobile
        this.loginOptionsModalMobile = new MenuModal($("#account-login-options-mobile"));
        this.loginOptionsModalMobile.checkSelector = false;
        this.loginOptionsModalMobile.skipFade = true;
        this.loginOptionsModalMobile.onShow(() => {
            $(".account-details-top").css("display", "none");
        });
        this.loginOptionsModalMobile.onHide(() => {
            $(".account-details-top").css("display", "block");
        });

        // Create account
        this.createAccountModal = new MenuModal($("#modal-create-account-INVALID_ID"));
        this.createAccountModal.onHide(() => {
            this.loadoutMenu.hide();
        });

        // Mobile Accounts Modal
        this.modalMobileAccount = new MenuModal($("#modal-mobile-account"));
        this.modalMobileAccount.onShow(() => {
            $("#start-top-right").css("display", "none");
            $(".account-details-top").css("display", "none");
        });
        this.modalMobileAccount.onHide(() => {
            $("#start-top-right").css("display", "block");
            $(".account-details-top").css("display", "block");
            this.userSettingsModal!.hide();
        });

        //
        // Main-menu buttons
        //

        // Leaderboard
        $(".account-leaderboard-link").click((_e) => {
            window.open(api.resolveUrl("/stats"), "_blank");
            return false;
        });
        $(".account-stats-link").click(() => {
            this.waitOnLogin(() => {
                if (this.account.loggedIn) {
                    if (this.account.profile.usernameSet) {
                        const slug = this.account.profile.slug || "";
                        window.open(`/stats/${slug}`, "_blank");
                    } else {
                        this.setNameModal!.show(true);
                    }
                } else {
                    this.showLoginMenu({
                        modal: true,
                    });
                }
            });
            return false;
        });
        $(".account-loadout-link, #btn-customize").click(() => {
            this.loadoutMenu.show();
            this.waitOnLogin(() => {
                if (!this.account.loggedIn) {
                    this.showLoginMenu({
                        modal: true,
                    });
                }
            });
            return false;
        });
        $(".account-details-user").click(() => {
            if (
                this.userSettingsModal!.isVisible() ||
                this.loginOptionsModal!.isVisible()
            ) {
                this.userSettingsModal!.hide();
                this.loginOptionsModal!.hide();
            } else {
                this.waitOnLogin(() => {
                    if (device.mobile) {
                        this.modalMobileAccount.show();
                    }
                    if (this.account.loggedIn) {
                        this.loginOptionsModal!.hide();
                        this.userSettingsModal!.show();
                    } else {
                        this.showLoginMenu({
                            modal: false,
                        });
                    }
                });
            }
            return false;
        });
        $(".btn-account-link").click(() => {
            this.userSettingsModal!.hide();
            this.showLoginMenu({
                modal: false,
            });
            return false;
        });
        $(".btn-account-change-name").click(() => {
            if (this.account.profile.usernameChangeTime <= 0) {
                this.userSettingsModal!.hide();
                this.modalMobileAccount.hide();
                $("#modal-account-name-title").html(
                    this.localization.translate("index-change-account-name"),
                );
                this.setNameModal!.show();
            }
            return false;
        });
        $(".btn-account-reset-stats").click(() => {
            this.userSettingsModal!.hide();
            this.resetStatsModal!.show();
            return false;
        });
        $(".btn-account-delete").click(() => {
            this.userSettingsModal!.hide();
            this.deleteAccountModal!.show();
            return false;
        });
        $(".btn-account-logout").click(() => {
            this.account.logout();
            return false;
        });
        $("#btn-pass-locked").click(() => {
            this.showLoginMenu({
                modal: true,
            });
            return false;
        });
    }

    onError(type: string, data?: string) {
        const typeText = {
            server_error: "Operation failed, please try again later.",
            facebook_account_in_use:
                "Failed linking Facebook account.<br/>Account already in use!",
            google_account_in_use:
                "Failed linking Google account.<br/>Account already in use!",
            twitch_account_in_use:
                "Failed linking Twitch account.<br/>Account already in use!",
            discord_account_in_use:
                "Failed linking Discord account.<br/>Account already in use!",
            account_banned: `Account banned: ${data}`,
            login_failed: "Login failed.",
        };
        const text = typeText[type as keyof typeof typeText];
        if (text) {
            this.errorModal.selector.find(".modal-body-text").html(text);
            this.errorModal.show();
        }
    }

    onLogin() {
        this.createAccountModal!.hide();
        this.loginOptionsModalMobile.hide();
        this.loginOptionsModal!.hide();
        if (!this.account.profile.usernameSet) {
            this.setNameModal!.show(true);
        }
    }

    onLoadoutUpdated(_e: unknown) {
        this.updateUserIcon();
    }

    onItemsUpdated(items: Array<{ status: number }> = []) {
        let unconfirmedItemCount = 0;
        let unackedItemCount = 0;
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item.status < loadout.ItemStatus.Confirmed) {
                unconfirmedItemCount++;
            }
            if (item.status < loadout.ItemStatus.Ackd) {
                unackedItemCount++;
            }
        }
        items.filter((e) => {
            return e.status < loadout.ItemStatus.Confirmed;
        });
        items.filter((e) => {
            return e.status < loadout.ItemStatus.Ackd;
        });
        const displayAlert = unconfirmedItemCount > 0 || unackedItemCount > 0;
        $("#loadout-alert-main").css({
            display: displayAlert ? "block" : "none",
        });
    }

    waitOnLogin(cb: () => void) {
        if (this.account.loggingIn && !this.account.loggedIn) {
            const runOnce = () => {
                cb();
                this.account.removeEventListener("requestsComplete", runOnce);
            };
            this.account.addEventListener("requestsComplete", runOnce);
        } else {
            cb();
        }
    }

    showLoginMenu(opts: { modal?: boolean }) {
        opts = Object.assign(
            {
                modal: false,
            },
            opts,
        );
        const modal = opts.modal
            ? this.createAccountModal
            : device.mobile
              ? this.loginOptionsModalMobile
              : this.loginOptionsModal;

        const loginMethods = [
            { method: "github", linked: this.account.profile.linkedGithub },
            // { method: "discord", linked: this.account.profile.linkedDiscord },
            // { method: "twitch", linked: this.account.profile.linkedTwitch }
        ];

        if (import.meta.env.DEV) {
            loginMethods.push({ method: "mock", linked: false });
        }

        createLoginOptions(modal!.selector, this.localization, loginMethods);

        modal!.show();
    }

    updateUserIcon() {
        const icon =
            helpers.getSvgFromGameType(this.account.loadout.player_icon) ||
            "img/gui/player-gui.svg";
        $(".account-details-user .account-avatar").css(
            "background-image",
            `url(${icon})`,
        );
    }

    render() {
        // Loading icon
        const loading = this.account.requestsInFlight > 0;
        $(".account-loading").css("opacity", loading ? 1 : 0);

        let usernameText = helpers.htmlEscape(this.account.profile.username || "");
        if (!this.account.loggedIn) {
            usernameText = this.account.loggingIn
                ? `${this.localization.translate("index-logging-in")}...`
                : this.localization.translate("index-log-in-desc");
        }
        $("#account-player-name").html(usernameText);
        $("#account-player-name").css(
            "display",
            this.account.loggedIn ? "block" : "none",
        );
        $("#account-login").css("display", this.account.loggedIn ? "none" : "block");
        this.updateUserIcon();
        if (this.account.profile.usernameChangeTime <= 0) {
            $(".btn-account-change-name").removeClass("btn-account-disabled");
        } else {
            $(".btn-account-change-name").addClass("btn-account-disabled");
        }
    }
}
