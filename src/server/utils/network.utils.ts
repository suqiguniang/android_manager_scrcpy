export const isHomeNetwork = (ip: string): boolean => {
    // Localhost
    if (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1') {
        return true;
    }

    // Handle IPv6 mapped IPv4
    if (ip.startsWith('::ffff:')) {
        ip = ip.substring(7);
    }

    // Check for 192.168.50.x
    return ip.startsWith('192.168.50.');
};
