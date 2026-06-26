/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0a0e16',
        surface: '#0b1019',
        panel: '#101622',
        panel2: '#0c111b',
        line: '#1f2838',
        line2: '#283348',
        muted: '#61708c',
        subtle: '#7c8aa3',
        soft: '#aeb8cc',
        text: '#e6ebf4',
        accent: '#57c7e8',
        violet: '#9b8cf0',
        ok: '#46c66a',
        warn: '#e0ad3f',
        danger: '#ec6a5e',
        // asset-type hues
        t_domain: '#57c7e8',
        t_subdomain: '#4fd6b8',
        t_ip: '#7aa2f7',
        t_service: '#e0ad3f',
        t_cert: '#9b8cf0',
        t_tech: '#e879b9',
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0.2', transform: 'translateY(7px)' },
          '100%': { opacity: '1', transform: 'none' },
        },
        blink: { '0%,100%': { opacity: '1' }, '50%': { opacity: '0.25' } },
      },
      animation: {
        fadeIn: 'fadeIn 0.25s ease',
        blink: 'blink 2.2s infinite',
      },
    },
  },
  plugins: [],
};
