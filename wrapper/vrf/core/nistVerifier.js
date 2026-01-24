// This is the JWK representation of the NIST 2.0 Beta Key.
// It explicitly defines the modulus (n) and exponent (e).
const NIST_JWK = {
    kty: "RSA",
    n: "wvC8V3Nb6i8tC_x4Khs0aSDSyvXpGS9Ny3tjkG9b4q4dPdrKzgzl611sbo0PZvob3VQM8MYyY7Y07-PSu76uR_qjAiE-0bz5qjrgtqzXA1JIN0cCP7t7SML9xCn5S45NIauEUxJVFZ6E83GNjAgk_Ctra4MCD73UC74qx8kP-idR6BwkQYSgoPTzgkpiFBvXkAo4TIociiExaEOYP208ZgcXHphB2gb_TKKlA3r9aTYUIZcpT23MTEmV6913T8ODC-CyRNSZ0OvIO0uXzNpOHGzsd_AnT5C6T-9aMWx-4IjeRgl3zwuP9cnNMbJUJQ2qfGiQA2_4Cr19oHN-XiBQIgsX2RmPuVRUAGpQrqzTF5z-OvGutgaA6ZL0SUyN9KnRO0KkVqb1lWaclCEEiIJTXjC9tCo1xF0wGZyeHrbWI4TqKKgnKC__NejclCak-li1HW02Vttjav4PhlcnSI0f_uW6ljjOG0TQdJiqWLN+jTZEZQ2CmMLRJQLfj_brti4J-IFZEjDF3CwK8daf-n36he7J1PAwRCWNsKExIyGzQTyWGfJ9VTz9ljtY5-zz-hA5PTUaPVOzUzHyl97227kPf4KaJQYMwa2Uf67zmzCv3NZtVACo2pVJvYwFZhjG8RThgY60KJZHcJnuhwG0CHBrHpArryLrdeMWEePd-7-aCWu88KQ",
    e: "AQAB",
    alg: "PS512", // RSA-PSS with SHA-512
    ext: true
};

export const NistVerifier = {
    async getPublicKey() {
        try {
            // JWK import is the most stable way to handle NIST's specific RSA-PSS keys
            return await crypto.subtle.importKey(
                "jwk",
                NIST_JWK,
                { name: "RSA-PSS", hash: "SHA-512" },
                false,
                ["verify"]
            );
        } catch (err) {
            console.error("NistVerifier: JWK Import Failed:", err);
            throw err;
        }
    },

    async verifyPulse(pulse) {
        try {
            const publicKey = await this.getPublicKey();

            // NIST 2.0 Beta Message Reconstruction
            const message = new TextEncoder().encode(
                pulse.version +
                pulse.period +
                pulse.timeStamp +
                pulse.localRandomValue +
                (pulse.listValues?.find(v => v.type === 'previous')?.value || pulse.previousOutputValue) +
                (pulse.certificateHash || pulse.certificateId) +
                pulse.pulseIndex
            );

            const sigHex = (pulse.signatureValue || pulse.signature).replace(/[^0-9a-fA-F]/g, "");
            const signature = new Uint8Array(sigHex.match(/.{1,2}/g).map(b => parseInt(b, 16)));

            return await crypto.subtle.verify(
                {
                    name: "RSA-PSS",
                    saltLength: 64, // SHA-512 salt length is 64 bytes
                },
                publicKey,
                signature,
                message
            );
        } catch (err) {
            console.error("NistVerifier: Verification Logic Failed:", err);
            return false;
        }
    }
};
