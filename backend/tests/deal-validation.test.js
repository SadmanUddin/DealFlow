import { describe, expect, it } from 'vitest';
import { canTransitionDeal } from '#utils/deal-rules.js';
import {
  createDealSchema,
  createOfferSchema,
  dealIdSchema,
  dealStatusSchema,
  respondOfferSchema,
} from '#validations/deal.validation.js';

describe('Phase 8 deal rules and request validation', () => {
  it('allows only defined forward deal transitions', () => {
    expect(canTransitionDeal('proposed', 'negotiating')).toBe(true);
    expect(canTransitionDeal('negotiating', 'due_diligence')).toBe(true);
    expect(canTransitionDeal('accepted', 'completed')).toBe(true);
    expect(canTransitionDeal('negotiating', 'accepted')).toBe(false);
    expect(canTransitionDeal('completed', 'cancelled')).toBe(false);
    expect(canTransitionDeal('cancelled', 'negotiating')).toBe(false);
    expect(canTransitionDeal('unknown', 'accepted')).toBe(false);
  });

  it('accepts only valid listing ids and offer values', () => {
    expect(createDealSchema.safeParse({ listingId: 4 }).success).toBe(true);
    expect(
      createDealSchema.safeParse({ listingId: 0, buyerId: 7 }).success
    ).toBe(false);
    expect(
      createOfferSchema.safeParse({
        amount: '25000.50',
        currency: 'EUR',
        message: 'Terms',
      }).success
    ).toBe(true);
    for (const amount of ['0', '-1', '1.001', '1e5', '99999999999999999']) {
      expect(
        createOfferSchema.safeParse({ amount, currency: 'EUR' }).success
      ).toBe(false);
    }
    expect(
      createOfferSchema.safeParse({ amount: '100', currency: 'usd' }).success
    ).toBe(false);
    expect(
      createOfferSchema.safeParse({ amount: '100', currency: 'ZZZ' }).success
    ).toBe(false);
    expect(
      createOfferSchema.safeParse({ amount: '100', currency: 'XCG' }).success
    ).toBe(true);
    expect(
      createOfferSchema.safeParse({
        amount: '100',
        currency: 'EUR',
        buyerId: 9,
      }).success
    ).toBe(false);
  });

  it('rejects malformed ids and unsupported offer actions', () => {
    expect(dealIdSchema.safeParse({ id: '12' }).success).toBe(true);
    expect(dealIdSchema.safeParse({ id: '0' }).success).toBe(false);
    expect(respondOfferSchema.safeParse({ action: 'accept' }).success).toBe(
      true
    );
    expect(respondOfferSchema.safeParse({ action: 'withdraw' }).success).toBe(
      false
    );
    expect(dealStatusSchema.safeParse({ status: 'accepted' }).success).toBe(
      false
    );
  });
});
