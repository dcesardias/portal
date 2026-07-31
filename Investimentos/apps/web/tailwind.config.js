/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Marca AACD — vermelho, calibrado para NÃO cansar a vista: tons claros para
        // fundos/realces (50–200), vermelho encorpado (não-neon) para botões (600),
        // e vermelhos profundos para grandes superfícies (700–900). O #DD0303 puro
        // fica reservado como referência (accentRed) para pequenos detalhes.
        brand: {
          DEFAULT: '#c01f1c',
          50: '#fdf4f3',
          100: '#fbe4e2',
          200: '#f5c6c2',
          300: '#eca09a',
          400: '#df6d66',
          500: '#cf4139',
          600: '#c01f1c',
          700: '#a01a18',
          800: '#831a18',
          900: '#6d1a18',
        },
        // #DD0303 puro — use com parcimônia (badges, ícones pequenos) quando quiser o vermelho exato
        accentRed: '#DD0303',
        // Marca AACD — âmbar de apoio (#FFAA00) em tons 50–900 (core no 500)
        accent: {
          DEFAULT: '#FFAA00',
          50: '#fff9e8',
          100: '#ffefc2',
          200: '#ffe08a',
          300: '#ffce52',
          400: '#ffbb29',
          500: '#FFAA00',
          600: '#db8c00',
          700: '#a66900',
          800: '#784c00',
          900: '#513300',
        },
        ink: {
          DEFAULT: '#0f172a',
          soft: '#475569',
          muted: '#94a3b8',
        },
        surface: {
          DEFAULT: '#ffffff',
          alt: '#f8fafc',
          border: '#e2e8f0',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(15,23,42,.04), 0 6px 20px rgba(15,23,42,.05)',
      },
      borderRadius: {
        xl2: '14px',
      },
    },
  },
  plugins: [],
};
