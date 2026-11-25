import { once } from 'node:events';

if (process.env.NODE_ENV !== 'test' || process.env.EMAIL_PROVIDER !== 'mock') {
  throw new Error('The benchmark email mock requires test mode.');
}

let fail = false;
let failures = 0;
let paused;
export const failNextEmail = () => {
  fail = true;
};
export const emailFailures = () => failures;
export const pauseNextEmail = onPause => {
  paused = onPause;
};
export async function sendEmail(message) {
  if (fail) {
    fail = false;
    failures++;
    throw new Error('Synthetic temporary provider failure');
  }
  if (paused) {
    const onPause = paused;
    paused = undefined;
    onPause();
    await once(process, 'disconnect');
  }
  return { id: 'mock:' + message.idempotencyKey };
}
