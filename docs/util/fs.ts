import { mkdir } from "fs/promises";

export async function tryMkdir(path: string) {
    try {
        await mkdir(path);
    } catch {}
}
