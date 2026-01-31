import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Gentleman's Club / Cigar Lounge Theme
        // Rich, sophisticated colors inspired by leather, whiskey, cigars
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        chart: {
          "1": "hsl(var(--chart-1))",
          "2": "hsl(var(--chart-2))",
          "3": "hsl(var(--chart-3))",
          "4": "hsl(var(--chart-4))",
          "5": "hsl(var(--chart-5))",
        },
        // Custom theme colors
        cream: {
          50: "#FDFCF8",
          100: "#F9F6ED",
          200: "#F3ECDA",
          300: "#E8DFC4",
          400: "#D9CEAA",
          500: "#C7B98F",
        },
        leather: {
          50: "#F5F0EB",
          100: "#E8DED3",
          200: "#D4C4B0",
          300: "#B8A189",
          400: "#8B7355",
          500: "#6B5344",
          600: "#4A3728",
          700: "#352718",
          800: "#231A10",
          900: "#150F0A",
        },
        whiskey: {
          50: "#FDF5E8",
          100: "#FAE8CC",
          200: "#F5D199",
          300: "#E8B366",
          400: "#D4943D",
          500: "#B87333",
          600: "#8B5A2B",
          700: "#5E3D1D",
          800: "#3D2712",
          900: "#1F1409",
        },
        forest: {
          50: "#F0F5F1",
          100: "#DCE8DF",
          200: "#B8D1BE",
          300: "#8FB59A",
          400: "#5E9A6F",
          500: "#3D7A4F",
          600: "#2D5A3A",
          700: "#1E3D27",
          800: "#122618",
          900: "#0A150D",
        },
        gold: {
          50: "#FBF8E8",
          100: "#F5EECC",
          200: "#EBDD99",
          300: "#DCC866",
          400: "#C9AE3D",
          500: "#A8912F",
          600: "#7D6B23",
          700: "#524617",
          800: "#2E270D",
          900: "#171306",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        display: ["var(--font-playfair)", "Georgia", "serif"],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      boxShadow: {
        "inner-glow": "inset 0 1px 0 0 rgba(255, 255, 255, 0.05)",
        "gold-glow": "0 0 20px rgba(200, 174, 61, 0.15)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
