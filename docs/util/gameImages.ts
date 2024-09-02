import { readdirSync } from "fs";

export const GameImagePaths: Record<string, string> = {};

export function GenerateGameImagePaths() {
    const imageFiles = readdirSync("../client/public/img/", {
        recursive: true,
        encoding: "utf8"
    });
    for (const entry of imageFiles.filter(
        (e) => e.endsWith(".png") || e.endsWith(".svg")
    )) {
        const fileName = entry.split("/").at(-1) as string;
        GameImagePaths[`${fileName.slice(0, -".___".length)}.img`] = `/img/${entry}`;
    }
    console.log(GameImagePaths);
}
