import { rmSync } from "fs";

rmSync("guns", { recursive: true });
rmSync("melees", { recursive: true });
