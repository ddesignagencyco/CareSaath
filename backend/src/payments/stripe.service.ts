import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import Stripe from 'stripe';

export interface CheckoutSessionInput {
  paymentId: string;
  visitId: string;
  /** Minor units (paisa); Stripe's PKR amounts are also in the smallest unit. */
  amount: number;
  description: string;
}

/**
 * Card payments run through Stripe hosted Checkout. The gateway ref stored on
 * the Payment is the Checkout Session id; settlement arrives on the signed
 * `checkout.session.*` webhooks. With no STRIPE_SECRET_KEY the service is
 * disabled and card payments fall back to the generic gateway flow.
 */
@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
  private client: Stripe | null = null;

  get enabled(): boolean {
    return Boolean(process.env['STRIPE_SECRET_KEY']);
  }

  private stripe(): Stripe {
    const key = process.env['STRIPE_SECRET_KEY'];
    if (!key) {
      throw new ServiceUnavailableException('Stripe is not configured');
    }
    this.client ??= new Stripe(key);
    return this.client;
  }

  /** Where Stripe sends the customer back to; the frontend owns these pages. */
  private returnUrl(outcome: 'success' | 'cancelled', paymentId: string): string {
    const base = (process.env['PAYMENT_RETURN_URL'] ?? 'http://localhost:3001/payments/return').replace(/\/+$/, '');
    const session = outcome === 'success' ? '&session_id={CHECKOUT_SESSION_ID}' : '';
    return `${base}?status=${outcome}&paymentId=${paymentId}${session}`;
  }

  async createCheckoutSession(input: CheckoutSessionInput): Promise<{ id: string; url: string }> {
    const session = await this.stripe().checkout.sessions.create(
      {
        mode: 'payment',
        client_reference_id: input.paymentId,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: 'pkr',
              unit_amount: input.amount,
              product_data: { name: input.description },
            },
          },
        ],
        metadata: { paymentId: input.paymentId, visitId: input.visitId },
        payment_intent_data: { metadata: { paymentId: input.paymentId, visitId: input.visitId } },
        success_url: this.returnUrl('success', input.paymentId),
        cancel_url: this.returnUrl('cancelled', input.paymentId),
      },
      // A retried request never creates a second session for the same payment.
      { idempotencyKey: `checkout-${input.paymentId}` },
    );
    if (!session.url) {
      throw new ServiceUnavailableException('Stripe did not return a checkout URL');
    }
    return { id: session.id, url: session.url };
  }

  /** Best-effort: stop a session the customer abandoned so it can no longer be paid. */
  async expireSession(sessionId: string): Promise<void> {
    try {
      await this.stripe().checkout.sessions.expire(sessionId);
    } catch (err) {
      this.logger.warn(`Could not expire Stripe session ${sessionId}: ${(err as Error).message}`);
    }
  }

  /** Verify the webhook signature and parse the event. Throws on a bad signature. */
  constructEvent(rawBody: Buffer, signature: string | undefined): Stripe.Event {
    const secret = process.env['STRIPE_WEBHOOK_SECRET'];
    if (!secret) {
      throw new ServiceUnavailableException('Stripe webhook secret is not configured');
    }
    return this.stripe().webhooks.constructEvent(rawBody, signature ?? '', secret);
  }
}
