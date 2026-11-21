import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const migration = await readFile(
  new URL('../drizzle/0019_fix_listing_event_key_ambiguity.sql', import.meta.url),
  'utf8'
);
const originalMigration = await readFile(
  new URL('../drizzle/0009_phase6_public_snapshot_and_event_keys.sql', import.meta.url),
  'utf8'
);
const triggerMigration = await readFile(
  new URL('../drizzle/0008_phase6_notifications_outbox.sql', import.meta.url),
  'utf8'
);

describe('listing outbox trigger migration (static inspection)', () => {
  it('renames the colliding local event key and retains the unique-key conflict behavior', () => {
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION enqueue_listing_change\(\)/i);
    expect(migration).toMatch(/v_event_key\s+text/i);
    expect(migration).toMatch(/VALUES\s*\(\s*v_event_key,/i);
    expect(migration).toMatch(/ON CONFLICT\s*\(event_key\)\s+DO NOTHING/i);
    expect(migration).not.toMatch(/DECLARE[\s\S]*?\bevent_key\s+text\s*;/i);
  });

  it('preserves the trigger function signature and event lifecycle from migration 0009', () => {
    expect(triggerMigration).toMatch(
      /CREATE TRIGGER business_listings_enqueue_change AFTER UPDATE ON business_listings FOR EACH ROW EXECUTE FUNCTION enqueue_listing_change\(\)/i
    );
    expect(originalMigration).toMatch(
      /CREATE OR REPLACE FUNCTION enqueue_listing_change\(\)/i
    );
    for (const eventType of [
      'listing.approved',
      'listing.rejected',
      'listing.archived',
      'listing.price_changed',
      'listing.details_changed',
    ]) {
      expect(migration).toContain(eventType);
    }
    expect(migration).toMatch(/'userIds',\s*v_recipients/);
    expect(migration).toMatch(/RETURN NEW;/);
    expect(migration).not.toMatch(/CREATE\s+TRIGGER|DROP\s+TRIGGER/i);
  });
});
