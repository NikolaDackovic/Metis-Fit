import type { Request } from 'express';
import type { Kysely } from 'kysely';
import type { DB } from '@grit/database';
import type {
  CreateMemberBody,
  ListMembersQuery,
  MemberDto,
  UpdateMemberBody,
} from '@grit/validation';
import { withStaffTx } from '../../database/tx';
import type { Actor } from '../../middleware/auth';
import { changedFields, writeAudit } from '../../shared/audit';
import { AppError, notFound } from '../../shared/errors';
import { membersRepository as repo, toMemberDto } from './members.repository';

const isUniqueEmail = (e: unknown) =>
  (e as { code?: string; constraint?: string }).code === '23505' &&
  (e as { constraint?: string }).constraint === 'members_email_active_uq';

const emailTaken = () =>
  new AppError('CONFLICT', 'errors.member.email_taken', [
    { path: 'email', message: 'validation.email_taken' },
  ]);

export function createMembersService(db: Kysely<DB>) {
  return {
    async list(query: ListMembersQuery) {
      return withStaffTx(db, async (tx) => {
        const { rows, total } = await repo.list(tx, query);
        return { items: rows, total };
      });
    },

    async get(id: string): Promise<MemberDto> {
      return withStaffTx(db, async (tx) => {
        const row = await repo.findById(tx, id);
        if (!row) throw notFound('member');
        return toMemberDto(row);
      });
    },

    async create(actor: Actor, req: Request, input: CreateMemberBody): Promise<MemberDto> {
      try {
        return await withStaffTx(db, async (tx) => {
          const row = await repo.insert(tx, input, actor.userId);
          const dto = toMemberDto(row);
          await writeAudit(tx, actor, req, {
            action: 'member.create',
            entityType: 'member',
            entityId: row.id,
            diff: { after: { ...input } },
          });
          return dto;
        });
      } catch (e) {
        if (isUniqueEmail(e)) throw emailTaken();
        throw e;
      }
    },

    async update(
      actor: Actor,
      req: Request,
      id: string,
      input: UpdateMemberBody,
    ): Promise<MemberDto> {
      try {
        return await withStaffTx(db, async (tx) => {
          const before = await repo.findById(tx, id, { forUpdate: true });
          if (!before) throw notFound('member');
          const after = await repo.update(tx, id, input);
          const diff = changedFields(toMemberDto(before), toMemberDto(after));
          if (Object.keys(diff.after).length > 0) {
            await writeAudit(tx, actor, req, {
              action: 'member.update',
              entityType: 'member',
              entityId: id,
              diff,
            });
          }
          return toMemberDto(after);
        });
      } catch (e) {
        if (isUniqueEmail(e)) throw emailTaken();
        throw e;
      }
    },

    async deactivate(actor: Actor, req: Request, id: string, reason: string): Promise<MemberDto> {
      return withStaffTx(db, async (tx) => {
        const before = await repo.findById(tx, id, { forUpdate: true });
        if (!before) throw notFound('member');
        if (before.deactivated_at)
          throw new AppError('BUSINESS_RULE', 'errors.member.already_deactivated');
        const after = await repo.deactivate(tx, id);
        await writeAudit(tx, actor, req, {
          action: 'member.deactivate',
          entityType: 'member',
          entityId: id,
          diff: { after: { reason } },
        });
        return toMemberDto(after);
      });
    },
  };
}
