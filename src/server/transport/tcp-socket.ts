import {PromiseResolver} from "@yume-chan/async";
import {
    PushReadableStream,
    tryClose,
    WritableStream,
    type ReadableStream,
} from "@yume-chan/stream-extra";
import {connect, type Socket} from "node:net";

export interface TCPSocketOptions {
    noDelay?: boolean | undefined;
    // Node.js only
    unref?: boolean | undefined;
}

export interface TCPSocketOpenInfo {
    readable: ReadableStream<Uint8Array>;
    writable: WritableStream<Uint8Array>;

    remoteAddress: string;
    remotePort: number;

    localAddress: string;
    localPort: number;
}

export class TCPSocket {
    #socket: Socket;
    #opened = new PromiseResolver<TCPSocketOpenInfo>();
    get opened(): Promise<TCPSocketOpenInfo> {
        return this.#opened.promise;
    }

    constructor(remoteAddress: string, remotePort: number, options?: TCPSocketOptions) {
        this.#socket = connect(remotePort, remoteAddress);

        if (options?.noDelay) {
            this.#socket.setNoDelay(true);
        }
        if (options?.unref) {
            this.#socket.unref();
        }

        this.#socket.on("connect", () => {
            const readable = new PushReadableStream<Uint8Array>((controller) => {
                this.#socket.on("data", async (data) => {
                    this.#socket.pause();
                    await controller.enqueue(data);
                    this.#socket.resume();
                });

                this.#socket.on("end", () => tryClose(controller));

                controller.abortSignal.addEventListener("abort", () => {
                    this.#socket.end();
                });
            });

            this.#opened.resolve({
                remoteAddress,
                remotePort,
                localAddress: this.#socket.localAddress!,
                localPort: this.#socket.localPort!,
                readable,
                writable: new WritableStream({
                    write: async (chunk) => {
                        return new Promise<void>((resolve) => {
                            if (!this.#socket.write(chunk)) {
                                this.#socket.once("drain", resolve);
                            } else {
                                resolve();
                            }
                        });
                    },
                    close: () => void this.#socket.end(),
                }),
            });
        });

        this.#socket.on("error", (error) => {
            this.#opened.reject(error);
        });
    }
}