export function formatDateMDY(value?: string | null): string {
  if (!value) return "—";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const [y, m, d] = value.split("-");
  return `${m}/${d}/${y}`;
}
