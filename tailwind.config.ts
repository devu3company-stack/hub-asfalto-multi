import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: "#F07A1E", dark: "#C25A14", text: "#A84A0C", soft: "#FDEBDD" },
        graphite: { DEFAULT: "#4E4B4C", dark: "#2E2C2D", muted: "#6B6768" },
        surface: { DEFAULT: "#F4F3F2", line: "#ECE9E7" },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        display: ["Montserrat", "Inter", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
