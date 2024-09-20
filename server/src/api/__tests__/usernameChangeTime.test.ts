import { expect, test, describe } from "bun:test";
import { cooldownPeriod, dayInMs, helpers } from "../helpers";

const { getTimeUntilNextUsernameChange } = helpers;

describe("getTimeUntilNextUsernameChange", () => {
    test("should return 0 when lastUsernameChange is null", () => {
        expect(getTimeUntilNextUsernameChange(null)).toBe(0);
    });

    test("should return correct time until next change based on lastUsernameChange`", () => {
        const now = new Date();

        // When lastUsernameChange is current time
        expect(getTimeUntilNextUsernameChange(now)).toEqual(cooldownPeriod);

        // When lastUsernameChange is 5 days ago
        const fiveDaysAgo = new Date(Date.now() - 5 * dayInMs);
        const expectedTimeRemaining = cooldownPeriod - 5 * dayInMs;
        expect(getTimeUntilNextUsernameChange(fiveDaysAgo)).toBeCloseTo(
            expectedTimeRemaining,
            -3,
        );

        // When cooldown period has just ended
        const cooldownJustEnded = new Date(Date.now() - cooldownPeriod);
        expect(getTimeUntilNextUsernameChange(cooldownJustEnded)).toEqual(0);
    });

    test("should return negative value when cooldown period has passed", () => {
        const afterCooldown = new Date(Date.now() - (cooldownPeriod + dayInMs));
        const result = getTimeUntilNextUsernameChange(afterCooldown);
        expect(result).toBeLessThan(0);
        expect(result).toBeCloseTo(-dayInMs, -3);
    });
});
