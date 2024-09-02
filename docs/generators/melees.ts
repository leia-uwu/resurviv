import { writeFileSync } from "fs";
import { MeleeDefs } from "../../shared/defs/gameObjects/meleeDefs";
import generateListPage from "./listPage";
import generatePropertyTable from "./propertyTable";

export default function GenerateMeleePages() {
    for (const [type, def] of Object.entries(MeleeDefs)) {
        writeFileSync(
            `melees/${type}.md`,
            `---
layout: layout.njk
title: ${def.name}
---

${generatePropertyTable(def)}
`,
        );
    }

    writeFileSync(
        "melees/index.md",
        `---
layout: layout.njk
title: Melees
---

${generateListPage("/melees/", MeleeDefs, "name")}
`,
    );
}
