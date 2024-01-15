import { Msg, MsgType, type SurvivBitStream } from "./net";

export class KillMsg extends Msg {
    override readonly msgType = MsgType.Kill;
    itemSourceType = "";
    mapSourceType = "";
    damageType = 0;
    targetId = 0;
    killerId = 0;
    killCreditId = 0;
    killerKills = 0;
    downed = false;
    killed = false;

    deserialize(s: SurvivBitStream) {
        this.damageType = s.readUint8();
        this.itemSourceType = s.readGameType();
        this.mapSourceType = s.readMapType();
        this.targetId = s.readUint16();
        this.killerId = s.readUint16();
        this.killCreditId = s.readUint16();
        this.killerKills = s.readUint8();
        this.downed = s.readBoolean();
        this.killed = s.readBoolean();
        s.readAlignToNextByte();
    }

    serialize(s: SurvivBitStream): void {
        s.writeUint8(this.damageType);
        s.writeGameType(this.itemSourceType);
        s.writeMapType(this.mapSourceType);
        s.writeUint16(this.targetId);
        s.writeUint16(this.killerId);
        s.writeUint16(this.killCreditId);
        s.writeUint8(this.killerKills);
        s.writeBoolean(this.downed);
        s.writeBoolean(this.killed);
        s.writeAlignToNextByte();
    }
}
