import $ from "jquery";
import { CrosshairDefs } from "../../shared/defs/gameObjects/crosshairDefs";
import type { Crosshair } from "../../shared/utils/helpers";
import { util } from "../../shared/utils/util";

function getCrosshairDims(crosshairDef: Crosshair) {
    const crosshairBase = {
        width: 64,
        height: 64,
    };
    return {
        width: Math.round((crosshairBase.width * Number(crosshairDef.size)) / 4) * 4,
        height: Math.round((crosshairBase.height * Number(crosshairDef.size)) / 4) * 4,
    };
}
function getBaseURL(crosshairDef: Crosshair) {
    const objDef = CrosshairDefs[crosshairDef.type];
    const dims = getCrosshairDims(crosshairDef);
    const color = util.rgbToHex(util.intToRgb(crosshairDef.color));
    const strokeWidth = crosshairDef.stroke;
    let svgCode = objDef.code.replace(/white/g, color);
    svgCode = svgCode.replace(/stroke-width=".5"/g, `stroke-width="${strokeWidth}"`);
    svgCode = svgCode.replace(/width="64"/g, `width="${dims.width}"`);
    svgCode = svgCode.replace(/height="64"/g, `height="${dims.height}"`);
    return `url('data:image/svg+xml;utf8,${(svgCode = svgCode.replace(/#/g, "%23"))}')`;
}
function getCursorCSS(crosshairDef: Crosshair) {
    const dims = getCrosshairDims(crosshairDef);
    return `${getBaseURL(crosshairDef)} ${dims.width / 2} ${dims.height / 2}, crosshair`;
}

export const crosshair = {
    getCursorURL: function (crosshairDef: Crosshair) {
        return getBaseURL(crosshairDef);
    },
    setElemCrosshair: function (elem: JQuery<HTMLElement>, crosshairDef: Crosshair) {
        let cursor = "crosshair";
        const objDef = CrosshairDefs[crosshairDef.type];
        if (objDef) {
            cursor = objDef.cursor ? objDef.cursor : getCursorCSS(crosshairDef);
        }
        elem.css({
            cursor,
        });
    },
    setGameCrosshair: function (crosshairDef: Crosshair) {
        // Set game pointer
        crosshair.setElemCrosshair($("#game-area-wrapper"), crosshairDef);

        // Adjust UI elements to use the custom crosshair as well
        const objDef = CrosshairDefs[crosshairDef.type];
        const style = !objDef || objDef.cursor ? "pointer" : "inherit";
        $(".ui-zoom, .ui-medical, .ui-settings-button, .ui-weapon-switch").css({
            cursor: style,
        });
    },
};
