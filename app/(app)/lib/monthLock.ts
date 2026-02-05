function pad2(n: number) {
  return String(n).padStart(2, "0");
}

export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

export function currentMonthKey(now: Date = new Date()): string {
  return monthKey(now);
}

export function isValidISODate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function isDateInMonth(isoDate: string, month: string): boolean {
  if (!isValidISODate(isoDate)) return false;
  return isoDate.startsWith(`${month}-`);
}

export function firstDayOfMonthISO(month: string): string {
  return `${month}-01`;
}

export function assertDateIsInCurrentMonth(isoDate: string, now: Date = new Date()) {
  const current = currentMonthKey(now);
  if (!isDateInMonth(isoDate, current)) {
    return {
      ok: false as const,
      currentMonth: current,
      message: `Locked: you can only add transactions in the current month (${current}).`,
    };
  }
  return { ok: true as const, currentMonth: current };
}

