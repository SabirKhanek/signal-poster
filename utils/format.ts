export function formatDate(d: Date): string {
  return d
    .toLocaleString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
    .replace(",", "");
}
