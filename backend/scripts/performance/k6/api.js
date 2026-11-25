import { timingSafeEqual } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { authenticateUser, createSession } from '#services/auth.service.js';
import {
  accounts,
  challengeHeader,
  identity,
  identityPath,
  password,
  sessionsPath,
} from './config.js';

export async function startBenchmarkApi(app, pool, instance) {
  if (
    !process.send ||
    process.env.NODE_ENV !== 'test' ||
    process.env.EMAIL_PROVIDER !== 'mock' ||
    process.env.DOCUMENT_STORAGE_DRIVER !== 'mock' ||
    process.env.ADMIN_MFA_REQUIRED !== 'false'
  ) {
    throw new Error('The k6 API requires the isolated benchmark launcher.');
  }
  const challenge = process.env.DEALFLOW_K6_CHALLENGE;
  if (!/^[a-f0-9]{64}$/.test(challenge ?? '')) {
    throw new Error('The benchmark launcher challenge is missing.');
  }
  const {
    rows: [dataset],
  } = await pool.query(`
    SELECT
      (SELECT count(*)::int FROM users) AS users,
      (SELECT count(*)::int FROM users WHERE email = 'perf-' || id || '@example.test'
        AND name = 'Synthetic user ' || id) AS synthetic,
      (SELECT count(*)::int FROM users WHERE
        (id = 1 AND role = 'buyer') OR (id = 10 AND role = 'seller') OR (id = 100 AND role = 'admin')) AS roles,
      (SELECT count(*)::int FROM business_listings) AS listings,
      (SELECT count(*)::int FROM conversations) AS conversations,
      (SELECT count(*)::int FROM messages) AS messages,
      (SELECT min(id) FROM deals WHERE buyer_id = 1) AS "dealId",
      current_setting('server_version_num')::int / 10000 AS "postgresMajor",
      (SELECT system_identifier::text FROM pg_control_system()) AS "systemId"
  `);
  if (
    dataset.users !== 100 ||
    dataset.synthetic !== 100 ||
    dataset.roles !== 3 ||
    dataset.postgresMajor !== 17 ||
    dataset.systemId !== process.env.DEALFLOW_K6_DATABASE_ID ||
    dataset.listings < 500 ||
    dataset.conversations < 500 ||
    dataset.messages < 5000 ||
    !dataset.dealId
  ) {
    throw new Error(
      'The PostgreSQL instance or synthetic benchmark fixtures could not be verified.'
    );
  }
  const attestation = {
    identity,
    database: instance.name,
    postgresMajor: dataset.postgresMajor,
    mockIntegrations: true,
    dataset: {
      users: dataset.users,
      listings: dataset.listings,
      conversations: dataset.conversations,
      messages: dataset.messages,
      dealId: dataset.dealId,
    },
  };
  const expected = Buffer.from(challenge);
  let provisioned = false;
  function json(res, status, body) {
    res.writeHead(status, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    });
    res.end(JSON.stringify(body));
  }
  const server = createServer(async (req, res) => {
    const supplied = req.headers[challengeHeader.toLowerCase()];
    if (
      typeof supplied !== 'string' ||
      Buffer.byteLength(supplied) !== expected.length ||
      !timingSafeEqual(Buffer.from(supplied), expected)
    ) {
      json(res, 404, {});
      return;
    }
    if (req.url === identityPath && req.method === 'GET') {
      json(res, 200, attestation);
    } else if (req.url === sessionsPath && req.method === 'POST') {
      if (provisioned) {
        json(res, 409, {});
        return;
      }
      provisioned = true;
      try {
        const slots = Number(process.env.DEALFLOW_K6_SESSION_SLOTS);
        if (!Number.isInteger(slots) || slots < 1 || slots > 100)
          throw new Error();
        const roles = process.env.DEALFLOW_K6_ROLES.split(',').filter(Boolean);
        const sessions = {};
        for (const role of roles) {
          const user = await authenticateUser({
            email: 'perf-' + accounts[role] + '@example.test',
            password,
          });
          if (user.role !== role || user.id !== accounts[role])
            throw new Error();
          sessions[role] = [];
          for (let index = 0; index < slots; index++) {
            const session = await createSession(user);
            sessions[role].push(session.accessToken);
          }
        }
        json(res, 200, sessions);
      } catch {
        json(res, 503, {});
      }
    } else {
      app(req, res);
    }
  });
  const listening = once(server, 'listening');
  server.listen(0, '127.0.0.1');
  await listening;
  process.send({
    type: 'k6-ready',
    origin: 'http://127.0.0.1:' + server.address().port,
  });
  return server;
}
