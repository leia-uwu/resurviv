export const dayInMs = 24 * 60 * 60 * 1000;
export const cooldownPeriod = 10 * dayInMs;

export const helpers = {
    getTimeUntilNextUsernameChange: (lastChangeTime: Date | null) => {
        if (!(lastChangeTime instanceof Date)) return 0;

        const currentTime = Date.now();
        const timeSinceLastChange = currentTime - new Date(lastChangeTime).getTime();
        return cooldownPeriod - timeSinceLastChange;
    },
};
