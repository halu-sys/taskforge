// Payment provider abstraction. FakeProvider is deterministic:
// card 4000000000000002 always declines; anything else succeeds.
export interface ChargeResult {
  ok: boolean;
  providerId?: string;
  failReason?: string;
}

export interface PaymentProvider {
  createCheckout(amountCents: number, meta: Record<string, string>): { checkoutId: string };
  charge(checkoutId: string): Promise<ChargeResult>;
}

export class FakeProvider implements PaymentProvider {
  private checkouts = new Map<string, { amountCents: number; card?: string }>();
  private seq = 0;

  createCheckout(amountCents: number, meta: Record<string, string>) {
    const checkoutId = `fake_co_${Date.now()}_${++this.seq}`;
    this.checkouts.set(checkoutId, { amountCents, card: meta.card });
    return { checkoutId };
  }

  async charge(checkoutId: string): Promise<ChargeResult> {
    const co = this.checkouts.get(checkoutId);
    if (!co) return { ok: false, failReason: "checkout not found" };
    if (co.card === "4000000000000002") {
      return { ok: false, failReason: "card declined" };
    }
    return { ok: true, providerId: `fake_${checkoutId}` };
  }
}
