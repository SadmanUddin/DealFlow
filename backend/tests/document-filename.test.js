import { expect, it } from 'vitest';
import { sanitizeFilename } from '#validations/document.validation.js';

it('keeps filenames valid for UTF-8 attachment headers after truncation', () => {
  const name = sanitizeFilename(`${'x'.repeat(254)}😀.pdf`);
  expect(Array.from(name)).toHaveLength(255);
  expect(() => encodeURIComponent(name)).not.toThrow();
  expect(() =>
    encodeURIComponent(sanitizeFilename('draft\ud800.pdf'))
  ).not.toThrow();
});
