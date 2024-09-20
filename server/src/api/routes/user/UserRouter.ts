import { zValidator } from "@hono/zod-validator";
import { and, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { deleteCookie } from "hono/cookie";
import { z } from "zod";
import type { Context } from "../..";
import { OutfitDefs } from "../../../../../shared/defs/gameObjects/outfitDefs";
import { UnlockDefs } from "../../../../../shared/defs/gameObjects/unlockDefs";
import { ItemStatus, validateLoadout } from "../../../../../shared/utils/helpers";
import { lucia } from "../../auth/lucia";
import { AuthMiddleware } from "../../auth/middleware";
import { db } from "../../db";
import { itemsTable, usersTable } from "../../db/schema";
import { helpers } from "../../helpers";
import { type Loadout, loadoutSchema, usernameSchema } from "../../zodSchemas";
import { sanitizeSlug } from "./auth/authUtils";

export const UserRouter = new Hono<Context>();

UserRouter.post("/profile", AuthMiddleware, async (c) => {
    try {
        const user = c.get("user")!;
        const result = await db.query.usersTable.findFirst({
            where: eq(usersTable.id, user.id),
        });

        if (!result) {
            return c.json({ err: "" }, 200);
        }

        // TODO: do this in a join
        const items = await db
            .select({
                timeAcquired: itemsTable.timeAcquired,
                type: itemsTable.type,
                source: itemsTable.source,
                status: itemsTable.status,
            })
            .from(itemsTable)
            .where(eq(itemsTable.userId, user.id));

        const {
            loadout,
            slug,
            linkedDiscord,
            linkedGithub,
            linkedTwitch,
            linked,
            username,
            usernameSet,
            lastUsernameChangeTime,
        } = result;

        const timeUntilNextChange =
            helpers.getTimeUntilNextUsernameChange(lastUsernameChangeTime);

        return c.json<ProfileResponse>(
            {
                success: true,
                profile: {
                    slug,
                    linkedDiscord,
                    linkedGithub,
                    linkedTwitch,
                    linked,
                    username,
                    usernameSet,
                    usernameChangeTime: timeUntilNextChange,
                },
                loadout,
                loadoutPriv: "",
                items,
            },
            200,
        );
    } catch (err) {
        console.error("Error fetching user profile:", err);
        return c.json({}, 500);
    }
});

UserRouter.post(
    "/username",
    zValidator("json", usernameSchema, (result, c) => {
        if (!result.success) {
            return c.text<UsernameErrorType>("invalid", 400);
        }
    }),
    AuthMiddleware,
    async (c) => {
        try {
            const user = c.get("user")!;
            const { username } = c.req.valid("json");

            const existingUser = await db.query.usersTable.findFirst({
                where: eq(usersTable.id, user.id),
            })!;

            const timeUntilNextChange = helpers.getTimeUntilNextUsernameChange(
                existingUser!.lastUsernameChangeTime,
            );

            if (timeUntilNextChange > 0) {
                return c.text<UsernameErrorType>("change_time_not_expired", 200);
            }

            const isUsernameTaken = await db.query.usersTable.findFirst({
                where: eq(usersTable.username, username),
            });

            if (isUsernameTaken) {
                return c.text<UsernameErrorType>("taken", 200);
            }

            const now = new Date();

            await db
                .update(usersTable)
                .set({
                    // update the slug as well?
                    username: sanitizeSlug(username),
                    usernameSet: true,
                    lastUsernameChangeTime: now,
                })
                .where(eq(usersTable.id, user.id));

            return c.json<UsernameResponse>({ result: "success" }, 200);
        } catch (err) {
            console.error("Error updating username", { error: err });
            return c.text<UsernameErrorType>("failed");
        }
    },
);

UserRouter.post(
    "/loadout",
    zValidator("json", z.object({ loadout: loadoutSchema }), (result, c) => {
        if (!result.success) {
            return c.json({}, 400);
        }
    }),
    AuthMiddleware,
    async (c) => {
        try {
            const user = c.get("user")!;
            const { loadout } = c.req.valid("json");
            const validatedLoadout = validateLoadout(loadout);

            await db
                .update(usersTable)
                .set({ loadout: validatedLoadout })
                .where(eq(usersTable.id, user.id));

            return c.json<{
                loadout: Loadout;
                loadoutPriv: string;
            }>(
                {
                    loadout: validatedLoadout,
                    loadoutPriv: "",
                },
                200,
            );
        } catch (err) {
            console.error("Error updating loadout", { error: err });
            return c.json({}, 500);
        }
    },
);

UserRouter.post("/logout", AuthMiddleware, async (c) => {
    try {
        const session = c.get("session")!;
        deleteCookie(c, "app-data");
        await lucia.invalidateSession(session.id);
        c.header("Set-Cookie", lucia.createBlankSessionCookie().serialize(), {
            append: true,
        });
        return c.redirect("/login");
    } catch (err) {
        console.error("Error logging out", { error: err });
        return c.json({}, 500);
    }
});

UserRouter.post("/delete", AuthMiddleware, async (c) => {
    try {
        const user = c.get("user")!;
        const session = c.get("session")!;

        // logout out the user
        await lucia.invalidateSession(session.id);
        c.header("Set-Cookie", lucia.createBlankSessionCookie().serialize(), {
            append: true,
        });

        // delete the account
        await db.delete(usersTable).where(eq(usersTable.id, user.id));

        return c.json({}, 200);
    } catch (err) {
        console.error("Error deleting account", { error: err });
        return c.json({}, 500);
    }
});

UserRouter.post(
    "/set_item_status",
    zValidator(
        "json",
        z.object({
            itemTypes: z.array(z.string()),
            status: z.nativeEnum(ItemStatus),
        }),
        (result, c) => {
            if (!result.success) {
                return c.json({}, 400);
            }
        },
    ),
    AuthMiddleware,
    async (c) => {
        try {
            const user = c.get("user")!;
            const { itemTypes, status } = c.req.valid("json");

            const validOutfits = new Set(Object.keys(OutfitDefs));
            const validItemTypes = itemTypes.filter((item) => validOutfits.has(item));

            if (!validItemTypes.length) return c.json({}, 200);

            await db
                .update(itemsTable)
                .set({
                    status,
                })
                .where(
                    and(
                        eq(itemsTable.userId, user.id),
                        inArray(itemsTable.type, validItemTypes),
                    ),
                );

            return c.json({}, 200);
        } catch (err) {
            console.error("Error setting item status", { error: err });
            return c.json({}, 500);
        }
    },
);

// is there a use for this besides unlocking skins on account creation?
// if not delete it.
UserRouter.post(
    "/unlock",
    zValidator(
        "json",
        z.object({
            unlockType: z.string(),
        }),
        (result, c) => {
            if (!result.success) {
                return c.json({}, 400);
            }
        },
    ),
    AuthMiddleware,
    async (c) => {
        try {
            const user = c.get("user")!;
            const { unlockType } = c.req.valid("json");

            if (!(unlockType in UnlockDefs)) {
                return c.json([], 400);
            }

            const outfitsToUnlock = UnlockDefs[unlockType].unlocks;
            const data = outfitsToUnlock.map((outfit) => {
                return {
                    source: unlockType,
                    type: outfit,
                    userId: user.id,
                };
            });

            const items = await db.insert(itemsTable).values(data).returning({
                type: itemsTable.type,
                timeAcquired: itemsTable.timeAcquired,
                source: itemsTable.source,
                status: itemsTable.status,
            });

            return c.json({ success: true, items }, 200);
        } catch (err) {
            console.error("Error unlocking item", { error: err });
            return c.json({}, 500);
        }
    },
);

//
// NOT IMPLEMENTED
//
UserRouter.post("/reset_stats", (c) => {
    return c.json({}, 200);
});

//
// TYPES
//
type ProfileResponse =
    | {
          banned: true;
          reason: string;
      }
    | {
          success: true;
          profile: Pick<
              typeof usersTable.$inferSelect,
              | "slug"
              | "linkedDiscord"
              | "linkedGithub"
              | "linkedTwitch"
              | "username"
              | "usernameSet"
              | "linked"
          > & {
              usernameChangeTime: number;
          };
          loadout: Loadout;
          loadoutPriv: string;
          items: Pick<
              typeof itemsTable.$inferSelect,
              "type" | "status" | "timeAcquired" | "source"
          >[];
      };

type UsernameErrorType = "failed" | "invalid" | "taken" | "change_time_not_expired";

type UsernameResponse = {
    result: "success";
};
