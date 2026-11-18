import { deleteNotification as deleteOne, getEmailPreferences as getPreferences, listNotifications as list, markAllNotificationsRead as markAll, markNotificationRead as markOne, updateEmailPreferences as updatePreferences } from '#services/notification.service.js';
import { emailPreferenceSchema, notificationQuerySchema, phase6IdSchema } from '#validations/phase6.validation.js';
import { emptyConversationBodySchema } from '#validations/conversation.validation.js';

export const listNotifications = async (req, res) => res.status(200).json(await list(req.user.id, notificationQuerySchema.parse(req.query)));
export const markNotificationRead = async (req, res) => { const { id } = phase6IdSchema.parse(req.params); emptyConversationBodySchema.parse(req.body ?? {}); res.status(200).json({ notification: await markOne(req.user.id, id) }); };
export const markAllNotificationsRead = async (req, res) => { emptyConversationBodySchema.parse(req.body ?? {}); res.status(200).json(await markAll(req.user.id)); };
export const deleteNotification = async (req, res) => { const { id } = phase6IdSchema.parse(req.params); res.status(200).json(await deleteOne(req.user.id, id)); };
export const getEmailPreferences = async (req, res) => res.status(200).json(await getPreferences(req.user.id));
export const updateEmailPreferences = async (req, res) => res.status(200).json(await updatePreferences(req.user.id, emailPreferenceSchema.parse(req.body)));
