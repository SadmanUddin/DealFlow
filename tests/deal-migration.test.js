import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const root = new URL('../', import.meta.url);

describe('Phase 8 migration sequence', () => {
  it('creates the listing/seller constraint exactly once after the deal table exists', async () => {
    const [migration13, migration14, journal, snapshot13, snapshot14, snapshot15, snapshot16] = await Promise.all([
      readFile(new URL('drizzle/0013_phase8_deals.sql', root), 'utf8'),
      readFile(new URL('drizzle/0014_phase8_deal_listing_integrity.sql', root), 'utf8'),
      readFile(new URL('drizzle/meta/_journal.json', root), 'utf8').then(JSON.parse),
      readFile(new URL('drizzle/meta/0013_snapshot.json', root), 'utf8').then(JSON.parse),
      readFile(new URL('drizzle/meta/0014_snapshot.json', root), 'utf8').then(JSON.parse),
      readFile(new URL('drizzle/meta/0015_snapshot.json', root), 'utf8').then(JSON.parse),
      readFile(new URL('drizzle/meta/0016_snapshot.json', root), 'utf8').then(JSON.parse),
    ]);
    const constraint = 'deals_listing_seller_fk';
    expect(migration13).not.toContain(constraint);
    expect(migration14.split(constraint)).toHaveLength(2);
    expect(migration13.indexOf('CREATE TABLE "deals"')).toBeGreaterThanOrEqual(0);
    expect(migration14.indexOf('ALTER TABLE "deals"')).toBeGreaterThanOrEqual(0);
    expect(JSON.stringify(snapshot13)).not.toContain(constraint);
    expect(JSON.stringify(snapshot14)).toContain(constraint);
    expect(snapshot15.prevId).toBe(snapshot14.id);
    expect(snapshot16.prevId).toBe(snapshot15.id);
    expect(snapshot16.tables['public.deals'].columns.accepted_at).toBeDefined();
    expect(snapshot16.tables['public.deals'].checkConstraints.deals_accepted_at_valid).toBeDefined();
    expect(journal.entries.slice(-3).map(entry => entry.tag)).toEqual([
      '0014_phase8_deal_listing_integrity',
      '0015_phase8_iso4217_currency',
      '0016_phase8_deal_offer_invariants',
    ]);
  });

  it('uses a literal ISO 4217 allowlist in the currency constraint migration', async () => {
    const migration = await readFile(new URL('drizzle/0015_phase8_iso4217_currency.sql', root), 'utf8');
    expect(migration).toContain(`${String.fromCharCode(39)}USD${String.fromCharCode(39)}`);
    expect(migration).toContain(`${String.fromCharCode(39)}EUR${String.fromCharCode(39)}`);
    expect(migration).toContain(`${String.fromCharCode(39)}XCG${String.fromCharCode(39)}`);
    expect(migration).not.toContain(`${String.fromCharCode(39)}ANG${String.fromCharCode(39)}`);
    expect(migration).not.toContain('$1');
    expect(migration).not.toContain(`${String.fromCharCode(39)}ZZZ${String.fromCharCode(39)}`);
  });

  it('adds database guards for deal transitions, pending-only inserts, and immutable offer history', async () => {
    const migration = await readFile(new URL('drizzle/0016_phase8_deal_offer_invariants.sql', root), 'utf8');
    expect(migration).toContain('CREATE TRIGGER "deals_status_transition_guard"');
    expect(migration).toContain('OLD.status = \'proposed\' AND NEW.status IN (\'negotiating\',\'accepted\',\'cancelled\',\'rejected\')');
    expect(migration).toContain('OLD.status = \'accepted\' AND NEW.status IN (\'completed\',\'cancelled\')');
    expect(migration).toContain('NEW.status <> \'pending\'');
    expect(migration).toContain('CREATE TRIGGER "deal_offers_no_delete"');
    expect(migration).toContain('BEFORE DELETE ON "deal_offers"');
  });

  it('defers accepted-offer checks across deal, offer, and activity writes', async () => {
    const migration = await readFile(new URL('drizzle/0016_phase8_deal_offer_invariants.sql', root), 'utf8');
    expect(migration).toContain('CREATE CONSTRAINT TRIGGER "deals_offer_lifecycle_integrity"');
    expect(migration).toContain('CREATE CONSTRAINT TRIGGER "offers_deal_lifecycle_integrity"');
    expect(migration).toContain('CREATE CONSTRAINT TRIGGER "deal_activity_offer_lifecycle_integrity"');
    expect(migration.match(/DEFERRABLE INITIALLY DEFERRED/g)).toHaveLength(3);
    expect(migration).toContain('current_status = \'accepted\' OR current_accepted_at IS NOT NULL');
    expect(migration).toContain('ALTER TABLE "deals" ADD CONSTRAINT "deals_accepted_at_valid"');
    expect(migration).toContain('UPDATE deals AS deal');
    expect(migration).toContain('activity.event_type = \'offer.accepted\'');
    expect(migration).toContain('Validate existing rows without rewriting historical negotiation records');
  });
});
