import express from 'express';
import {
  create,
  detail,
  list,
  remove,
  update,
} from '#controllers/saved-search.controller.js';
import {
  authorizeRoles,
  requireAuthentication,
  requireCsrf,
} from '#middleware/auth.middleware.js';

const router = express.Router();
router.use(requireAuthentication, authorizeRoles('buyer'));
router.get('/', list);
router.get('/:id', detail);
router.post('/', requireCsrf, create);
router.patch('/:id', requireCsrf, update);
router.delete('/:id', requireCsrf, remove);
export default router;
