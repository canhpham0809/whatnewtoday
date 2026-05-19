/**
 * Date Utility for AI Morning News Video Generator
 */

/**
 * Parses a pubDate string from RSS (which could be RFC 2822, ISO 8601, etc.)
 * and returns a standard Date object. If invalid, returns the current Date.
 */
export function parseRssDate(dateStr?: string): Date {
  if (!dateStr) return new Date();
  const parsed = Date.parse(dateStr);
  return isNaN(parsed) ? new Date() : new Date(parsed);
}

/**
 * Formats a date into a clean Vietnamese display format (e.g. "08:00 - Thứ Ba, 19/05/2026")
 */
export function formatVietnameseDate(date: Date): string {
  // Convert to ICT (Vietnam Time, UTC+7)
  const offset = 7 * 60; // ICT is UTC+7
  const utc = date.getTime() + date.getTimezoneOffset() * 60000;
  const vnTime = new Date(utc + offset * 60000);

  const days = ["Chủ Nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];
  const dayName = days[vnTime.getDay()];
  
  const dd = String(vnTime.getDate()).padStart(2, "0");
  const mm = String(vnTime.getMonth() + 1).padStart(2, "0");
  const yyyy = vnTime.getFullYear();
  
  const hh = String(vnTime.getHours()).padStart(2, "0");
  const min = String(vnTime.getMinutes()).padStart(2, "0");

  return `${hh}:${min} - ${dayName}, ${dd}/${mm}/${yyyy}`;
}

/**
 * Checks if a date is within the last N hours
 */
export function isWithinHours(date: Date, hours: number): boolean {
  const diffMs = new Date().getTime() - date.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  return diffHours >= 0 && diffHours <= hours;
}

/**
 * Gets a Date object shifted to Vietnam Time (ICT, UTC+7)
 * so that standard local Date methods return Vietnam-based values.
 */
export function getVietnamTime(): Date {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  const vnOffsetMs = 7 * 60 * 60 * 1000; // ICT is UTC+7
  return new Date(utcMs + vnOffsetMs);
}
