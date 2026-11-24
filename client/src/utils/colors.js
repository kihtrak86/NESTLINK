// Accent palette for icons and badges. Each colour reads well on white and on black.
const PALETTE = [
  "#0070f3", // blue
  "#8e4ec6", // violet
  "#e93d82", // pink
  "#f76b15", // orange
  "#30a46c", // green
  "#12a594", // teal
  "#e5484d", // red
  "#3e63dd", // indigo
];

export function colorFor(text = "") {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

// Tinted badge style: coloured text, faint fill, faint border
export function badgeStyle(text) {
  const c = colorFor(text);
  return { color: c, backgroundColor: `${c}1a`, borderColor: `${c}40` };
}
