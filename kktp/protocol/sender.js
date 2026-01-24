// kktp-core/sender.js
import { hexToBytes, bytesToHex } from './utils/conversion.js';
import { XChaCha20Poly1305 } from "https://esm.sh/@noble/ciphers/chacha";

/**
 * KKTP Sender: Handles Section 6.6 Encrypted Messaging
 */
export class KKTPSender {
    constructor(portal, session, mailboxId, direction) {
        this.portal = portal;
        this.session = session;
        this.mailboxId = mailboxId;
        this.direction = direction; // "AtoB" or "BtoA"
        this.currentSeq = 0n; // Using BigInt for U64 safety
    }

    /**
     * Section 6.6: Encrypted Messaging Flow
     * @param {string} plaintext - The raw message to send
     */
    async send(plaintext) {
        this.currentSeq++;
        
        // 1. Generate 192-bit Nonce (Section 4)
        const nonceBytes = crypto.getRandomValues(new Uint8Array(24));
        const nonceHex = bytesToHex(nonceBytes);

        // 2. Derive Session Key (from Session object)
        const key = this.session.getSessionKey();
        const chacha = new XChaCha20Poly1305(key, nonceBytes);

        // 3. Construct AAD (Section 6.6)
        // AAD = mailbox_id || direction || seq (U64BE)
        const aad = this._constructAAD(this.currentSeq);

        // 4. Encrypt
        const plaintextBytes = new TextEncoder().encode(plaintext);
        const ciphertextBytes = chacha.encrypt(plaintextBytes, aad);
        const ciphertextHex = bytesToHex(ciphertextBytes);

        // 5. Construct Mailbox Message JSON (Section 5.4)
        const msg = {
            type: "msg",
            version: 1,
            sid: this.session.sid,
            mailbox_id: this.mailboxId,
            direction: this.direction,
            seq: Number(this.currentSeq),
            nonce: nonceHex,
            ciphertext: ciphertextHex
        };

        // 6. Embed and Broadcast (Section 6.4)
        // Format: "KKTP:" || mailbox_id_hex || ":" || <canonical JSON>
        // Note: portal.send() handles the Kaspa Transaction wrapping
        const payload = `KKTP:${this.mailboxId}:${JSON.stringify(this._sortKeys(msg))}`;
        
        // Explicitly send to our own address to keep the KAS but publish the data
        const myAddress = this.portal.wallet.address;

        return await this.portal.send({
            toAddress: myAddress,
            payload: payload,
            amount: 1,            
            priorityFeeKas: 0
        });
    }

    /**
     * Canonical AAD construction as per Protocol Spec 6.6
     */
    _constructAAD(seq) {
        const mbBytes = hexToBytes(this.mailboxId);
        const dirBytes = new TextEncoder().encode(this.direction);
        const seqBytes = new Uint8Array(8);
        // Section 6.6: seq encoded as unsigned 64-bit big-endian integer
        new DataView(seqBytes.buffer).setBigUint64(0, seq, false);

        const aad = new Uint8Array(mbBytes.length + dirBytes.length + 8);
        aad.set(mbBytes, 0);
        aad.set(dirBytes, mbBytes.length);
        aad.set(seqBytes, mbBytes.length + dirBytes.length);
        return aad;
    }

    /**
     * Section 5.1: Canonical Encoding (RFC 8785 subset)
     * Sorts keys lexicographically
     */
    _sortKeys(obj) {
        return Object.keys(obj).sort().reduce((acc, key) => {
            acc[key] = obj[key];
            return acc;
        }, {});
    }
}