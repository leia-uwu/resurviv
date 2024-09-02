import GenerateGunPages from "./generators/guns";
import GenerateMeleePages from "./generators/melees";
import { tryMkdir } from "./util/fs";
import { GenerateGameImagePaths } from "./util/gameImages";

GenerateGameImagePaths();

tryMkdir("guns");
GenerateGunPages();

tryMkdir("melees");
GenerateMeleePages();
