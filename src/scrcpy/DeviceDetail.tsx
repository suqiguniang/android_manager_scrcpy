import {WebSocketTransport} from "@/server/transport/websocket-transport";
import {Adb, AdbBanner} from "@yume-chan/adb";
import {
    AndroidKeyCode,
    AndroidKeyEventAction,
    DefaultServerPath,
    ScrcpyVideoCodecId
} from "@yume-chan/scrcpy";
import type {ScrcpyControlMessageWriter} from "@yume-chan/scrcpy";
import {AdbScrcpyClient, AdbScrcpyOptions3_3_3} from "@yume-chan/adb-scrcpy";
import {WritableStream} from "@yume-chan/stream-extra";
import {AudioManager} from "./AudioManager";
import {
    BitmapVideoFrameRenderer,
    InsertableStreamVideoFrameRenderer,
    type VideoFrameRenderer,
    WebCodecsVideoDecoder,
    WebGLVideoFrameRenderer
} from "@yume-chan/scrcpy-decoder-webcodecs";
import {useEffect, useRef, useState} from "react";
import {useParams, useNavigate} from 'react-router-dom';
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '../components/ui/card';
import {Spinner} from '../components/ui/spinner';
import {Button} from '../components/ui/button';
import {AlertCircle, ArrowLeft, Home, ChevronLeft, Square, Power, Volume2, VolumeOff, RectangleVertical} from 'lucide-react';
import {TouchControl} from './TouchControl';
import {KeyboardControl} from './KeyboardControl';
import type {DeviceResponse, DeviceInfo} from '../types/device.types';
import {isMobileDevice} from '../lib/device-detect';


function createVideoFrameRenderer(): {
    renderer: VideoFrameRenderer;
    element: HTMLVideoElement | HTMLCanvasElement;
} {
    if (InsertableStreamVideoFrameRenderer.isSupported) {
        const renderer = new InsertableStreamVideoFrameRenderer();
        return {renderer, element: renderer.element};
    }

    if (WebGLVideoFrameRenderer.isSupported) {
        const renderer = new WebGLVideoFrameRenderer();
        return {renderer, element: renderer.canvas as HTMLCanvasElement};
    }

    const renderer = new BitmapVideoFrameRenderer();
    return {renderer, element: renderer.canvas as HTMLCanvasElement};
}

export default function DeviceDetail() {
    const {serial} = useParams<{ serial: string }>();
    const navigate = useNavigate();

    const wrapperRef = useRef<HTMLDivElement | null>(null);
    const cleanupRef = useRef<(() => void) | null>(null);
    const controllerRef = useRef<ScrcpyControlMessageWriter | null>(null);
    const scrcpyClientRef = useRef<AdbScrcpyClient<AdbScrcpyOptions3_3_3<boolean>>>(null);
    const isMutedRef = useRef<boolean>(true); // 使用 ref 保存最新的静音状态，避免闭包问题
    const audioManagerRef = useRef<AudioManager | null>(null); // 音频管理器

    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string>();
    const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);
    const [screenSize, setScreenSize] = useState<{ width: number; height: number }>(); // 物理尺寸（固定，竖屏尺寸）
    const [videoSize, setVideoSize] = useState<{ width: number; height: number }>(); // 视频尺寸（随旋转变化）
    const [isLandscape, setIsLandscape] = useState(false); // 是否为横屏
    const [isVideoLoaded, setIsVideoLoaded] = useState(false);
    const [isMuted, setIsMuted] = useState(true); // 默认静音，等待用户手动激活
    const [audioAvailable, setAudioAvailable] = useState(true); // 音频是否可用
    const [audioError, setAudioError] = useState(false); // 音频是否出错
    const [isMobile, setIsMobile] = useState(false); // 是否为移动设备

    // 按键处理函数
    const handleKeyPress = (keyCode: AndroidKeyCode) => {
        if (!controllerRef.current) {
            console.warn('控制器未初始化');
            return;
        }

        try {
            // 按下按键
            controllerRef.current.injectKeyCode({
                action: AndroidKeyEventAction.Down,
                keyCode: keyCode,
                repeat: 0,
                metaState: 0,
            });

            // 释放按键
            controllerRef.current.injectKeyCode({
                action: AndroidKeyEventAction.Up,
                keyCode: keyCode,
                repeat: 0,
                metaState: 0,
            });
        } catch (error) {
            console.error('发送按键失败:', error);
        }
    };

    useEffect(() => {
        // 检测是否为移动设备
        setIsMobile(isMobileDevice());

        // 捕获当前 ref 值，用于清理函数（避免闭包问题）
        const wrapper = wrapperRef.current;

        if (!serial) {
            setError('缺少设备序列号');
            setIsLoading(false);
            return;
        }


        const initializeDevice = async () => {
            try {
                const response = await fetch(`${window.location.protocol}//${window.location.hostname}:8080/device/${serial}`);
                if (!response.ok) {
                    throw new Error(`获取设备信息失败: ${response.status}`);
                }

                const data: DeviceResponse = await response.json();
                setDeviceInfo(data.info);

                console.log(`设备信息:`, data);
                if (data.info.screen_width && data.info.screen_height) {
                    // 保存物理尺寸（总是竖屏尺寸，用于显示占位）
                    const physicalWidth = Math.min(data.info.screen_width, data.info.screen_height);
                    const physicalHeight = Math.max(data.info.screen_width, data.info.screen_height);
                    setScreenSize({
                        width: physicalWidth,
                        height: physicalHeight
                    });
                }
                setIsLoading(false);

                const transport = new WebSocketTransport(
                    serial,
                    data.maxPayloadSize,
                    new AdbBanner(data.product, data.model, data.device, data.features),
                );

                const adb = new Adb(transport);

                const scrcpy = await AdbScrcpyClient.start(
                    adb,
                    DefaultServerPath,
                    new AdbScrcpyOptions3_3_3({
                        videoBitRate: 8388608,
                        displayId: 0,
                        maxFps: 60,
                        videoSource: "display",
                        videoCodec: "h264",
                        audio: true,
                        // audioCodec: "opus",
                        // audioBitRate: 128000,
                        control: true,
                        tunnelForward: true,
                        stayAwake: true,
                        powerOffOnClose: false,
                        powerOn: false,
                        clipboardAutosync: true,
                        sendDeviceMeta: true,
                        cleanup: true
                    }),
                );

                // 保存 scrcpy 客户端和控制器引用
                scrcpyClientRef.current = scrcpy;
                if (scrcpy.controller) {
                    controllerRef.current = scrcpy.controller;
                }

                // 初始化音频流
                const initAudioStream = async () => {
                    try {
                        const audioStreamPromise = scrcpy.audioStream;
                        if (!audioStreamPromise) {
                            console.warn(`设备不支持音频流`);
                            setAudioAvailable(false);
                            return;
                        }

                        const metadata = await audioStreamPromise;
                        if (metadata.type === 'disabled' || metadata.type === 'errored') {
                            console.warn(`音频不可用:`, metadata.type);
                            setAudioAvailable(false);
                            if (metadata.type === 'errored') {
                                setAudioError(true);
                            }
                            return;
                        }

                        console.log(`音频编解码器:`, metadata.codec);

                        // 创建音频管理器并初始化
                        const audioManager = new AudioManager(isMutedRef);
                        audioManager.initialize(metadata.codec, metadata.codec.webCodecId, metadata.stream);
                        audioManagerRef.current = audioManager;

                        setAudioAvailable(true);
                        setAudioError(false);
                    } catch (error: unknown) {
                        const err = error as Error;
                        console.warn(`音频初始化失败（不影响视频）:`, err.message || error);
                        setAudioAvailable(false);
                        setAudioError(true);
                    }
                };

                // 启动音频初始化（不等待完成）
                void initAudioStream();

                const stream = scrcpy.videoStream!;
                stream.then(async ({stream}) => {
                    const {renderer, element} = createVideoFrameRenderer();

                    if (wrapperRef.current) {
                        // 清空之前的内容（热加载时）
                        wrapperRef.current.innerHTML = '';

                        element.style.display = 'block';
                        element.style.width = '100%';
                        element.style.height = '100%';
                        element.style.objectFit = 'contain';
                        wrapperRef.current.appendChild(element);
                    }

                    const decoder = new WebCodecsVideoDecoder({
                        codec: ScrcpyVideoCodecId.H264,
                        renderer: renderer,
                    });
                    setIsVideoLoaded(true);

                    // 在 sizeChanged 中更新视频尺寸和屏幕方向
                    decoder.sizeChanged(({width, height}) => {
                        // 更新视频尺寸（用于触摸坐标转换和显示）
                        setVideoSize({width, height});

                        // 更新屏幕方向状态
                        const landscape = width > height;
                        setIsLandscape(landscape);
                    });

                    stream
                        .pipeTo(decoder.writable)
                        .catch(error => {
                            // 忽略组件卸载时的常见错误
                            if (error.name !== 'AbortError' &&
                                !error.message.includes('locked') &&
                                !error.message.includes('closed')) {
                                console.error(`视频流处理错误:`, error);
                            }
                        });
                });

                if (scrcpy.clipboard) {
                    void scrcpy.clipboard.pipeTo(
                        new WritableStream<string>({
                            write(chunk) {
                                globalThis.navigator.clipboard.writeText(chunk);
                            },
                        }),
                    ).catch(err => console.error(`剪贴设置板错误:`, err));
                }

                void scrcpy.output.pipeTo(
                    new WritableStream<string>({
                        write(chunk) {
                            console.log(`输出:`, chunk);
                        },
                    }),
                );

                cleanupRef.current = () => {
                    scrcpy.close();
                    adb.close();
                    transport.close();
                };

            } catch (e) {
                console.error(`初始化失败:`, e);
                setError(e instanceof Error ? e.message : '连接设备失败');
                setIsLoading(false);
            }
        };

        initializeDevice();

        return () => {
            // 清理音频管理器
            audioManagerRef.current?.cleanup();
            audioManagerRef.current = null;

            // 清理 scrcpy/adb/transport
            if (cleanupRef.current) {
                cleanupRef.current();
                cleanupRef.current = null;
            }

            // 清除控制器和客户端引用
            controllerRef.current = null;
            scrcpyClientRef.current = null;

            // 清空视频容器（使用捕获的 wrapper 值）
            if (wrapper) {
                wrapper.innerHTML = '';
            }

            // 重置状态
            setIsVideoLoaded(false);
            setIsLandscape(false);
            setIsMuted(true);
            isMutedRef.current = true;
            setAudioAvailable(true);
            setAudioError(false);
        };
    }, [serial]);


    // 静音切换
    const toggleMute = () => {
        if (isMuted) {
            // 取消静音：启动音频播放器（用户交互，符合浏览器策略）
            audioManagerRef.current?.start();
            setIsMuted(false);
            isMutedRef.current = false;
        } else {
            // 静音：停止音频播放器
            audioManagerRef.current?.stop();
            setIsMuted(true);
            isMutedRef.current = true;
        }
    };

    // 旋转屏幕
    const rotateScreen = () => {
        if (scrcpyClientRef.current?.controller) {
            scrcpyClientRef.current.controller.rotateDevice();
        }
    };

    /**
     * 获取 SVG 占位尺寸（移动设备横屏时交换宽高）
     */
    const getVisualSize = () => {
        const size = videoSize || screenSize || {width: 0, height: 0};

        // 移动设备横屏：交换宽高，让容器适应旋转后的视频
        if (isMobile && isLandscape) {
            return {
                width: size.height,
                height: size.width
            };
        }

        return size;
    };

    /**
     * 获取视频容器样式（移动设备横屏时旋转 90°）
     */
    const getVideoWrapperStyle = (): React.CSSProperties => {
        if (!isMobile || !isLandscape || !videoSize) {
            // 桌面或竖屏：正常显示
            return {
                position: 'absolute',
                inset: 0
            };
        }

        // 移动设备横屏：旋转容器 90°
        return {
            position: 'absolute',
            top: '50%',
            left: '50%',
            width: `${videoSize.width}px`,
            height: `${videoSize.height}px`,
            maxWidth: '70vh',
            maxHeight: '100vw',
            transform: 'translate(-50%, -50%) rotate(90deg)',
            transformOrigin: 'center center',
            transition: 'transform 0.3s ease'
        };
    };

    /**
     * 获取触控旋转角度（移动设备横屏时返回 90）
     */
    const getTouchRotation = (): number => {
        return (isMobile && isLandscape) ? 90 : 0;
    };

    /**
     * 获取触控屏幕尺寸（始终使用原始尺寸，rotation 会处理坐标转换）
     */
    const getTouchScreenSize = () => {
        return videoSize || screenSize || {width: 0, height: 0};
    };


    return (
        <div className="h-full flex items-center justify-center p-2 md:p-6">
            <Card className="w-full h-full gap-3">
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => navigate('/')}
                        >
                            <ArrowLeft className="h-4 w-4"/>
                        </Button>
                        <div className="flex-1">
                            <CardTitle className="flex items-center gap-1">
                                {deviceInfo ? deviceInfo.market_name : serial}
                                {isLoading && <Spinner className="h-4 w-4 text-muted-foreground"/>}
                            </CardTitle>
                            <CardDescription>
                                {deviceInfo ? `${deviceInfo.model} (${deviceInfo.device})` : serial}
                            </CardDescription>
                        </div>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={rotateScreen}
                            disabled={!isVideoLoaded}
                            title={`旋转屏幕 (当前: ${isLandscape ? '横屏' : '竖屏'})`}
                        >
                            <RectangleVertical
                                className="h-4 w-4 transition-transform duration-300"
                                style={{transform: isLandscape ? 'rotate(90deg)' : 'rotate(0deg)'}}
                            />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={toggleMute}
                            disabled={!audioAvailable}
                            title={
                                !audioAvailable
                                    ? (audioError ? "音频出错" : "音频不可用")
                                    : (isMuted ? "取消静音" : "静音")
                            }
                            className={audioError ? "text-destructive hover:text-destructive" : ""}
                        >
                            {isMuted ? <VolumeOff className="h-4 w-4"/> : <Volume2 className="h-4 w-4"/>}
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleKeyPress(AndroidKeyCode.Power)}
                            title="电源键"
                        >
                            <Power className="h-4 w-4"/>
                        </Button>

                    </div>
                </CardHeader>
                <CardContent className="px-2 md:px-6">
                    {error ? (
                        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-8 flex flex-col items-center gap-4">
                            <AlertCircle className="h-8 w-8 text-destructive"/>
                            <div className="text-center">
                                <p className="font-medium text-destructive mb-2">连接失败</p>
                                <p className="text-sm text-muted-foreground">{error}</p>
                            </div>
                            <Button onClick={() => window.location.reload()} variant="outline">
                                刷新重拾
                            </Button>
                        </div>
                    ) : screenSize && (
                        <div className="flex items-center justify-center">


                            <div className="inline-flex flex-col gap-0 ">
                                {/* 屏幕显示区域 */}
                                <div className="canvas-wrapper border-2 border-solid border-black rounded-t-sm overflow-hidden bg-white relative">
                                    {/* 键盘控制 */}
                                    <KeyboardControl client={scrcpyClientRef.current} enabled={isVideoLoaded}/>

                                    <TouchControl
                                        client={scrcpyClientRef.current}
                                        screenWidth={getTouchScreenSize().width}
                                        screenHeight={getTouchScreenSize().height}
                                        rotation={getTouchRotation()}
                                    >
                                        {/* 底层：SVG 占位撑开尺寸 */}
                                        <svg
                                            width={getVisualSize().width}
                                            height={getVisualSize().height}
                                            style={{
                                                display: 'block',
                                                maxWidth: '100%',
                                                maxHeight: '70vh',
                                                width: 'auto',
                                                height: 'auto'
                                            }}
                                        />

                                        {/* 中间层：视频容器（处理旋转） */}
                                        <div
                                            ref={wrapperRef}
                                            style={getVideoWrapperStyle()}
                                        />

                                        {/* 顶层：加载动画 */}
                                        {!isVideoLoaded && (
                                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                                <Spinner className="h-8 w-8 text-black"/>
                                            </div>
                                        )}
                                    </TouchControl>
                                </div>

                                {/* Android 风格导航栏 */}
                                <div className="flex items-center justify-around bg-black/90 border-2 border-t-0 border-black rounded-b-sm w-full">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="size-8 hover:bg-white/10 text-white"
                                        title="返回"
                                        onClick={() => handleKeyPress(AndroidKeyCode.AndroidHome)}
                                    >
                                        <ChevronLeft className="h-6 w-6"/>
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="size-8 hover:bg-white/10 text-white"
                                        title="主页"
                                        onClick={() => handleKeyPress(AndroidKeyCode.AndroidHome)}
                                    >
                                        <Home className="h-5 w-5"/>
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="size-8 hover:bg-white/10 text-white"
                                        title="最近任务"
                                        onClick={() => handleKeyPress(AndroidKeyCode.AndroidAppSwitch)}
                                    >
                                        <Square className="h-5 w-5"/>
                                    </Button>

                                </div>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}