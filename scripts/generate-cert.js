import { execSync } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const certDir = join(__dirname, '..', 'certs');
const keyPath = join(certDir, 'key.pem');
const certPath = join(certDir, 'cert.pem');

console.log('🔐 检查 SSL 证书...');

// 如果证书已存在，跳过生成
if (existsSync(keyPath) && existsSync(certPath)) {
    console.log('✅ SSL 证书已存在，跳过生成');
    process.exit(0);
}

console.log('📝 生成自签名 SSL 证书...');

// 创建证书目录
if (!existsSync(certDir)) {
    mkdirSync(certDir, { recursive: true });
}

try {
    // 生成自签名证书（有效期 365 天）
    execSync(
        `openssl req -x509 -newkey rsa:2048 -nodes -sha256 -subj '/CN=localhost' ` +
        `-keyout "${keyPath}" -out "${certPath}" -days 365`,
        { stdio: 'inherit' }
    );

    console.log('✅ SSL 证书生成成功！');
    console.log(`   证书位置: ${certPath}`);
    console.log(`   密钥位置: ${keyPath}`);
    console.log('\n⚠️  注意: 这是自签名证书，浏览器会显示警告，请手动信任。');
} catch (error) {
    console.error('❌ 生成证书失败:', error.message);
    console.log('\n💡 提示: 请确保已安装 OpenSSL');
    console.log('   macOS: brew install openssl');
    console.log('   Linux: sudo apt-get install openssl');
    console.log('   Windows: 下载并安装 OpenSSL');
    process.exit(1);
}

