
// Known cloud/datacenter IP prefixes that are almost always bots
// These cover AWS, GCP, Azure, DigitalOcean, and other hosting providers
const CLOUD_IP_PREFIXES = [
    // AWS
    '3.', '13.52.', '13.56.', '13.57.', '18.', '34.', '35.', '44.', '52.', '54.',
    // GCP
    '34.', '35.', '104.196.', '104.199.', '130.211.', '146.148.',
    // Azure
    '13.64.', '13.65.', '13.66.', '13.67.', '13.68.', '13.69.', '13.70.', '13.71.', '13.72.', '13.73.', '13.74.', '13.75.', '13.76.', '13.77.', '13.78.', '13.79.', '13.80.', '13.81.', '13.82.', '13.83.', '13.84.', '13.85.', '13.86.', '13.87.', '13.88.', '13.89.', '13.90.', '13.91.', '13.92.', '13.93.', '13.94.', '13.95.',
    '20.', '40.', '51.', '52.',
    // DigitalOcean
    '134.209.', '138.68.', '142.93.', '157.230.', '159.65.', '159.89.', '161.35.', '164.90.', '164.92.', '165.22.', '167.71.', '167.172.', '174.138.',
    // Hetzner
    '5.9.', '88.198.', '136.243.', '138.201.', '144.76.', '148.251.', '159.69.', '168.119.', '195.201.',
    // OVH
    '51.38.', '51.68.', '51.75.', '51.77.', '51.79.', '51.81.', '51.83.', '51.89.', '51.91.', '51.161.', '51.178.', '51.210.', '51.222.',
    // Vultr
    '45.32.', '45.63.', '45.76.', '45.77.', '104.156.', '104.238.', '108.61.', '140.82.', '149.28.', '155.138.', '207.246.', '209.250.',
    // Linode
    '45.33.', '45.56.', '45.79.', '50.116.', '66.228.', '69.164.', '72.14.', '96.126.', '97.107.', '173.230.', '173.255.', '198.58.',
];

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
