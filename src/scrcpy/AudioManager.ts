import { ScrcpyAudioCodec } from "@yume-chan/scrcpy";
import type { ScrcpyMediaStreamPacket } from "@yume-chan/scrcpy";
import { Int16PcmPlayer, Float32PcmPlayer, Float32PlanerPcmPlayer } from "@yume-chan/pcm-player";
import { AacDecodeStream, OpusDecodeStream } from "./audio-decode-stream";
import { WritableStream, ReadableStream } from "@yume-chan/stream-extra";

// 可读流类型
type AudioStream = ReadableStream<ScrcpyMediaStreamPacket>;

// 类型别名
type PcmPlayer = Int16PcmPlayer | Float32PcmPlayer | Float32PlanerPcmPlayer;
type PlayerRef = { current: PcmPlayer | null };
type MutedRef = { current: boolean };

// 音频常量
const AUDIO_CONFIG = {
    SAMPLE_RATE: 48000,
    CHANNELS: 2,
} as const;

// 音频播放器适配器接口
interface AudioPlayerAdapter {
    player: PcmPlayer | null;
    createPlayer(): void;
    destroyPlayer(): void;
    processStream(stream: AudioStream, playerRef: PlayerRef, isMutedRef: MutedRef): void;
}

// 抽象基类 - 提取公共逻辑
abstract class BaseAudioAdapter implements AudioPlayerAdapter {
    player: PcmPlayer | null = null;

    abstract createPlayerInstance(): PcmPlayer;
    abstract getName(): string;

    createPlayer(): void {
        this.player = this.createPlayerInstance();
        this.player.start();
    }

    destroyPlayer(): void {
        if (this.player) {
            try {
                this.player.stop();
            } catch (err) {
                console.warn(`停止 ${this.getName()} 音频播放器出错:`, err);
            }
            this.player = null;
        }
    }

    abstract processStream(stream: AudioStream, playerRef: PlayerRef, isMutedRef: MutedRef): void;

    // 统一的错误处理
    protected handleStreamError(err: unknown): void {
        const error = err as Error;
        if (error.name !== 'AbortError') {
            console.error(`${this.getName()} 音频流错误:`, err);
        }
    }
}

// Raw 音频适配器
class RawAudioAdapter extends BaseAudioAdapter {
    getName(): string {
        return 'Raw';
    }

    createPlayerInstance(): PcmPlayer {
        return new Int16PcmPlayer(AUDIO_CONFIG.SAMPLE_RATE, AUDIO_CONFIG.CHANNELS);
    }

    processStream(stream: AudioStream, playerRef: PlayerRef, isMutedRef: MutedRef): void {
        stream.pipeTo(
            new WritableStream<ScrcpyMediaStreamPacket>({
                write: (chunk: ScrcpyMediaStreamPacket) => {
                    // 始终消费流，但只在播放器存在且未静音时 feed
                    if (playerRef.current && !isMutedRef.current) {
                        (playerRef.current as Int16PcmPlayer).feed(
                            new Int16Array(
                                chunk.data.buffer,
                                chunk.data.byteOffset,
                                chunk.data.byteLength / Int16Array.BYTES_PER_ELEMENT
                            )
                        );
                    }
                },
            })
        ).catch((err: unknown) => this.handleStreamError(err));
    }
}

// Opus 音频适配器
class OpusAudioAdapter extends BaseAudioAdapter {
    private webCodecId: string;

    constructor(webCodecId: string) {
        super();
        this.webCodecId = webCodecId;
    }

    getName(): string {
        return 'Opus';
    }

    createPlayerInstance(): PcmPlayer {
        return new Float32PcmPlayer(AUDIO_CONFIG.SAMPLE_RATE, AUDIO_CONFIG.CHANNELS);
    }

    processStream(stream: AudioStream, playerRef: PlayerRef, isMutedRef: MutedRef): void {
        stream
            .pipeThrough(
                new OpusDecodeStream({
                    codec: this.webCodecId,
                    numberOfChannels: AUDIO_CONFIG.CHANNELS,
                    sampleRate: AUDIO_CONFIG.SAMPLE_RATE,
                })
            )
            .pipeTo(
                new WritableStream<Float32Array>({
                    write: (chunk: Float32Array) => {
                        // 始终消费流，但只在播放器存在且未静音时 feed
                        if (playerRef.current && !isMutedRef.current) {
                            (playerRef.current as Float32PcmPlayer).feed(chunk);
                        }
                    },
                })
            )
            .catch((err: unknown) => this.handleStreamError(err));
    }
}

// AAC 音频适配器
class AacAudioAdapter extends BaseAudioAdapter {
    private webCodecId: string;

    constructor(webCodecId: string) {
        super();
        this.webCodecId = webCodecId;
    }

    getName(): string {
        return 'AAC';
    }

    createPlayerInstance(): PcmPlayer {
        return new Float32PlanerPcmPlayer(AUDIO_CONFIG.SAMPLE_RATE, AUDIO_CONFIG.CHANNELS);
    }

    processStream(stream: AudioStream, playerRef: PlayerRef, isMutedRef: MutedRef): void {
        stream
            .pipeThrough(
                new AacDecodeStream({
                    codec: this.webCodecId,
                    numberOfChannels: AUDIO_CONFIG.CHANNELS,
                    sampleRate: AUDIO_CONFIG.SAMPLE_RATE,
                })
            )
            .pipeTo(
                new WritableStream<Float32Array[]>({
                    write: (chunk: Float32Array[]) => {
                        // 始终消费流，但只在播放器存在且未静音时 feed
                        if (playerRef.current && !isMutedRef.current) {
                            (playerRef.current as Float32PlanerPcmPlayer).feed(chunk);
                        }
                    },
                })
            )
            .catch((err: unknown) => this.handleStreamError(err));
    }
}

/**
 * 音频适配器工厂
 * 使用工厂模式创建不同类型的音频适配器
 */
class AudioAdapterFactory {
    static create(codec: ScrcpyAudioCodec, webCodecId: string): AudioPlayerAdapter {
        // 使用 switch 语句替代计算属性，避免类型问题
        switch (codec) {
            case ScrcpyAudioCodec.Raw:
                return new RawAudioAdapter();
            case ScrcpyAudioCodec.Opus:
                return new OpusAudioAdapter(webCodecId);
            case ScrcpyAudioCodec.Aac:
                return new AacAudioAdapter(webCodecId);
            default:
                throw new Error(`不支持的音频编解码器: ${codec}`);
        }
    }
}

/**
 * 音频管理器
 * 负责管理音频播放器的生命周期和流处理
 * 
 * 使用方式:
 * 1. 创建实例: new AudioManager(isMutedRef)
 * 2. 初始化: audioManager.initialize(codec, webCodecId, stream)
 * 3. 控制播放: audioManager.start() / audioManager.stop()
 * 4. 清理资源: audioManager.cleanup()
 */
export class AudioManager {
    private adapter: AudioPlayerAdapter | null = null;
    private playerRef: PlayerRef;
    private isMutedRef: MutedRef;

    constructor(isMutedRef: MutedRef) {
        this.isMutedRef = isMutedRef;
        this.playerRef = { current: null };
    }

    /**
     * 初始化音频适配器并开始处理流
     * @param codec 音频编解码器类型
     * @param webCodecId WebCodec ID
     * @param stream 音频流
     */
    initialize(codec: ScrcpyAudioCodec, webCodecId: string, stream: AudioStream): void {
        this.adapter = AudioAdapterFactory.create(codec, webCodecId);
        // 开始处理流（始终消费流，避免流阻塞）
        this.adapter.processStream(stream, this.playerRef, this.isMutedRef);
    }

    /**
     * 启动音频播放（创建播放器）
     * 由用户交互触发，符合浏览器自动播放策略
     */
    start(): void {
        if (this.adapter && !this.playerRef.current) {
            this.adapter.createPlayer();
            this.playerRef.current = this.adapter.player;
        }
    }

    /**
     * 停止音频播放（销毁播放器，但不停止流消费）
     * 流继续被消费，避免 WebSocket 流错误
     */
    stop(): void {
        if (this.adapter && this.playerRef.current) {
            this.adapter.destroyPlayer();
            this.playerRef.current = null;
        }
    }

    /**
     * 清理所有资源
     * 在组件卸载时调用
     */
    cleanup(): void {
        if (this.adapter) {
            this.adapter.destroyPlayer();
            this.adapter = null;
        }
        this.playerRef.current = null;
    }

    /**
     * 检查是否已初始化
     */
    isInitialized(): boolean {
        return this.adapter !== null;
    }
}

