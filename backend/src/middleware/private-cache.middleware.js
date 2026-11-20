const isPrivateApiResponse = req =>
  req.path.startsWith('/api/auth/') || req.path === '/api/users/profile';

export const privateCacheMiddleware = (req, res, next) => {
  if (!isPrivateApiResponse(req)) return next();

  res.set({
    'Cache-Control': 'private, no-store, no-cache, max-age=0, must-revalidate',
    Expires: '0',
    Pragma: 'no-cache',
  });

  // Express otherwise evaluates If-None-Match and can return 304 for a private
  // representation, even though callers must always receive current session data.
  if (req.method === 'GET') {
    delete req.headers['if-none-match'];
    delete req.headers['if-modified-since'];
  }

  next();
};

export default privateCacheMiddleware;
