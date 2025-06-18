import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        'display': ['var(--font-cinzel)', 'serif'],
        'sans': ['var(--font-roboto)', 'sans-serif'],
      },
      colors: {
        'deco-dark': '#0A2E36',
        'deco-teal': '#07485B',
        'deco-gold': '#C5A05C',
        'deco-brass': '#B18F42',
        'deco-ivory': '#F0EAD6',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        glitch: {
          '2%, 64%': { transform: 'translate(2px, 0) skew(0deg)' },
          '4%, 60%': { transform: 'translate(-2px, 0) skew(0deg)' },
          '62%': { transform: 'translate(0, 0) skew(5deg)' },
        }
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-out forwards',
        'glitch': 'glitch 1.5s linear infinite'
      }
    },
  },
  plugins: [],
};
export default config;
