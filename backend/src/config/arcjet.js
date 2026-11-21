import arcjet, { shield, detectBot } from '@arcjet/node';
import { getEnvironment } from '#config/env.js';

const environment = getEnvironment();
const mode = environment.NODE_ENV === 'production' ? 'LIVE' : 'DRY_RUN';
const trustedProxies = environment.ARCJET_TRUSTED_PROXIES.split(',')
  .map(proxy => proxy.trim())
  .filter(Boolean);

const aj = arcjet({
  key: environment.ARCJET_KEY,
  characteristics: ['userId', 'accountKey'],
  ...(trustedProxies.length ? { proxies: trustedProxies } : {}),
  rules: [
    shield({
      mode,
    }),
    detectBot({
      mode,
      allow: ['CATEGORY:SEARCH_ENGINE', 'CATEGORY:PREVIEW'],
    }),
  ],
});

export default aj;
