import crypto from 'crypto';

const ALGO = 'aes-256-gcm';

function getMasterKey() {
  const key = process.env.CHAT_ENCRYPTION_MASTER_KEY;
  if (!key) {
    throw new Error('CHAT_ENCRYPTION_MASTER_KEY is not defined');
  }

  // Derive a 32-byte key from any string using SHA-256 so env value
  // can be a human-readable secret instead of strict hex.
  return crypto.createHash('sha256').update(key).digest();
}

export function generateChatKey() {
  const key = crypto.randomBytes(32);
  const chatKeyId = crypto.randomUUID();

  const masterKey = getMasterKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, masterKey, iv);
  const encrypted = Buffer.concat([cipher.update(key), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const encryptedChatKey = Buffer.concat([iv, authTag, encrypted]).toString('base64');

  return {
    chatKeyId,
    encryptedChatKey,
    algorithm: ALGO,
  };
}

function getChatKeyFromEncrypted(encryptedChatKey) {
  const masterKey = getMasterKey();
  const buf = Buffer.from(encryptedChatKey, 'base64');
  const iv = buf.subarray(0, 12);
  const authTag = buf.subarray(12, 28);
  const ciphertext = buf.subarray(28);

  const decipher = crypto.createDecipheriv(ALGO, masterKey, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted; // Buffer
}

export function encryptForChat(chat, plaintext) {
  const key = getChatKeyFromEncrypted(chat.encryption.encryptedChatKey);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const payload = Buffer.concat([iv, authTag, encrypted]).toString('base64');
  return payload;
}

export function decryptForChat(chat, payload) {
  const key = getChatKeyFromEncrypted(chat.encryption.encryptedChatKey);
  const buf = Buffer.from(payload, 'base64');
  const iv = buf.subarray(0, 12);
  const authTag = buf.subarray(12, 28);
  const ciphertext = buf.subarray(28);

  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
}
