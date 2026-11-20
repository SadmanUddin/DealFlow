export const attachVerifiedSession = async (
  app,
  request,
  response,
  email,
  password,
  state
) => {
  const { decryptVerificationToken } =
    await import('../../src/services/auth.service.js');
  const event = state.outbox_events.at(-1);
  if (!event) throw new Error('Expected mocked verification outbox event');
  const token = decryptVerificationToken(event.payload.encryptedToken);
  const verified = await request(app)
    .post('/api/auth/verify-email')
    .send({ token });
  if (verified.status !== 200)
    throw new Error(
      `Expected verification success; received ${verified.status}`
    );
  const login = await request(app)
    .post('/api/auth/sign-in')
    .send({ email, password });
  if (login.status !== 200)
    throw new Error(`Expected verified sign-in; received ${login.status}`);
  response.headers['set-cookie'] = login.headers['set-cookie'];
  response.body.csrfToken = login.body.csrfToken;
  state.outbox_events.splice(state.outbox_events.indexOf(event), 1);
  return response;
};
