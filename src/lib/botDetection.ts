// IPs that are always bots
const KNOWN_BOT_IPS = [
    '::1',       // localhost
    '127.0.0.1', // localhost
    '126.73.147.149', // bot: 20 visits to same crowdfund page
];

// Known cloud provider / datacenter IP prefixes
// These are server IPs, not real users browsing from home
const CLOUD_PROVIDER_PREFIXES = [
    // Google (Googlebot crawler)
    '66.249.',    // Googlebot primary range
    '64.233.',    // Google
    '72.14.',     // Google
    '209.85.',    // Google
    '216.239.',   // Google

    // DigitalOcean ranges (most common bot source)
    '137.184.',   // DigitalOcean
    '146.190.',   // DigitalOcean
    '161.35.',    // DigitalOcean
    '143.198.',   // DigitalOcean
    '144.126.',   // DigitalOcean
    '147.182.',   // DigitalOcean
    '209.38.',    // DigitalOcean
    '64.23.',     // DigitalOcean
    '24.199.',    // DigitalOcean
    '159.89.',    // DigitalOcean
    '159.65.',    // DigitalOcean
    '165.227.',   // DigitalOcean
    '165.232.',   // DigitalOcean
    '167.71.',    // DigitalOcean
    '167.172.',   // DigitalOcean
    '134.209.',   // DigitalOcean
    '142.93.',    // DigitalOcean
    '138.68.',    // DigitalOcean
    '104.131.',   // DigitalOcean
    '162.243.',   // DigitalOcean
    '45.55.',     // DigitalOcean
    '68.183.',    // DigitalOcean
    '157.245.',   // DigitalOcean
    '174.138.',   // DigitalOcean
    '206.189.',   // DigitalOcean

    // Hetzner
    '65.108.',    // Hetzner
    '65.109.',    // Hetzner
    '95.216.',    // Hetzner
    '135.181.',   // Hetzner
    '5.161.',     // Hetzner

    // OVH
    '51.178.',    // OVH
    '51.38.',     // OVH
    '51.79.',     // OVH

    // Linode / Akamai
    '172.104.',   // Linode
    '172.105.',   // Linode
    '139.162.',   // Linode

    // Vultr
    '45.76.',     // Vultr
    '45.77.',     // Vultr
    '108.61.',    // Vultr
    '149.28.',    // Vultr
    '207.148.',   // Vultr
];

export function isSuspectedBot(
    ip: string,
    pageCount: number // eslint-disable-line @typescript-eslint/no-unused-vars
): boolean {
    // Known bot IPs (localhost etc)
    if (KNOWN_BOT_IPS.includes(ip)) return true;

    // Check if IP belongs to a known cloud provider / datacenter
    if (CLOUD_PROVIDER_PREFIXES.some(prefix => ip.startsWith(prefix))) return true;

    return false;
}
