import { v2 } from "../utils/v2";
import { Msg, MsgType, NetConstants, type SurvivBitStream } from "./net";

export class InputMsg extends Msg {
    override readonly msgType = MsgType.Input;

    seq = 0;
    moveLeft = false;
    moveRight = false;
    moveUp = false;
    moveDown = false;
    shootStart = false;
    shootHold = false;
    portrait = false;
    touchMoveActive = false;
    touchMoveDir = v2.create(1, 0);
    touchMoveLen = 255;
    toMouseDir = v2.create(1, 0);
    toMouseLen = 0;
    inputs: number[] = [];
    useItem = "";

    addInput(input: number) {
        this.inputs.length < 7 && !this.inputs.includes(input) && this.inputs.push(input);
    }

    serialize(s: SurvivBitStream) {
        s.writeUint8(this.seq);
        s.writeBoolean(this.moveLeft);
        s.writeBoolean(this.moveRight);
        s.writeBoolean(this.moveUp);
        s.writeBoolean(this.moveDown);

        s.writeBoolean(this.shootStart);
        s.writeBoolean(this.shootHold);

        s.writeBoolean(this.portrait);
        s.writeBoolean(this.touchMoveActive);
        if (this.touchMoveActive) {
            s.writeUnitVec(this.touchMoveDir, 8);
            s.writeUint8(this.touchMoveLen);
        }
        s.writeUnitVec(this.toMouseDir, 10);
        s.writeFloat(this.toMouseLen, 0, NetConstants.MouseMaxDist, 8);
        s.writeBits(this.inputs.length, 4);
        for (let i = 0; i < this.inputs.length; i++) s.writeUint8(this.inputs[i]);

        s.writeGameType(this.useItem);

        s.writeBits(0, 6);
    }

    deserialize(s: SurvivBitStream): void {
        this.seq = s.readUint8();
        this.moveLeft = s.readBoolean();
        this.moveRight = s.readBoolean();
        this.moveUp = s.readBoolean();
        this.moveDown = s.readBoolean();

        this.shootStart = s.readBoolean();
        this.shootHold = s.readBoolean();

        this.portrait = s.readBoolean();
        this.touchMoveActive = s.readBoolean();
        if (this.touchMoveActive) {
            this.touchMoveDir = s.readUnitVec(8);
            this.touchMoveLen = s.readUint8();
        }
        this.toMouseDir = s.readUnitVec(10);
        this.toMouseLen = s.readFloat(0, NetConstants.MouseMaxDist, 8);

        const length = s.readBits(4);
        for (let i = 0; i < length; i++) this.inputs.push(s.readUint8());

        this.useItem = s.readGameType();

        s.readBits(6);
    }
}
