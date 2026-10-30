// Rolling billing cycles are named for their Israel-local closing month.
export function billingPeriodLabel(period: { period_start: string; period_end: string }): string {
  const end = new Date(period.period_end);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jerusalem', day: 'numeric', hour: 'numeric', minute: 'numeric', hourCycle: 'h23',
  }).formatToParts(end);
  const get = (name: string) => Number(parts.find(part => part.type === name)?.value);
  const cutoff = get('day') === 28 && get('hour') === 20 && get('minute') === 0;
  return new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', month: 'long', year: 'numeric' })
    .format(cutoff ? end : new Date(period.period_start));
}
