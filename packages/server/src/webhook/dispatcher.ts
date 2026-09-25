import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type {
  WebhookConfig,
  WebhookEventType,
  WebhookPayload,
  WebhookDeliveryResult,
} from "@lumen/types";
import { logger } from "../logger.js";

export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string,
): boolean {
  const digest = signature.startsWith("sha256=") ? signature.slice("sha256=".length) : "";
  if (!/^[a-f0-9]{64}$/.test(digest)) {
    return false;
  }

  const receivedDigest = Buffer.from(digest, "hex");
  const expectedDigest = createHmac("sha256", secret).update(payload).digest();
  return (
    receivedDigest.length === expectedDigest.length &&
    timingSafeEqual(receivedDigest, expectedDigest)
  );
}

export interface WebhookDispatcherOpts {
  webhooks?: WebhookConfig[];
  timeoutMs?: number;
  maxRetries?: number;
  initialDelayMs?: number;
  backoffFactor?: number;
}

export class WebhookDispatcher {
  private webhooks: Map<string, WebhookConfig> = new Map();
  private timeoutMs: number;
  private maxRetries: number;
  private initialDelayMs: number;
  private backoffFactor: number;

  constructor(opts: WebhookDispatcherOpts = {}) {
    this.timeoutMs = opts.timeoutMs ?? 5000;
    this.maxRetries = opts.maxRetries ?? 3;
    this.initialDelayMs = opts.initialDelayMs ?? 200;
    this.backoffFactor = opts.backoffFactor ?? 2;

    if (opts.webhooks) {
      for (const wh of opts.webhooks) {
        this.register(wh);
      }
    }
  }

  register(config: WebhookConfig): void {
    this.webhooks.set(config.id, {
      ...config,
      enabled: config.enabled ?? true,
    });
  }

  unregister(id: string): boolean {
    return this.webhooks.delete(id);
  }

  get(id: string): WebhookConfig | undefined {
    return this.webhooks.get(id);
  }

  list(): WebhookConfig[] {
    return Array.from(this.webhooks.values());
  }

  generateSignature(payload: string, secret: string): string {
    const hmac = createHmac("sha256", secret);
    hmac.update(payload);
    return `sha256=${hmac.digest("hex")}`;
  }

  createPayload<T>(event: WebhookEventType, data: T): WebhookPayload<T> {
    return {
      id: randomUUID(),
      event,
      timestamp: new Date().toISOString(),
      data,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async dispatch<T>(event: WebhookEventType, data: T): Promise<WebhookDeliveryResult[]> {
    const matchingWebhooks = Array.from(this.webhooks.values()).filter(
      (wh) => wh.enabled !== false && (wh.events.includes(event) || wh.events.includes("*")),
    );

    if (matchingWebhooks.length === 0) {
      return [];
    }

    const payload = this.createPayload(event, data);
    const body = JSON.stringify(payload);

    const deliveryPromises = matchingWebhooks.map(async (wh) => {
      const signature = this.generateSignature(body, wh.secret);
      let attempts = 0;
      let lastStatusCode: number | undefined;
      let lastError: string | undefined;
      let success = false;

      while (attempts <= this.maxRetries) {
        attempts++;
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), this.timeoutMs);

          const res = await fetch(wh.url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Lumen-Signature": signature,
              "X-Lumen-Event": event,
              "X-Lumen-Delivery": payload.id,
            },
            body,
            signal: controller.signal,
          });

          clearTimeout(timer);
          lastStatusCode = res.status;

          if (res.ok) {
            success = true;
            break;
          }

          // If client error (other than 429 Too Many Requests), do not retry
          if (res.status >= 400 && res.status < 500 && res.status !== 429) {
            lastError = `HTTP ${res.status}: ${res.statusText}`;
            break;
          }

          lastError = `HTTP ${res.status}: ${res.statusText}`;
        } catch (err: any) {
          lastError = err.message;
        }

        if (attempts <= this.maxRetries) {
          const delay = this.initialDelayMs * Math.pow(this.backoffFactor, attempts - 1);
          await this.sleep(delay);
        }
      }

      if (!success) {
        logger.warn(
          { webhookId: wh.id, attempts, error: lastError },
          "Webhook delivery failed after attempts",
        );
      }

      return {
        webhookId: wh.id,
        url: wh.url,
        success,
        statusCode: lastStatusCode,
        attempts,
        error: success ? undefined : lastError,
      } as WebhookDeliveryResult;
    });

    return Promise.all(deliveryPromises);
  }
}
