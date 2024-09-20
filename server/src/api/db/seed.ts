import { db } from ".";
import { usersTable } from "./schema";

const seed = async () => {
    try {
        console.log("Seeding database");

        await db.insert(usersTable).values([]);
    } catch (error) {
        console.error(error);
        throw new Error("Failed to seed database");
    }
};

seed();
