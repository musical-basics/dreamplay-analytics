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

    // We removed the pageCount <= 1 check!
    // Real humans bounce from Facebook/Instagram ads all the time.
    // Now that we track exact time on page, we want to see those people!

    return false;
}
