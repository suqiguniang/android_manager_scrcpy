/**
 * JSON 工具函数
 * 处理特殊类型的序列化
 * 
 * 使用方式：
 * import './utils/json.utils.js'; // 自动扩展 JSON 对象
 * JSON.safeStringify(data);
 * JSON.safeParse<T>(text);
 */

/**
 * BigInt 替换函数
 * 用于 JSON.stringify 的 replacer 参数
 */
const bigIntReplacer = (_key: string, value: unknown): unknown => {
    return typeof value === "bigint" ? value.toString() : value;
};

/**
 * 安全序列化对象（支持 BigInt）
 * @param data 要序列化的数据
 * @param space 可选的格式化空格数
 * @returns JSON 字符串
 */
function safeStringify(data: unknown, space?: number): string {
    return JSON.stringify(data, bigIntReplacer, space);
}

/**
 * 安全解析 JSON 字符串
 * @param text JSON 字符串
 * @returns 解析后的对象
 */
function safeParse<T = unknown>(text: string): T {
    try {
        return JSON.parse(text);
    } catch (error) {
        throw new Error(`Failed to parse JSON: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

// 扩展全局 JSON 接口
declare global {
    interface JSON {
        /**
         * 安全序列化对象（支持 BigInt）
         * @param data 要序列化的数据
         * @param space 可选的格式化空格数
         * @returns JSON 字符串
         */
        safeStringify(data: unknown, space?: number): string;
        
        /**
         * 安全解析 JSON 字符串（带类型推断和错误处理）
         * @param text JSON 字符串
         * @returns 解析后的对象
         */
        safeParse<T = unknown>(text: string): T;
    }
}

// 将方法添加到 JSON 对象
if (!JSON.safeStringify) {
    JSON.safeStringify = safeStringify;
}

if (!JSON.safeParse) {
    JSON.safeParse = safeParse;
}


