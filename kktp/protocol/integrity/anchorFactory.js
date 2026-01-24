// kktp-core/protocol/anchorFactory.js
import { bytesToHex, hexToBytes } from '../utils/conversions.js';
import { constructAAD } from './aad.js';
import { XChaCha20Poly1305 } from "https://esm.sh/@noble/ciphers/chacha";

export class AnchorFactory {
    constructor(portal) {
        this.portal = portal;
    }

    /**
     * Section 6.1: Discovery Anchor
     */
    async createDiscovery(gameName, version) {
        const sid = bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
        const sigKeypair = await this.portal.identity.getKeypair(); 
        const dhKeypair = await this.portal.crypto.generateEphemeralDH();
        
        const vrfInput = sigKeypair.publicKey + dhKeypair.publicKey + sid;
        const { value, proof } = await this.portal.vrf.prove(vrfInput);

        const discovery = {
            type: "discovery",
            version: 1,
            sid: sid,
            pub_sig: sigKeypair.publicKey,
            pub_dh: dhKeypair.publicKey,
            vrf_value: value,
            vrf_proof: proof,
            meta: {
                game: gameName,
                version: version,
                expected_uptime_seconds: 3600
            }
        };

        discovery.sig = await this.portal.crypto.signAnchor(discovery);
        return { discovery, dhPrivateKey: dhKeypair.privateKey };
    }

    /**
     * Section 6.2: Response Anchor (Schema Compliant)
     */
    async createResponse(discovery) {
        const sigKeypair = await this.portal.identity.getKeypair();
        const dhKeypair = await this.portal.crypto.generateEphemeralDH();

        const response = {
            type: "response",
            version: 1,
            sid: discovery.sid,
            initiator_pub_sig: discovery.pub_sig, // Literal Schema Compliance
            initiator_pub_dh: discovery.pub_dh,   // Literal Schema Compliance
            pub_sig_resp: sigKeypair.publicKey,
            pub_dh_resp: dhKeypair.publicKey,
            vrf_value: null,
            vrf_proof: null
        };

        const vrfInput = discovery.pub_sig + discovery.pub_dh + 
                         response.pub_sig_resp + response.pub_dh_resp + discovery.sid;
        
        const vrfData = await this.portal.vrf.prove(vrfInput);
        response.vrf_value = vrfData.value;
        response.vrf_proof = vrfData.proof;

        response.sig_resp = await this.portal.crypto.signResponse(response);
        return { response, dhPrivateKey: dhKeypair.privateKey };
    }

    /**
     * Section 6.5: Message Object
     */
    async createMessage(mailboxId, direction, seq, plaintext, sessionKey) {
        const nonce = crypto.getRandomValues(new Uint8Array(24));
        const aad = constructAAD(mailboxId, direction, seq); // Using your aad.js

        const chacha = new XChaCha20Poly1305(sessionKey, nonce);
        const ciphertext = chacha.encrypt(new TextEncoder().encode(plaintext), aad);

        return {
            type: "msg",
            version: 1,
            mailbox_id: mailboxId,
            direction: direction,
            seq: Number(seq),
            nonce: bytesToHex(nonce),
            ciphertext: bytesToHex(ciphertext)
        };
    }

    /**
     * Section 8.1: Session End Anchor
     */
    async createSessionEnd(mailboxId, lastSeqA, lastSeqB) {
        const sigKeypair = await this.portal.identity.getKeypair();

        const sessionEnd = {
            type: "session_end",
            version: 1,
            mailbox_id: mailboxId,
            pub_sig: sigKeypair.publicKey,
            last_seq_a: Number(lastSeqA),
            last_seq_b: Number(lastSeqB),
            timestamp: Math.floor(Date.now() / 1000)
        };

        sessionEnd.sig = await this.portal.crypto.signAnchor(sessionEnd);
        return sessionEnd;
    }
}