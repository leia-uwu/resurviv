import { writeFileSync } from "node:fs";
import { GunDefs } from "../../shared/defs/gameObjects/gunDefs";
import generateListPage from "./listPage";
import generatePropertyTable from "./propertyTable";

export default function GenerateGunPages() {
    for (const [type, def] of Object.entries(GunDefs)) {
        writeFileSync(
            `guns/${type}.md`,
            `---
layout: layout.njk
title: ${def.name}
---

${generatePropertyTable(def)}
`,
        );
    }

    writeFileSync(
        "guns/index.md",
        `---
layout: layout.njk
title: Guns
---

${generateListPage("/guns/", GunDefs, "name")}
`,
    );
}
