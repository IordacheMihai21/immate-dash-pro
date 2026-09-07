export function formatStatCardMonth(date: Date) {
  return date.toLocaleDateString("en-US", { month: "short" });
}

export function formatStatCardWeekday(date: Date) {
  return date.toLocaleDateString("en-US", { weekday: "long" });
}
