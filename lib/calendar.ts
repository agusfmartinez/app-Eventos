/**
 * Armado de la grilla del calendario.
 *
 * Todo acá es lógica pura sobre fechas: no toca la base ni React, así que se
 * puede probar sola.
 *
 * Las fechas se manipulan siempre en UTC. Las columnas `DATE` de Postgres
 * llegan a medianoche UTC, y mezclar `getDate()` local con `getUTCDate()`
 * corre los días de lugar en Argentina — el bug clásico de calendarios.
 */

export type MonthKey = string; // "YYYY-MM"
export type DayKey = string; // "YYYY-MM-DD"

const MONTHS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

/** Lunes primero: es como se leen los calendarios acá. */
export const WEEKDAY_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export function toDayKey(date: Date): DayKey {
  return date.toISOString().slice(0, 10);
}

export function toMonthKey(date: Date): MonthKey {
  return date.toISOString().slice(0, 7);
}

export function parseMonthKey(value: string | undefined, fallback: Date): Date {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) {
    return new Date(Date.UTC(fallback.getUTCFullYear(), fallback.getUTCMonth(), 1));
  }
  const [year, month] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1));
}

export function parseDayKey(value: string | undefined, fallback: Date): Date {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return fallback;
  return new Date(`${value}T00:00:00.000Z`);
}

export function monthLabel(firstOfMonth: Date): string {
  return `${MONTHS[firstOfMonth.getUTCMonth()]} de ${firstOfMonth.getUTCFullYear()}`;
}

export function dayLabel(date: Date): string {
  const d = date.getUTCDate();
  return `${d} de ${MONTHS[date.getUTCMonth()]} de ${date.getUTCFullYear()}`;
}

export function addMonths(firstOfMonth: Date, delta: number): Date {
  return new Date(
    Date.UTC(firstOfMonth.getUTCFullYear(), firstOfMonth.getUTCMonth() + delta, 1),
  );
}

export function addDays(date: Date, delta: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + delta);
  return next;
}

/** Índice de día de semana con el lunes en 0. `getUTCDay()` pone el domingo en 0. */
function mondayFirstIndex(date: Date): number {
  return (date.getUTCDay() + 6) % 7;
}

export type CalendarCell = {
  date: Date;
  key: DayKey;
  inMonth: boolean;
};

/**
 * Semanas completas que cubren el mes.
 *
 * Se rellenan los bordes con días del mes anterior y del siguiente para que la
 * grilla sea siempre rectangular. Van marcados con `inMonth: false` para
 * poder atenuarlos.
 */
export function buildMonthGrid(firstOfMonth: Date): CalendarCell[][] {
  const monthIndex = firstOfMonth.getUTCMonth();

  const start = addDays(firstOfMonth, -mondayFirstIndex(firstOfMonth));

  const lastOfMonth = new Date(
    Date.UTC(firstOfMonth.getUTCFullYear(), monthIndex + 1, 0),
  );
  const end = addDays(lastOfMonth, 6 - mondayFirstIndex(lastOfMonth));

  const weeks: CalendarCell[][] = [];
  let cursor = start;

  while (cursor <= end) {
    const week: CalendarCell[] = [];
    for (let i = 0; i < 7; i++) {
      week.push({
        date: cursor,
        key: toDayKey(cursor),
        inMonth: cursor.getUTCMonth() === monthIndex,
      });
      cursor = addDays(cursor, 1);
    }
    weeks.push(week);
  }

  return weeks;
}

/** Etiquetas de hora de la vista de día, arrancando a la hora indicada. */
export function hourLabels(startHour: number, count = 24): string[] {
  return Array.from({ length: count }, (_, i) =>
    `${String((startHour + i) % 24).padStart(2, "0")}:00`,
  );
}
