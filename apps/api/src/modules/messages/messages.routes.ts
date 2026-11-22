import { z } from 'zod';
import {
  conversationDto,
  idParams,
  messageDto,
  messagesQuery,
  sendMessageBody,
} from '@grit/validation';
import { createAttemptLimiter } from '../../shared/attempt-limiter';
import { access, defineRoute } from '../../shared/route';
import { createMessageService } from './messages.service';

const TAG = ['Messages'];
// Enough for a real conversation, not for spam.
const sendLimiter = createAttemptLimiter({ max: 30, windowMs: 60_000 });
const svc = (
  deps: Parameters<typeof createMessageService>[0] extends infer D
    ? { db: D; media: Parameters<typeof createMessageService>[1] }
    : never,
) => createMessageService(deps.db, deps.media);

export const messageRoutes = [
  defineRoute({
    method: 'get',
    path: '/me/conversations',
    access: access.self,
    summary: 'My conversations with my trainers',
    tags: TAG,
    response: z.array(conversationDto),
    handler: async ({ actor, deps }) => ({ data: await svc(deps).myConversations(actor!) }),
  }),
  defineRoute({
    method: 'get',
    path: '/me/conversations/:id/messages',
    access: access.self,
    summary: 'Messages with one trainer (latest 50; ?before= for older); marks them read',
    tags: TAG,
    params: idParams,
    query: messagesQuery,
    response: z.array(messageDto),
    handler: async ({ actor, params, query, deps }) => ({
      data: await svc(deps).memberMessages(actor!, params.id, query.before),
    }),
  }),
  defineRoute({
    method: 'post',
    path: '/me/conversations/:id/messages',
    access: access.self,
    summary: 'Write to my trainer',
    tags: TAG,
    params: idParams,
    body: sendMessageBody,
    response: messageDto,
    handler: async ({ actor, params, body, deps }) => {
      sendLimiter.hit(`m:${actor!.userId}`);
      return { status: 201, data: await svc(deps).memberSend(actor!, params.id, body.body) };
    },
  }),
  defineRoute({
    method: 'get',
    path: '/admin/my-conversations',
    access: access.can('schedule.own'),
    summary: 'Conversations of the signed-in trainer with their clients',
    tags: TAG,
    response: z.array(conversationDto),
    handler: async ({ actor, deps }) => ({ data: await svc(deps).trainerConversations(actor!) }),
  }),
  defineRoute({
    method: 'get',
    path: '/admin/my-conversations/:id/messages',
    access: access.can('schedule.own'),
    summary: 'Messages with one client (latest 50; ?before= for older); marks them read',
    tags: TAG,
    params: idParams,
    query: messagesQuery,
    response: z.array(messageDto),
    handler: async ({ actor, params, query, deps }) => ({
      data: await svc(deps).trainerMessages(actor!, params.id, query.before),
    }),
  }),
  defineRoute({
    method: 'post',
    path: '/admin/my-conversations/:id/messages',
    access: access.can('schedule.own'),
    summary: 'Write to a client',
    tags: TAG,
    params: idParams,
    body: sendMessageBody,
    response: messageDto,
    handler: async ({ actor, params, body, deps }) => {
      sendLimiter.hit(`t:${actor!.userId}`);
      return { status: 201, data: await svc(deps).trainerSend(actor!, params.id, body.body) };
    },
  }),
];
