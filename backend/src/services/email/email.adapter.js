import { getEnvironment } from '#config/env.js';
import { sendResendEmail } from './resend.provider.js';

export const sendEmail = async message => {
  const environment = getEnvironment();
  if (environment.EMAIL_PROVIDER === 'mock')
    return { id: `mock:${message.idempotencyKey}` };
  return sendResendEmail(message, environment);
};
