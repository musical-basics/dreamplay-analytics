// Add your IP here whenever your ISP refreshes it
export const ADMIN_IPS = [
    '71.38.79.10',
    '71.38.82.163',
];

export function isAdminIP(ip: string): boolean {
    return ADMIN_IPS.includes(ip);
}
