// IPs that are always bots
const KNOWN_BOT_IPS = [
    '::1',       // localhost
    '127.0.0.1', // localhost
];

export function isSuspectedBot(
    ip: string,
    pageCount: number
): boolean {
    // Known bot IPs (localhost etc)
    if (KNOWN_BOT_IPS.includes(ip)) return true;

    // Any single-hit visitor is almost certainly a bot or irrelevant bounce
    // Real humans who spent 0 seconds provide no useful analytics data anyway
    if (pageCount <= 1) return true;

    return false;
}
