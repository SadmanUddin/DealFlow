const isPublicListingRead = req =>
  ['GET', 'HEAD'].includes(req.method) &&
  (req.path === '/api/listings' ||
    /^\/api\/listings\/[1-9]\d*$/.test(req.path));

const isApiRequest = req => req.path === '/api' || req.path.startsWith('/api/');

export const privateCacheMiddleware = (req, res, next) => {
  if (!isApiRequest(req)) return next();

  if (isPublicListingRead(req)) {
    res.set(
      'Cache-Control',
      'public, max-age=30, s-maxage=60, stale-while-revalidate=120'
    );
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
