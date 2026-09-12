/**
 * One hue, stepped by lightness. Spending is a red ramp, income a green one,
 * so a chart says "this is money going out" before you read a single label —
 * and no slice invents a colour that means nothing.
 *
 * Lives outside the chart component so the server can build a matching legend.
 */
export function ramp(
  tone: "expense" | "income",
  index: number,
  total: number,
): string {
  const hue = tone === "expense" ? 3 : 159;
  const sat = tone === "expense" ? 100 : 74;
  const top = 64;
  const bottom = 26;
  const step = total > 1 ? (top - bottom) / (total - 1) : 0;
  return `hsl(${hue} ${sat}% ${top - step * index}%)`;
}
