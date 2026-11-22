import { z } from 'zod';

/** F14-3: messages between a member and their trainer. */
export const sendMessageBody = z.object({
  body: z
    .string()
    .trim()
    .min(1, { error: 'validation.required' })
    .max(2000, { error: 'validation.too_long' }),
});

export const messageDto = z.object({
  id: z.string(),
  /** True when the reader of the list wrote it. */
  mine: z.boolean(),
  body: z.string(),
  createdAt: z.string(),
  readAt: z.string().nullable(),
});
export type MessageDto = z.infer<typeof messageDto>;

export const conversationDto = z.object({
  /** The other side: a trainer (member's list) or a member (trainer's list). */
  id: z.string(),
  name: z.string(),
  photoUrl: z.string().nullable(),
  /** Can still write (trainer-client link active). */
  open: z.boolean(),
  lastMessage: z.string().nullable(),
  lastAt: z.string().nullable(),
  unread: z.number().int(),
});
export type ConversationDto = z.infer<typeof conversationDto>;

export const messagesQuery = z.object({ before: z.iso.datetime().optional() });
