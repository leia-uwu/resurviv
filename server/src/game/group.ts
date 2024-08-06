import { GameConfig } from "../../../shared/gameConfig";
import { util } from "../../../shared/utils/util";
import type { Player } from "./objects/player";

export class Group {
    hash: string;
    groupId: number;
    /**
     * Faction mode team ID.
     * Same as group id when not in faction mode.
     * 0 is no team
     * 1 is red
     * 2 is blue
     */
    allDeadOrDisconnected = true; //only set to false when first player is added to the group
    players: Player[] = [];
    autoFill: boolean;

    constructor(hash: string, groupId: number, autoFill: boolean) {
        this.hash = hash;
        this.groupId = groupId;
        this.autoFill = autoFill;
    }

    /**
     * getPlayers((p) => !p.dead) : gets all alive players on team
     */
    getPlayers(playerFilter?: (player: Player) => boolean) {
        if (!playerFilter) return this.players;

        return this.players.filter((p) => playerFilter(p));
    }

    getAlivePlayers() {
        return this.getPlayers((p) => !p.dead && !p.disconnected);
    }

    getAliveTeammates(player: Player) {
        return this.getPlayers((p) => p != player && !p.dead && !p.disconnected);
    }

    addPlayer(player: Player) {
        player.groupId = this.groupId;
        player.group = this;
        player.setGroupStatuses();
        player.playerStatusDirty = true;
        this.players.push(player);
        this.allDeadOrDisconnected = false;
    }

    removePlayer(player: Player) {
        this.players.splice(this.players.indexOf(player), 1);
        this.checkPlayers();
    }

    /**
     * true if all ALIVE teammates besides the passed in player are downed
     */
    checkAllDowned(player: Player) {
        const filteredPlayers = this.players.filter((p) => p != player && !p.dead);
        if (filteredPlayers.length == 0) {
            // this is necessary since for some dumb reason every() on an empty array returns true????
            return false;
        }
        return filteredPlayers.every((p) => p.downed);
    }

    /**
     * true if all teammates besides the passed in player are dead
     * also if player is solo queuing, all teammates are "dead" by default
     */
    checkAllDeadOrDisconnected(player: Player) {
        // TODO: potentially replace with allDead?
        if (this.players.length == 1 && this.players[0] == player) {
            return true;
        }

        const filteredPlayers = this.players.filter((p) => p != player);
        if (filteredPlayers.length == 0) {
            // this is necessary since for some dumb reason every() on an empty array returns true????
            return false;
        }
        return filteredPlayers.every((p) => p.dead || p.disconnected);
    }

    /**
     * kills all teammates, only called after last player on team thats not knocked gets knocked
     */
    killAllTeammates() {
        const alivePlayers = this.getAlivePlayers();
        for (const p of alivePlayers) {
            p.kill({
                damageType: GameConfig.DamageType.Bleeding,
                dir: p.dir,
                source: p.downedBy
            });
        }
    }

    checkPlayers(): void {
        if (this.allDeadOrDisconnected) return;
        this.allDeadOrDisconnected = this.players.every((p) => p.dead || p.disconnected);
    }

    /**
     *
     * @param player optional player to exclude
     * @returns random alive player
     */
    randomPlayer(player?: Player) {
        const alivePlayers = player
            ? this.getAliveTeammates(player)
            : this.getAlivePlayers();
        return alivePlayers[util.randomInt(0, alivePlayers.length - 1)];
    }

    /** gets next alive player in the array, loops around if end is reached */
    nextPlayer(currentPlayer: Player) {
        // const alivePlayers = this.getAlivePlayers();
        const alivePlayers = this.getPlayers((p) => !p.dead && !p.disconnected);
        const currentPlayerIndex = alivePlayers.indexOf(currentPlayer);
        const newIndex = (currentPlayerIndex + 1) % alivePlayers.length;
        return alivePlayers[newIndex];
    }

    /** gets previous alive player in the array, loops around if beginning is reached */
    prevPlayer(currentPlayer: Player) {
        // const alivePlayers = this.getAlivePlayers();
        const alivePlayers = this.getPlayers((p) => !p.dead && !p.disconnected);
        const currentPlayerIndex = alivePlayers.indexOf(currentPlayer);
        const newIndex =
            currentPlayerIndex == 0 ? alivePlayers.length - 1 : currentPlayerIndex - 1;
        return alivePlayers[newIndex];
    }

    addGameOverMsg(winningTeamId: number = -1) {
        for (const p of this.players) {
            p.addGameOverMsg(winningTeamId);
            for (const spectator of p.spectators) {
                spectator.addGameOverMsg(winningTeamId);
            }
        }
    }
}
