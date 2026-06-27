import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Paleta ClipForge
        bg: "#0c0c0f",
        surface: {
          DEFAULT: "#131318",
          2: "#1a1a22",
          3: "#21212c",
        },
        purple: {
          DEFAULT: "#7c6df5",
          dim: "rgba(124,109,245,0.12)",
          border: "rgba(124,109,245,0.25)",
          light: "#a99cf8",
        },
        green: {
          DEFAULT: "#3ecf8e",
          dim: "rgba(62,207,142,0.10)",
          border: "rgba(62,207,142,0.22)",
        },
        border: {
          DEFAULT: "rgba(255,255,255,0.07)",
          strong: "rgba(255,255,255,0.12)",
        },
        text: {
          DEFAULT: "#f0f0f5",
          2: "#9090a8",
          3: "#55556a",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        tight: ["Inter Tight", "sans-serif"],
      },
      borderRadius: {
        sm: "6px",
        DEFAULT: "10px",
        lg: "14px",
        xl: "18px",
      },
    },
  },
  plugins: [],
};

export default config;
