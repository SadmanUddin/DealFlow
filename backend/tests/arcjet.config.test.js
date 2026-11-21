import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  arcjet: vi.fn(options => ({ options })),
  shield: vi.fn(options => ({ kind: 'shield', options })),
  detectBot: vi.fn(options => ({ kind: 'bot', options })),
}));

vi.mock('@arcjet/node', () => ({
  default: mocks.arcjet,
  shield: mocks.shield,
  detectBot: mocks.detectBot,
}));

vi.mock('#config/env.js', () => ({
  getEnvironment: () => ({
    NODE_ENV: 'production',
    ARCJET_KEY: 'mock-key',
    ARCJET_TRUSTED_PROXIES: '10.0.0.0/8, 2001:db8::1',
  }),
}));

const { default: client } = await import('#config/arcjet.js');

describe('Arcjet client configuration', () => {
  it('declares pseudonymous custom characteristics and trusted deployment proxies', () => {
    expect(client.options).toMatchObject({
      key: 'mock-key',
      characteristics: ['userId', 'accountKey'],
      proxies: ['10.0.0.0/8', '2001:db8::1'],
    });
  });

  it('enforces base security rules in production', () => {
    expect(client.options.rules).toEqual([
      { kind: 'shield', options: { mode: 'LIVE' } },
      {
        kind: 'bot',
        options: {
          mode: 'LIVE',
          allow: ['CATEGORY:SEARCH_ENGINE', 'CATEGORY:PREVIEW'],
        },
      },
    ]);
  });
});
