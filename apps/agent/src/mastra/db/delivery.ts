import type { RunStatus, TaskDelivery } from './tasks';

/**
 * Task result delivery (v1.3) — Slack / generic webhook, kept behind a seam so
 * it's mockable in tests (no live network in CI). `none` records nothing extra;
 * `slack`/`webhook` POST a JSON `{ text }` to the configured URL (Slack incoming
 * webhooks accept exactly that). Email is intentionally deferred — it needs SMTP
 * + a dependency; the webhook path covers the "deliver a summary" need for now.
 */

export interface DeliveryMessage {
  taskName: string;
  status: RunStatus;
  text: string;
}

export interface Deliverer {
  deliver(delivery: TaskDelivery, message: DeliveryMessage): Promise<void>;
}

/** The real deliverer: POST to a Slack/webhook URL; no-op for `none`. */
const httpDeliverer: Deliverer = {
  async deliver(delivery, message) {
    if (delivery.channel === 'none') return;
    const url = delivery.url || (delivery.channel === 'slack' ? process.env.SLACK_WEBHOOK_URL : '');
    if (!url) return; // nothing to deliver to — recorded on the task either way
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: `*${message.taskName}* — ${message.text}` }),
    });
  },
};

let override: Deliverer | null = null;

export function getDeliverer(): Deliverer {
  return override ?? httpDeliverer;
}

/** Inject a deliverer (used by tests). Pass `null` to revert to the HTTP one. */
export function setDeliverer(deliverer: Deliverer | null): void {
  override = deliverer;
}

export async function deliverResult(
  delivery: TaskDelivery,
  message: DeliveryMessage,
): Promise<void> {
  await getDeliverer().deliver(delivery, message);
}
