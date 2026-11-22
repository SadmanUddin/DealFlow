import { z } from 'zod';

export const documentParamsSchema = z.object({
  conversationId: z.coerce.number().int().positive(),
  documentId: z.coerce.number().int().positive().optional(),
});
export const documentListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const sanitizeFilename = value => {
  const base =
    String(value ?? '')
      .replace(/\\/g, '/')
      .split('/')
      .pop() ?? '';
  const safe = Array.from(base.toWellFormed().normalize('NFKC'), character => {
    const code = character.codePointAt(0);
    return code < 32 || code === 127 || '"<>:|?*'.includes(character)
      ? '_'
      : character;
  })
    .join('')
    .trim()
    .replace(/\.{2,}/g, '.');
  return Array.from(safe || 'document')
    .slice(0, 255)
    .join('');
};
