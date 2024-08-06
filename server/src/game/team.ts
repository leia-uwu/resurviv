import type { Player } from "./objects/player";

export class Team {
    players: Player[] = [];
    livingPlayers: Player[] = [];

    constructor(public teamId: number) {}

    addPlayer(player: Player): void {
        player.teamId = this.teamId;
        player.team = this;
        this.players.push(player);
        this.livingPlayers.push(player);
    }

    removePlayer(player: Player): void {
        this.players.splice(this.players.indexOf(player), 1);
        this.livingPlayers.splice(this.livingPlayers.indexOf(player), 1);
    }
}
