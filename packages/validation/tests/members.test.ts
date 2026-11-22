import { describe, expect, it } from 'vitest';
import { createMemberBody, listMembersQuery, updateMemberBody } from '../src';

describe('createMemberBody', () => {
  it('normalizes email and phone', () => {
    const v = createMemberBody.parse({
      firstName: ' Marko ',
      lastName: 'Marković',
      email: ' Marko@Example.COM ',
      phone: '+381 62 1090-771',
    });
    expect(v).toMatchObject({
      firstName: 'Marko',
      email: 'marko@example.com',
      phone: '+381621090771',
    });
  });

  it('requires email or phone', () => {
    const r = createMemberBody.safeParse({ firstName: 'A', lastName: 'B' });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe('validation.contact_required');
  });

  it('treats empty strings as missing', () => {
    const v = createMemberBody.parse({
      firstName: 'A',
      lastName: 'B',
      email: '',
      phone: '0601234567',
    });
    expect(v.email).toBeNull();
  });

  it('rejects unknown fields (no mass assignment)', () => {
    expect(
      createMemberBody.safeParse({
        firstName: 'A',
        lastName: 'B',
        phone: '0601234567',
        userId: 'x',
      }).success,
    ).toBe(false);
  });

  it('returns translation keys as messages', () => {
    const r = createMemberBody.safeParse({ firstName: '', lastName: 'B', email: 'nope' });
    const messages = r.error?.issues.map((i) => i.message) ?? [];
    expect(messages.every((m) => m.startsWith('validation.'))).toBe(true);
  });
});

describe('updateMemberBody', () => {
  it('rejects empty updates', () => {
    expect(updateMemberBody.safeParse({}).success).toBe(false);
  });
});

describe('listMembersQuery', () => {
  it('applies defaults and caps page size', () => {
    expect(listMembersQuery.parse({})).toMatchObject({
      page: 1,
      pageSize: 25,
      includeDeactivated: false,
    });
    expect(listMembersQuery.safeParse({ pageSize: '500' }).success).toBe(false);
  });
});
