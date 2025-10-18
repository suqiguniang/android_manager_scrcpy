import {PromiseResolver, delay} from "@yume-chan/async";
import {ReadableStream, WritableStream} from "@yume-chan/stream-extra";

export interface WebSocketStreamOptions {
    protocols?: string;
    signal?: AbortSignal | undefined;
}

export interface WebSocketStreamOpenEvent {
    extensions: string;
    protocol: string;
    readable: ReadableStream<Uint8Array | string>;
    writable: WritableStream<ArrayBuffer | ArrayBufferView | string>;
}

export interface WebSocketStreamCloseEvent {
    closeCode: number;
    reason: string;
}

export interface WebSocketStreamCloseOptions {
    closeCode: number;
    reason: string;
}

export class WebSocketStream {
    #socket: WebSocket;
    #opened = new PromiseResolver<WebSocketStreamOpenEvent>();
    #closed = new PromiseResolver<WebSocketStreamCloseEvent>();

    constructor(url: string, options?: WebSocketStreamOptions) {
        this.url = url;
        this.#socket = new WebSocket(url, options?.protocols);
        this.#socket.binaryType = "arraybuffer";

        let opened = false;

        this.#socket.onopen = () => {
            opened = true;

            this.#opened.resolve({
                extensions: this.#socket.extensions,
                protocol: this.#socket.protocol,
                readable: new ReadableStream({
                    start: (controller) => {
                        this.#socket.onmessage = (event) => {
                            if (typeof event.data === "string") {
                                controller.enqueue(event.data);
                            } else {
                                controller.enqueue(new Uint8Array(event.data));
                            }
                        };

                        this.#socket.onerror = () => {
                            controller.error(new Error("websocket error"));
                        };

                        this.#socket.onclose = (e) => {
                            try {
                                controller.close();
                            } catch {
                                // ignore
                            }

                            this.#closed.resolve({
                                closeCode: e.code,
                                reason: e.reason,
                            });
                        };
                    },
                }),
                writable: new WritableStream({
                    write: async (chunk) => {
                        while (this.#socket.bufferedAmount > 8 * 1024 * 1024) {
                            await delay(10);
                        }

                        this.#socket.send(chunk);
                    },
                }),
            });
        };

        this.#socket.onerror = () => {
            if (opened) {
                return;
            }

            this.#opened.reject(new Error("websocket error"));
        };
    }

    url: string;

    get opened(): Promise<WebSocketStreamOpenEvent> {
        return this.#opened.promise;
    }

    get closed(): Promise<WebSocketStreamCloseEvent> {
        return this.#closed.promise;
    }

    close(options?: WebSocketStreamCloseOptions) {
        this.#socket.close(options?.closeCode, options?.reason);
    }
}
