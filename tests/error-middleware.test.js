import { describe, expect, it, vi } from 'vitest';

vi.mock('#config/logger.js', () => ({ default: { error: vi.fn() } }));

const { errorMiddleware } = await import('#middleware/error.middleware.js');

describe('error middleware', () => {
  it('delegates stream failures after headers are sent to Express', () => {
    const error = new Error('document stream failed');
    const next = vi.fn();
    const res = { headersSent: true };

    errorMiddleware(error, { method: 'GET', path: '/documents/7/download' }, res, next);

    expect(next).toHaveBeenCalledWith(error);
    expect(res).not.toHaveProperty('status');
  });

  it('returns a sanitized JSON error when the response has not started', () => {
    const next = vi.fn();
    const res = {
      headersSent: false,
      status: vi.fn(function status(value) { this.statusCode = value; return this; }),
      json: vi.fn(function json(value) { this.body = value; return this; }),
    };

    errorMiddleware(new Error('private database detail'), { method: 'GET', path: '/api/test' }, res, next);

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred' } });
    expect(JSON.stringify(res.body)).not.toContain('private database detail');
  });
});
