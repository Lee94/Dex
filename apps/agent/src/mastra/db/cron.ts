/**
 * A tiny 5-field cron matcher (v1.3) — dependency-free, enough for scheduled
 * task re-runs. Fields: minute hour day-of-month month day-of-week. Each field
 * supports a star, a number, "a-b" ranges, star/step and "a-b/step" steps, and
 * comma lists of those. Day-of-month and day-of-week are AND-ed (predictable).
 */

const BOUNDS: Array<[number, number]> = [
  [0, 59], // minute
  [0, 23], // hour
  [1, 31], // day of month
  [1, 12], // month
  [0, 6], // day of week (0 = Sunday)
];

function matchField(expr: string, value: number, min: number, max: number): boolean {
  return expr.split(',').some((partRaw) => {
    const part = partRaw.trim();
    if (part === '*') return true;

    let step = 1;
    let rangeText = part;
    const slash = part.indexOf('/');
    if (slash !== -1) {
      step = Number(part.slice(slash + 1));
      rangeText = part.slice(0, slash);
      if (!Number.isInteger(step) || step <= 0) return false;
    }

    let lo: number;
    let hi: number;
    if (rangeText === '*') {
      lo = min;
      hi = max;
    } else if (rangeText.includes('-')) {
      const [a, b] = rangeText.split('-').map(Number);
      if (!Number.isInteger(a) || !Number.isInteger(b)) return false;
      lo = a;
      hi = b;
    } else {
      const n = Number(rangeText);
      if (!Number.isInteger(n)) return false;
      lo = n;
      hi = n;
    }
    if (lo < min || hi > max || lo > hi) return false;
    if (value < lo || value > hi) return false;
    return (value - lo) % step === 0;
  });
}

/** Validate a 5-field cron expression. */
export function isValidCron(expr: string): boolean {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) return false;
  // A field is valid if it matches at least one value in its range (cheap probe).
  return fields.every((field, i) => {
    const [min, max] = BOUNDS[i];
    for (let v = min; v <= max; v++) if (matchField(field, v, min, max)) return true;
    return false;
  });
}

/** Does `date` satisfy the cron expression (to the minute)? */
export function cronMatches(expr: string, date: Date): boolean {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) return false;
  const values = [
    date.getMinutes(),
    date.getHours(),
    date.getDate(),
    date.getMonth() + 1,
    date.getDay(),
  ];
  return fields.every((field, i) => matchField(field, values[i], BOUNDS[i][0], BOUNDS[i][1]));
}
