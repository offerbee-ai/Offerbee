/**
 * Splits a Stats figure string into an animatable number plus static affixes.
 * Examples: "$1,240" -> { prefix: "$", target: 1240, suffix: "" }
 *           "65+"    -> { prefix: "",  target: 65,   suffix: "+" }
 *           "3 min"  -> { prefix: "",  target: 3,    suffix: " min" }
 */
export function parseFigure(raw: string): {
  prefix: string;
  target: number;
  suffix: string;
} {
  const match = raw.match(/^(\D*)([\d,]+)(.*)$/);
  if (!match) return { prefix: "", target: 0, suffix: raw };
  const [, prefix, digits, suffix] = match;
  return { prefix, target: parseInt(digits.replace(/,/g, ""), 10), suffix };
}
