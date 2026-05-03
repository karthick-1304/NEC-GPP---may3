/**
 * Convert an ISO-8601 / SQL datetime string (or anything new Date() understands)
 * to the value expected by an `<input type="datetime-local">`: YYYY-MM-DDTHH:mm
 * in the user's local timezone (which is what datetime-local displays).
 */
export const toLocalInput = (input: string | Date | null | undefined): string => {
  if (!input) return '';
  const d = typeof input === 'string' ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/**
 * Convert a `<input type="datetime-local">` value back to an ISO string. The
 * input has no timezone info, so we treat it as the user's local time and
 * emit a full ISO with offset.
 */
export const localInputToIso = (v: string): string | null => {
  if (!v) return null;
  // Parse as local time
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
};
