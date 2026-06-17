import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';

// 32-byte key derived from SHELLY_ENC_KEY (any-length secret hashed to 32 bytes).
function key(): Buffer {
    const secret = process.env.SHELLY_ENC_KEY;
    if (!secret) throw new Error('SHELLY_ENC_KEY is not set');
    return createHash('sha256').update(secret).digest();
}

// Returns "ivHex:tagHex:cipherHex"
export function encryptSecret(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key(), iv);
    const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

export function decryptSecret(stored: string): string {
    const [ivHex, tagHex, dataHex] = stored.split(':');
    if (!ivHex || !tagHex || !dataHex) throw new Error('Malformed encrypted value');
    const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8');
}
