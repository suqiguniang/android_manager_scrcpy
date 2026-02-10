
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Cleaning up all devices from the database...');
    try {
        const deleted = await prisma.device.deleteMany({});
        console.log(`Deleted ${deleted.count} devices.`);
    } catch (e) {
        console.error('Error deleting devices:', e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
