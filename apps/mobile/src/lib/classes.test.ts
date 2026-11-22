import type { BookingDto, ClassSessionDto } from '@grit/validation';
import { describe, expect, it } from 'vitest';
import { classAction, nextDays } from './classes';

const now = new Date('2026-11-17T12:00:00Z');
const session = (over: Partial<ClassSessionDto> = {}): ClassSessionDto => ({
  id: 'c1',
  classTypeId: 't',
  typeKey: 'crossfit',
  typeName: 'CrossFit',
  color: '#E54E26',
  zone: 'crossfit',
  trainer: null,
  startsAt: '2026-11-18T18:00:00Z',
  endsAt: '2026-11-18T19:00:00Z',
  capacity: 10,
  booked: 3,
  waitlisted: 0,
  spotsLeft: 7,
  roomKey: null,
  roomName: null,
  note: null,
  status: 'scheduled',
  bookingOpensAt: '2026-11-11T18:00:00Z',
  ...over,
});
const booking = (status: BookingDto['status']) => ({ status }) as BookingDto;
const rules = {
  bookingWindowDays: 7,
  cancelCutoffMinutes: 120,
  strikeLimit: 3,
  strikeWindowDays: 30,
  banDays: 7,
};

describe('classAction', () => {
  it('offers booking, waitlist, or tells when booking opens', () => {
    expect(classAction(session(), undefined, rules, now).kind).toBe('book');
    expect(classAction(session({ spotsLeft: 0 }), undefined, rules, now).kind).toBe('waitlist');
    expect(
      classAction(session({ bookingOpensAt: '2026-11-20T00:00:00Z' }), undefined, rules, now),
    ).toEqual({ kind: 'not_open', opensAt: '2026-11-20T00:00:00Z' });
  });

  it('warns about a late cancellation within the cutoff', () => {
    expect(classAction(session(), booking('confirmed'), rules, now)).toEqual({
      kind: 'cancel',
      late: false,
    });
    const soon = session({ startsAt: '2026-11-17T13:00:00Z' });
    expect(classAction(soon, booking('confirmed'), rules, now)).toEqual({
      kind: 'cancel',
      late: true,
    });
  });

  it('handles waitlist, started and cancelled sessions', () => {
    expect(classAction(session(), booking('waitlisted'), rules, now).kind).toBe('leave_waitlist');
    const started = session({ startsAt: '2026-11-17T11:30:00Z' });
    expect(classAction(started, undefined, rules, now).kind).toBe('closed');
    expect(classAction(started, booking('confirmed'), rules, now).kind).toBe('closed');
    expect(classAction(session({ status: 'cancelled' }), undefined, rules, now).kind).toBe(
      'cancelled',
    );
  });
});

describe('nextDays', () => {
  it('crosses month boundaries', () => {
    expect(nextDays('2026-11-29', 3)).toEqual(['2026-11-29', '2026-11-30', '2026-12-01']);
  });
});
