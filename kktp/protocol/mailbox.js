// kktp-core/mailbox.js
import { hexToBytes } from './utils/conversion.js';
import { XChaCha20Poly1305 } from "https://esm.sh/@noble/ciphers/chacha";

export class Mailbox {
    constructor(portal, session, mailboxId) {
        this.portal = portal;
        this.session = session;
        this.mailboxId = mailboxId;
        this.prefix = `KKTP:${mailboxId}:`;
        
        // Section 7.2: Reassembly Buffer
        this.expectedSeq = { "AtoB": 1, "BtoA": 1 };
        this.buffer = { "AtoB": {}, "BtoA": {} };
        
        this.onMessageCallback = null;
        this._setupListener();
    }

    _setupListener() {
        // Use the new multi-prefix method so we don't overwrite other mailboxes
        this.portal.scanner.addPrefix(this.prefix);

        // Listen for matches
        this.portal.onNewTransactionMatch((match) => {
            this._handleIncomingMatch(match);
        });
    }

    async _handleIncomingMatch(match) {
        const payload = match.decodedPayload; 
        if (!payload.startsWith(this.prefix)) return;

        // Strip prefix and parse JSON (Section 6.5)
        const jsonStr = payload.substring(this.prefix.length);
        const msg = JSON.parse(jsonStr);

        if (msg.type !== "msg" || msg.mailbox_id !== this.mailboxId) return;

        // Section 7.1: Replay Protection
        if (msg.seq < this.expectedSeq[msg.direction]) return;

        // Store in buffer for DAG reassembly (Section 7.2)
        this.buffer[msg.direction][msg.seq] = msg;
        this._processBuffer(msg.direction);
    }

    async _processBuffer(direction) {
        while (this.buffer[direction][this.expectedSeq[direction]]) {
            const msg = this.buffer[direction][this.expectedSeq[direction]];
            
            try {
                const plaintext = await this._decrypt(msg);
                if (this.onMessageCallback) {
                    this.onMessageCallback({ 
                        ...msg, 
                        plaintext: new TextDecoder().decode(plaintext) 
                    });
                }
            } catch (e) {
                console.error("KKTP: Decryption failure. Dropping packet.", e);
            }

            delete this.buffer[direction][this.expectedSeq[direction]];
            this.expectedSeq[direction]++;
        }
    }

    /**
     * Section 6.6: AEAD Decryption with AAD Binding
     */
    async _decrypt(msg) {
        const key = this.session.getSessionKey(); // Derived in handshake.js
        const chacha = new XChaCha20Poly1305(key, hexToBytes(msg.nonce));

        // Construct AAD: mailbox_id (raw) || direction (utf8) || seq (u64be)
        const aad = this._constructAAD(msg.direction, msg.seq);
        
        const ciphertext = hexToBytes(msg.ciphertext);
        return chacha.decrypt(ciphertext, aad);
    }

    _constructAAD(direction, seq) {
        const mbBytes = hexToBytes(this.mailboxId);
        const dirBytes = new TextEncoder().encode(direction);
        const seqBytes = new Uint8Array(8);
        new DataView(seqBytes.buffer).setBigUint64(0, BigInt(seq), false); // Big-Endian

        const aad = new Uint8Array(mbBytes.length + dirBytes.length + 8);
        aad.set(mbBytes, 0);
        aad.set(dirBytes, mbBytes.length);
        aad.set(seqBytes, mbBytes.length + dirBytes.length);
        return aad;
    }

    onMessage(cb) {
        this.onMessageCallback = cb;
    }
}