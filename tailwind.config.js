/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          // Primary: HCC Gold — all primary CTAs, gold accents, brand text
          primary: '#F5C518',          // HCC Gold - main CTA buttons, primary actions
          'primary-hover': '#D4A017',  // HCC Gold hover
          'primary-light': 'rgba(245,197,24,0.12)',  // Gold tint backgrounds
          // Gold aliases (same as primary)
          gold: '#F5C518',             // HCC exact brand gold
          'gold-hover': '#D4A017',     // HCC gold hover
          'gold-glow': 'rgba(245, 197, 24, 0.15)',  // Gold ambient glow
        },
        // Surfaces: HCC near-black palette (premium, authoritative)
        background: '#0A0A0A',         // Near-black - main bg (HCC style)
        surface: '#1A1A1A',            // HCC black - cards, panels
        'surface-hover': '#2A2A2A',    // Slight lift on hover
        'surface-elevated': '#222222', // Modals, dropdowns
        border: 'rgba(255,255,255,0.1)', // Subtle white border on dark
        // Text
        text: '#FFFFFF',              // Pure white
        'text-muted': '#999999',      // Muted text on dark bg
        'text-disabled': '#666666',   // Disabled state
        // Semantic
        'match-green': '#22C55E',     // Green-500 (location text)
        success: '#22C55E',
        warning: '#F5C518',
        error: '#EF4444',
      },
      fontFamily: {
        display: ['Oswald', 'sans-serif'],
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      fontSize: {
        'hero': ['3.8rem', { lineHeight: '1.05', fontWeight: '700' }],
        'hero-mobile': ['2.4rem', { lineHeight: '1.05', fontWeight: '700' }],
        'section': ['1.4rem', { lineHeight: '1.2', fontWeight: '700' }],
        'card-title': ['0.85rem', { lineHeight: '1.3', fontWeight: '700' }],
        'body': ['1rem', { lineHeight: '1.6', fontWeight: '400' }],
        'small': ['0.9rem', { lineHeight: '1.5', fontWeight: '400' }],
        'caption': ['0.75rem', { lineHeight: '1.4', fontWeight: '400' }],
      },
      spacing: {
        '18': '4.5rem',
        '22': '5.5rem',
        '30': '7.5rem',
      },
      transitionTimingFunction: {
        'smooth': 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(28px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'shimmer': {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.3s ease-out',
        'fade-in-up': 'fade-in-up 0.7s cubic-bezier(0.16, 1, 0.3, 1)',
        'scale-in': 'scale-in 0.3s ease-out',
        'shimmer': 'shimmer 2s linear infinite',
      },
      backgroundImage: {
        'hero-gradient': 'linear-gradient(to top, #0A0A0A 0%, transparent 50%), linear-gradient(to right, rgba(10,10,10,0.9) 0%, transparent 60%)',
      },
      boxShadow: {
        'card': '0 2px 12px rgba(0, 0, 0, 0.08)',
        'card-hover': '0 8px 40px rgba(0, 0, 0, 0.6)',
        'preview': '0 12px 48px rgba(0, 0, 0, 0.8)',
        'gold-glow': '0 4px 20px rgba(245, 197, 24, 0.3)',
      },
    },
  },
  plugins: [
    function({ addUtilities }) {
      addUtilities({
        '.text-shadow': {
          textShadow: '0 2px 4px rgba(0, 0, 0, 0.5)',
        },
        '.text-shadow-lg': {
          textShadow: '2px 4px 12px rgba(0, 0, 0, 0.5)',
        },
        '.line-clamp-1': {
          display: '-webkit-box',
          '-webkit-line-clamp': '1',
          '-webkit-box-orient': 'vertical',
          overflow: 'hidden',
        },
        '.line-clamp-2': {
          display: '-webkit-box',
          '-webkit-line-clamp': '2',
          '-webkit-box-orient': 'vertical',
          overflow: 'hidden',
        },
        '.line-clamp-3': {
          display: '-webkit-box',
          '-webkit-line-clamp': '3',
          '-webkit-box-orient': 'vertical',
          overflow: 'hidden',
        },
        '.scrollbar-hide': {
          '-ms-overflow-style': 'none',
          'scrollbar-width': 'none',
          '&::-webkit-scrollbar': {
            display: 'none',
          },
        },
      })
    },
  ],
}
