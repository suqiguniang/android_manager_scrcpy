/**
 * 数据库种子数据脚本
 * 用于初始化数据库或添加测试数据
 * 
 * 运行方式：npm run db:seed
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('🌱 开始种子数据...');

    // 示例：创建测试设备数据
    const testDevices = [
        {
            serial_no: 'TEST_DEVICE_001',
            android_id: 'test_android_001',
            model: 'Xiaomi 13',
            market_name: '小米13',
            version: '14',
            adb_enabled: '1',
            adb_port: '5555',
            iface_ip: '192.168.1.100'
        },
        {
            serial_no: 'TEST_DEVICE_002',
            android_id: 'test_android_002',
            model: 'OPPO Find X6',
            market_name: 'OPPO Find X6 Pro',
            version: '13',
            adb_enabled: '1',
            adb_port: '5555',
            iface_ip: '192.168.1.101'
        }
    ];

    console.log('📱 创建测试设备...');
    for (const device of testDevices) {
        const created = await prisma.device.upsert({
            where: { serial_no: device.serial_no },
            update: device,
            create: device
        });
        console.log(`  ✅ ${created.serial_no} - ${created.model}`);
    }

    console.log('✨ 种子数据完成！');
}

main()
    .catch((e) => {
        console.error('❌ 种子数据失败:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });

