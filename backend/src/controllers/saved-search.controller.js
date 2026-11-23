import {
  createSavedSearch,
  deleteSavedSearch,
  getSavedSearch,
  listSavedSearches,
  updateSavedSearch,
} from '#services/saved-search.service.js';
import {
  createSavedSearchSchema,
  savedSearchId,
  savedSearchPage,
  updateSavedSearchSchema,
} from '#validations/saved-search.validation.js';

const id = req => savedSearchId.parse(req.params).id;
export const list = async (req, res) =>
  res.json(
    await listSavedSearches(req.user.id, savedSearchPage.parse(req.query))
  );
export const detail = async (req, res) =>
  res.json({ savedSearch: await getSavedSearch(req.user.id, id(req)) });
export const create = async (req, res) =>
  res
    .status(201)
    .json({
      savedSearch: await createSavedSearch(
        req.user.id,
        createSavedSearchSchema.parse(req.body)
      ),
    });
export const update = async (req, res) =>
  res.json({
    savedSearch: await updateSavedSearch(
      req.user.id,
      id(req),
      updateSavedSearchSchema.parse(req.body)
    ),
  });
export const remove = async (req, res) => {
  await deleteSavedSearch(req.user.id, id(req));
  res.status(204).end();
};
