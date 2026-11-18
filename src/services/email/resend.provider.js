export const sendResendEmail = async (message, environment) => {
  if (!environment.RESEND_API_KEY) {
    const error = new Error('Email provider is not configured');
    error.permanent = true;
    throw error;
  }
  const response = await globalThis.fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${environment.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': message.idempotencyKey },
    body: JSON.stringify({ from: environment.EMAIL_FROM, to: [message.to], subject: message.subject, html: message.html, text: message.text }),
    signal: globalThis.AbortSignal.any([message.signal, globalThis.AbortSignal.timeout(10000)].filter(Boolean)),
  });
  if (!response.ok) {
    const providerError = await response.json().catch(() => null);
    const errorDescription = JSON.stringify(providerError ?? {});
    const error = new Error(`Email provider returned HTTP ${response.status}`);
    const retryableConflict = response.status === 409 && errorDescription.includes('concurrent_idempotent_requests');
    error.permanent = response.status >= 400 && response.status < 500 && ![408, 429].includes(response.status) && !retryableConflict;
    throw error;
  }
  return response.json();
};
