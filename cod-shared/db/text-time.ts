export function isoText(timestampExpression: string): string {
  return `to_char((${timestampExpression}) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;
}
