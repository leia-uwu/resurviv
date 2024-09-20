import { GameObjectDefs } from "../../../shared/defs/gameObjectDefs";
import type { UnlockDefs } from "../../../shared/defs/gameObjects/unlockDefs";
import { ItemStatus, type Loadout, validateLoadout } from "../../../shared/utils/helpers";
import { deepEqual } from "../lib/deepEqual";
import type { Item } from "./loadoutMenu";

const loadout = {
    ItemStatus,
    validate: validateLoadout,
    /* not used
    validateWithAvailableItems: function(userLoadout, userItems) {
        const checkTypeExists = function(type, items) {
            if (
                type &&
                items.findIndex((x) => {
                    return x.type == type;
                }) !== -1
            ) {
                return type;
            }
            return "";
        };
        const loadout = {
            crosshair: {},
            emotes: [],
            ...userLoadout
        };
        const itemsToCheck = ["outfit", "melee", "heal", "boost", "player_icon"];

        itemsToCheck.forEach(item => {
            loadout[item] = checkTypeExists(loadout[item], userItems);
        });

        loadout.crosshair.type = checkTypeExists(loadout.crosshair.type, userItems);

        loadout.emotes = loadout.emotes.map(emote => checkTypeExists(loadout.emotes[emote], userItems));

        return loadout.validate(loadout);
    },
    */
    defaultLoadout: function () {
        return loadout.validate({} as Loadout);
    },
    modified: function (a: Loadout, b: Loadout) {
        return !deepEqual(a, b);
    },
    getUserAvailableItems: function (heroItems: Item[] = []) {
        const processedItemTypes = new Set<string>();
        const items: Item[] = [];
        // Add default items
        const unlockDefaultDef =
            GameObjectDefs.unlock_default as unknown as (typeof UnlockDefs)["unlock_default"];
        for (let i = 0; i < unlockDefaultDef.unlocks.length; i++) {
            const unlock = unlockDefaultDef.unlocks[i];
            processedItemTypes.add(unlock);
            items.push({
                type: unlock,
                source: "unlock_default",
                timeAcquired: 0,
                ackd: loadout.ItemStatus.Ackd,
            });
        }
        for (let i = 0; i < heroItems.length; i++) {
            if (processedItemTypes.has(heroItems[i].type)) {
                continue;
            }
            items.push(heroItems[i]);
        }
        return items;
    },
};
export default loadout;
