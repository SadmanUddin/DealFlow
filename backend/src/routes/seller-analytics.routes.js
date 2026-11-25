import express from 'express';
import { z } from 'zod';
import { getEnvironment } from '#config/env.js';
import {
  authorizeRoles,
  requireAuthentication,
} from '#middleware/auth.middleware.js';
import { getSellerAnalytics } from '#services/seller-analytics.service.js';
import { AppError } from '#utils/app-error.js';
import { listingIdSchema } from '#validations/listing.validation.js';

const router = express.Router();
const range = z.enum(['7', '30', '90', 'all']).default('30');
const query = z.object({ range }).strict();
const idPattern = /^[1-9]\d{0,9}$/;
const comparison = query.extend({
  ids: z
    .string()
    .max(32)
    .transform(value => value.split(','))
    .pipe(z.array(z.string().regex(idPattern)).min(2).max(3))
    .transform(ids => ids.map(Number))
    .refine(
      ids =>
        new Set(ids).size === ids.length && ids.every(id => id <= 2147483647)
    ),
});

router.use(requireAuthentication, authorizeRoles('seller'));

async function sendAnalytics(req, res, { range, ids = [] }) {
  const analytics = await getSellerAnalytics(
    req.user.id,
    range,
    ids,
    getEnvironment().LISTING_VIEW_TRACKING_SINCE
  );
  if (ids.length && analytics.listings.length !== ids.length)
    throw new AppError(404, 'LISTING_NOT_FOUND', 'Listing not found');
  res.json({ analytics });
}

router.get('/overview', (req, res) =>
  sendAnalytics(req, res, query.parse(req.query))
);
router.get('/listings/:id', (req, res) => {
  const { id } = listingIdSchema.parse(req.params);
  z.number().max(2147483647).parse(id);
  return sendAnalytics(req, res, { ...query.parse(req.query), ids: [id] });
});
router.get('/comparison', (req, res) =>
  sendAnalytics(req, res, comparison.parse(req.query))
);

export default router;
