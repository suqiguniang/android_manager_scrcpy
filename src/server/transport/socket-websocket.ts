import {WritableStream} from "@yume-chan/stream-extra";
import {WebSocket} from "ws";
import type {AdbSocket} from "@yume-chan/adb";
import type {FastifyRequest} from "fastify";
import {delay} from "@yume-chan/async";

export class WS {
    static async build(socket: AdbSocket, client: WebSocket, req: FastifyRequest) {
        client.binaryType = "arraybuffer";
        try {
            // Read from ADB socket and write to WebSocket
            socket.readable.pipeTo(
                new WritableStream({
                    async write(chunk) {
                        while (client.bufferedAmount >= 1 * 1024 * 1024) {
                            await delay(10);
                        }
                        client.send(chunk);
                    },
                }),
            )

            // Read from WebSocket and write to ADB socket
            const writer = socket.writable.getWriter();
            client.on("message", async (message) => {
                client.pause();
                await writer.write(new Uint8Array(message as ArrayBuffer));
                client.resume();
            });

            // Propagate ADB socket closure to WebSocket
            void socket.closed.then(() => {
                req.log.info("WebSocket closed")
                client.close();
            });

            // Propagate WebSocket closure to ADB socket
            client.on("close", () => {
                req.log.info("ADBSocket closed")
                socket.close();
            });
        } catch {
            // ADB socket open failed
            client.close();
            return;
        }
        // client.binaryType = "arraybuffer";
        // // 创建背压感知的 Web Streams WritableStream
        // const writeStream = new WritableStream<Uint8Array>({
        //     async write(chunk: Uint8Array) {
        //         if (client.readyState !== WebSocket.OPEN) {
        //             throw new Error("WebSocket closed");
        //         }
        //
        //         // 发送数据
        //         client.send(chunk);
        //
        //         // 如果缓冲区过大，等待 drain 事件后再返回
        //         if (client.bufferedAmount > 1 * 1024 * 1024) {
        //             return new Promise<void>((resolve, reject) => {
        //                 const timeout = setTimeout(() => {
        //                     client.removeListener("drain", onDrain);
        //                     reject(new Error("Drain timeout"));
        //                 }, 30000);
        //
        //                 const onDrain = () => {
        //                     clearTimeout(timeout);
        //                     resolve();
        //                 };
        //
        //                 client.once("drain", onDrain);
        //             });
        //         }
        //     },
        //     close() {
        //         if (client.readyState === WebSocket.OPEN) {
        //             client.close();
        //         }
        //     },
        //     abort(reason) {
        //         req.log.error(reason, "Write stream aborted:");
        //         if (client.readyState === WebSocket.OPEN) {
        //             client.close();
        //         }
        //     }
        // });
        //
        // // 从 ADB socket 读取并写入 WebSocket
        // socket.readable.pipeTo(writeStream).catch(err => {
        //     req.log.error(err, "Pipe error (ADB → WebSocket):");
        // });
        //
        // // 从 WebSocket 读取并写入 ADB socket
        // const writer = socket.writable.getWriter();
        // let isProcessing = false;
        //
        // client.on("message", async (message: ArrayBuffer) => {
        //     if (isProcessing) return;
        //
        //     isProcessing = true;
        //     try {
        //         const data = new Uint8Array(message);
        //         await writer.write(data);
        //     } catch (err) {
        //         req.log.error(err, "Write error (WebSocket → ADB):");
        //         client.close();
        //     } finally {
        //         isProcessing = false;
        //     }
        // });
        //
        // // 处理连接关闭
        // socket.closed
        //     .then(() => {
        //         req.log.info("ADB socket closed");
        //         if (client.readyState === WebSocket.OPEN) {
        //             client.close();
        //         }
        //     })
        //     .catch(err => req.log.error("Socket error:", err));
        //
        // client.on("close", async () => {
        //     req.log.info("WebSocket closed");
        //     await socket.close()
        // });
        //
        // client.on("error", (err: Error) => {
        //     req.log.error(err, "WebSocket error:");
        //     socket.close()
        // });
    }
}