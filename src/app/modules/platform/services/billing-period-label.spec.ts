import { billingPeriodLabel } from './billing-period-label';
describe('billing period labels', () => {
  it('names a rolling cycle by its closing month', () => {
    expect(billingPeriodLabel({period_start:'2026-10-28T18:00:00Z',period_end:'2026-11-28T18:00:00Z'})).toBe('\u05e0\u05d5\u05d1\u05de\u05d1\u05e8 2026');
  });
  it('preserves the October transition', () => {
    expect(billingPeriodLabel({period_start:'2026-10-01T00:00:00Z',period_end:'2026-10-28T18:00:00Z'})).toBe('\u05d0\u05d5\u05e7\u05d8\u05d5\u05d1\u05e8 2026');
  });
  it('preserves historical calendar-month periods', () => {
    expect(billingPeriodLabel({period_start:'2026-09-01T00:00:00Z',period_end:'2026-10-01T00:00:00Z'})).toBe('\u05e1\u05e4\u05d8\u05de\u05d1\u05e8 2026');
  });
});
