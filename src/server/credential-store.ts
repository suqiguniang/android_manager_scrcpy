import {adbGeneratePublicKey, type AdbCredentialStore} from "@yume-chan/adb";
import {readFile, writeFile} from "node:fs/promises";
import {hostname, userInfo} from "node:os";
import {join} from "node:path";
import {webcrypto} from "node:crypto";

function derToPem(buffer: ArrayBuffer, label: string): string {
    const base64 = Buffer.from(buffer).toString("base64");
    const formatted = base64.match(/.{1,64}/g)?.join("\n") ?? base64;
    return `-----BEGIN ${label}-----\n${formatted}\n-----END ${label}-----`;
}

export class AdbNodeJsCredentialStore implements AdbCredentialStore {
    readonly #name;

    constructor(name = `${userInfo().username}@${hostname()}`) {
        this.#name = name;
    }

    #privateKeyPath() {
        return join("certs", "adbkey");
    }

    #publicKeyPath() {
        return join("certs", "adbkey.pub");
    }


    async generateKey() {
        const cryptoKey = await webcrypto.subtle.generateKey(
            {
                name: "RSASSA-PKCS1-v1_5",
                modulusLength: 2048,
                // 65537
                publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
                hash: "SHA-1",
            },
            true,
            ["sign", "verify"],
        );
        const pkcs8 = await webcrypto.subtle.exportKey("pkcs8", cryptoKey.privateKey);
        const privateKey = new Uint8Array(pkcs8);
        const pubkey = `${Buffer.from(adbGeneratePublicKey(privateKey)).toString("base64")} ${this.#name}`
        const prvkey = derToPem(pkcs8, "PRIVATE KEY")
        await writeFile(this.#privateKeyPath(), prvkey);
        await writeFile(this.#publicKeyPath(), pubkey);

        return {
            buffer: privateKey,
            name: this.#name,
        };
    }

    async #readPubKeyName() {
        const content = await readFile(this.#publicKeyPath(), "utf8");
        const pubKeyName = content.split(" ")[1];
        return pubKeyName || `${userInfo().username}@${hostname()}`;
    }

    async* iterateKeys() {
        const pem = await readFile(this.#privateKeyPath(), "utf8");
        const content = pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "").replace(/\s+/g, "");
        const privateKey = Buffer.from(content, "base64")
        yield {
            buffer: privateKey,
            name: await this.#readPubKeyName(),
        };
    }
}
