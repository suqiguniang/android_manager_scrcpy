import type { AdbDaemonDevice } from "@yume-chan/adb";
import { AdbPacket, AdbPacketSerializeStream } from "@yume-chan/adb";
import {
    StructDeserializeStream,
    WrapWritableStream, Consumable,
} from "@yume-chan/stream-extra";
import { TCPSocket } from "./tcp-socket";

export interface AdbDaemonDirectSocketDeviceOptions {
    host: string;
    port?: number;
    name?: string;
    unref?: boolean;
}

export class AdbDaemonDirectSocketsDevice implements AdbDaemonDevice {
    static isSupported(): boolean {
        return true;
    }

    #options: AdbDaemonDirectSocketDeviceOptions;

    readonly serial: string;

    get host(): string {
        return this.#options.host;
    }

    readonly port: number;

    get name(): string | undefined {
        return this.#options.name;
    }

    constructor(options: AdbDaemonDirectSocketDeviceOptions) {
        this.#options = options;
        this.port = options.port ?? 5555;
        this.serial = `${this.host}:${this.port}`;
    }

    async connect() {
        const socket = new TCPSocket(this.host, this.port, {
            noDelay: true,
            unref: this.#options.unref,
        });
        const { readable, writable } = await socket.opened;
        const writer = writable.getWriter();

        return {
            readable: readable.pipeThrough(new StructDeserializeStream(AdbPacket)),
            writable: new WrapWritableStream(
                new Consumable.WritableStream<Uint8Array>({
                    write(chunk) {
                        return writer.write(chunk);
                    },
                }),
            ).bePipedThroughFrom(new AdbPacketSerializeStream()),
        };
    }
}