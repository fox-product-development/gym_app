// constants/theme.ts
// Central design tokens — colours, fonts, spacing
// All screens import from here. Change a value here and it updates everywhere.

export const Colors = {
  bg: "#0A1226",
  card: "#131D38",
  card2: "#1A2645",
  line: "rgba(255,255,255,0.06)",
  line2: "rgba(255,255,255,0.10)",
  text: "#ffffff",
  sec: "rgba(255,255,255,0.6)",
  ter: "rgba(255,255,255,0.35)",
  qua: "rgba(255,255,255,0.18)",
  accent: "#FF7763",
  accentDim: "rgba(255,119,99,0.16)",
  accentInk: "#1A0A06",
  warn: "#F2B564",
  tabBg: "rgba(10,18,38,0.92)",
};

export const Fonts = {
  mono: "Courier", // swapped for a real monospace — will update when we add custom fonts
  sans: "System", // iOS system font (SF Pro)
};

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
};

export const Spacing = {
  screen: 20, // standard horizontal padding on all screens
};
