/** Safe formatting for MISA / attendance clock strings (avoid "Invalid Date" in UI). */

export function formatCheckInClock(raw: string | null | undefined): string | null {
  if (raw == null || String(raw).trim() === "") return null;
  const s = String(raw).trim();

  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    const t = d.toLocaleTimeString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
    });
    if (t && !/invalid/i.test(t)) return t;
  }

  const hm = s.match(/^(\d{1,2}:\d{2})/);
  if (hm) return hm[1];

  return null;
}

/** Header dot: green = checked in, red = not / no data, slate = loading. */
export function attendanceHeaderDotColor(line: string | null, loading: boolean): string {
  if (loading) return "#94A3B8";
  if (line == null) return "#94A3B8";
  if (line.startsWith("Đã chấm")) return "#22C55E";
  return "#EF4444";
}
