export const privateCacheMiddleware = (req, res, next) => {
  const path = req.path.toLowerCase().replace(/\/+$/, '');
  if (path !== '/api' && !path.startsWith('/api/')) return next();

  if (
    ['GET', 'HEAD'].includes(req.method) &&
    (path === '/api/listings' || /^\/api\/listings\/[1-9]\d*$/.test(path))
  ) {
    // Availability can change as soon as both parties confirm closing.
    res.set('Cache-Control', 'public, no-cache');
    return next();
  }

  res.set({
    'Cache-Control': 'private, no-store, max-age=0',
    Expires: '0',
    Pragma: 'no-cache',
  });

  // Conditional GETs still reach Arcjet before Express can return 304. Private
  // representations must always be fetched through the authenticated API.
  if (['GET', 'HEAD'].includes(req.method)) {
    delete req.headers['if-none-match'];
    delete req.headers['if-modified-since'];
  }

  next();
};

export default privateCacheMiddleware;
