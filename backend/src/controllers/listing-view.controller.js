import { z } from 'zod';
import { getEnvironment } from '#config/env.js';
import { recordListingView } from '#services/listing-view.service.js';
import { AppError } from '#utils/app-error.js';
import { listingIdSchema } from '#validations/listing.validation.js';

const viewBody = z.strictObject({ consent: z.literal(true) });

export async function trackListingView(req, res) {
  const environment = getEnvironment();
  const allowedOrigin = environment.CORS_ORIGINS.split(',').map(value =>
    value.trim()
  );
  if (
    !allowedOrigin.includes(req.get('origin')) ||
    !['cors', 'same-origin'].includes(req.get('sec-fetch-mode')) ||
    req.get('sec-fetch-dest') !== 'empty' ||
    !req.is('application/json')
  )
    throw new AppError(
      403,
      'VIEW_REQUEST_DENIED',
      'Listing view request is not eligible'
    );

  const { id } = listingIdSchema.parse(req.params);
  z.number().max(2147483647).parse(id);
  viewBody.parse(req.body);
  if (req.get('sec-gpc') !== '1' && req.get('dnt') !== '1') {
    await recordListingView(id, req.user, {
      since: environment.LISTING_VIEW_TRACKING_SINCE,
      secret: environment.JWT_SECRET,
    });
  }
  res.status(204).end();
}
