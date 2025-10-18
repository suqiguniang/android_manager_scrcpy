/**
 * 移动设备检测工具
 */

/**
 * 检测是否为移动设备
 * 结合 User-Agent 和屏幕尺寸判断
 */
export function isMobileDevice(): boolean {
    // 方法1: 检测 User-Agent
    const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
    const mobileRegex = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini|mobile/i;
    const isMobileUA = mobileRegex.test(userAgent.toLowerCase());
    
    // 方法2: 检测触摸支持
    const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    
    // 方法3: 检测屏幕宽度 (小于 768px 认为是移动设备)
    const isSmallScreen = window.innerWidth < 768;
    
    // 综合判断：UA 匹配移动设备 或 (有触摸 + 小屏幕)
    return isMobileUA || (hasTouch && isSmallScreen);
}

/**
 * 检测是否为平板设备
 */
export function isTablet(): boolean {
    const userAgent = navigator.userAgent.toLowerCase();
    const isTabletUA = /ipad|android(?!.*mobile)|tablet/i.test(userAgent);
    const isMediumScreen = window.innerWidth >= 768 && window.innerWidth < 1024;
    
    return isTabletUA || (isMediumScreen && 'ontouchstart' in window);
}

/**
 * 检测是否为桌面设备
 */
export function isDesktop(): boolean {
    return !isMobileDevice() && !isTablet();
}

/**
 * 获取设备类型
 */
export type DeviceType = 'mobile' | 'tablet' | 'desktop';

export function getDeviceType(): DeviceType {
    if (isMobileDevice()) return 'mobile';
    if (isTablet()) return 'tablet';
    return 'desktop';
}

/**
 * 检测具体操作系统
 */
export function getOS(): 'ios' | 'android' | 'windows' | 'macos' | 'linux' | 'unknown' {
    const userAgent = navigator.userAgent.toLowerCase();
    
    if (/iphone|ipad|ipod/.test(userAgent)) return 'ios';
    if (/android/.test(userAgent)) return 'android';
    if (/win/.test(userAgent)) return 'windows';
    if (/mac/.test(userAgent)) return 'macos';
    if (/linux/.test(userAgent)) return 'linux';
    
    return 'unknown';
}

/**
 * 响应式监听设备类型变化
 * 当窗口大小改变时，可能从桌面变为移动端（或反之）
 */
export function watchDeviceType(callback: (deviceType: DeviceType) => void): () => void {
    let currentType = getDeviceType();
    
    const handleResize = () => {
        const newType = getDeviceType();
        if (newType !== currentType) {
            currentType = newType;
            callback(newType);
        }
    };
    
    window.addEventListener('resize', handleResize);
    
    // 返回清理函数
    return () => window.removeEventListener('resize', handleResize);
}

