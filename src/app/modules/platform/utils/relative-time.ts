export function relativeTime(iso: string | null): string {
  if (!iso) return '—';
  const diffSec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);

  if (diffSec < 60) return 'לפני רגע';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `לפני ${diffMin} דקות`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `לפני ${diffHour} שעות`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 30) return `לפני ${diffDay} ימים`;
  const diffMonth = Math.floor(diffDay / 30);
  if (diffMonth < 12) return `לפני ${diffMonth} חודשים`;
  return `לפני ${Math.floor(diffMonth / 12)} שנים`;
}
