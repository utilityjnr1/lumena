import { Keypair } from "@stellar/stellar-sdk";

export interface StoredKey {
  publicKey: string;
  encryptedSecret: string;
  createdAt: Date;
}

export interface KeyStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  key(index: number): string | null;
  readonly length: number;
}

const STORAGE_PREFIX = "lumen:key-manager:";

function createMemoryStorage(): KeyStorage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    key: (index) => Array.from(values.keys())[index] ?? null,
  };
}

function getDefaultStorage(): KeyStorage {
  return typeof globalThis.localStorage === "undefined"
    ? createMemoryStorage()
    : globalThis.localStorage;
}

function parseStoredKey(value: string): StoredKey {
  const parsed: unknown = JSON.parse(value);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Stored key data is invalid");
  }

  const candidate = parsed as Record<string, unknown>;
  if (
    typeof candidate.publicKey !== "string" ||
    typeof candidate.encryptedSecret !== "string" ||
    typeof candidate.createdAt !== "string"
  ) {
    throw new Error("Stored key data is invalid");
  }

  const createdAt = new Date(candidate.createdAt);
  if (Number.isNaN(createdAt.getTime())) {
    throw new Error("Stored key creation date is invalid");
  }

  return {
    publicKey: candidate.publicKey,
    encryptedSecret: candidate.encryptedSecret,
    createdAt,
  };
}

export class KeyManager {
  private readonly storage: KeyStorage;

  constructor(storage: KeyStorage = getDefaultStorage()) {
    this.storage = storage;
  }

  generateKeypair(): Keypair {
    return Keypair.random();
  }

  async deriveFromOAuth(
    provider: string,
    token: string,
    salt?: string
  ): Promise<Keypair> {
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      encoder.encode(token),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const data = encoder.encode(`${provider}:${salt ?? "lumen-derivation"}`);
    const signature = await crypto.subtle.sign("HMAC", keyMaterial, data);
    const seed = Buffer.from(new Uint8Array(signature).slice(0, 32));

    return Keypair.fromRawEd25519Seed(seed);
  }

  async store(key: Keypair, passphrase: string): Promise<StoredKey> {
    const encoder = new TextEncoder();
    const secret = key.secret();
    const salt = crypto.getRandomValues(new Uint8Array(16));

    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      encoder.encode(passphrase),
      { name: "PBKDF2" },
      false,
      ["deriveKey"]
    );

    const aesKey = await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt,
        iterations: 100000,
        hash: "SHA-256",
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt"]
    );

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      aesKey,
      encoder.encode(secret)
    );

    const encryptedSecret = `${Buffer.from(salt).toString("base64")}.${Buffer.from(iv).toString("base64")}.${Buffer.from(encrypted).toString("base64")}`;

    const stored: StoredKey = {
      publicKey: key.publicKey(),
      encryptedSecret,
      createdAt: new Date(),
    };
    this.storage.setItem(`${STORAGE_PREFIX}${stored.publicKey}`, JSON.stringify(stored));
    return stored;
  }

  async load(publicKey: string, passphrase: string): Promise<Keypair> {
    const storedValue = this.storage.getItem(`${STORAGE_PREFIX}${publicKey}`);
    if (storedValue === null) throw new Error(`Key not found: ${publicKey}`);
    const stored = parseStoredKey(storedValue);

    const [saltB64, ivB64, cipherB64] = stored.encryptedSecret.split(".");
    const salt = Buffer.from(saltB64, "base64");
    const iv = Buffer.from(ivB64, "base64");
    const ciphertext = Buffer.from(cipherB64, "base64");

    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      encoder.encode(passphrase),
      { name: "PBKDF2" },
      false,
      ["deriveKey"]
    );

    const aesKey = await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: salt as BufferSource,
        iterations: 100000,
        hash: "SHA-256",
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"]
    );

    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      aesKey,
      ciphertext as BufferSource
    );

    const secret = new TextDecoder().decode(decrypted);
    return Keypair.fromSecret(secret);
  }

  list(): StoredKey[] {
    const storedKeys: StoredKey[] = [];
    for (let index = 0; index < this.storage.length; index++) {
      const storageKey = this.storage.key(index);
      if (storageKey?.startsWith(STORAGE_PREFIX)) {
        const value = this.storage.getItem(storageKey);
        if (value !== null) {
          storedKeys.push(parseStoredKey(value));
        }
      }
    }
    return storedKeys;
  }
}
