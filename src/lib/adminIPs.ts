// Add your IP here whenever your ISP refreshes it
export const ADMIN_IPS = [
    '71.38.79.10',
    '71.38.82.163',
    '71.38.85.238',
    '174.234.75.214',
];

export function isAdminIP(ip: string): boolean {
    // Direct match
    if (ADMIN_IPS.includes(ip)) return true;
    // Also match IPv4-mapped IPv6 (e.g. ::ffff:71.38.79.10)
    const stripped = ip.replace(/^::ffff:/i, '');
    if (stripped !== ip && ADMIN_IPS.includes(stripped)) return true;
    // Check if the raw IP is an IPv4-mapped version of an admin IP
    return ADMIN_IPS.some(adminIp => ip === `::ffff:${adminIp}`);
}
