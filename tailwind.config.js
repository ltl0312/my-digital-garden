/** @type {import('tailwindcss').Config} */
// DAWN 设计语言（spec 第 3 章）：颜色 / 圆角 / 阴影 / 动效全部指向 main.css 里的 CSS 变量，
// 这样亮暗两套只换变量取值，Tailwind 类名无需区分主题。
export default {
  content: ['./app/**/*.{vue,js,ts}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'Inter', '"PingFang SC"', '"Microsoft YaHei"', 'system-ui', 'sans-serif'],
        serif: ['"Newsreader"', 'Georgia', 'serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      colors: {
        // ---- DAWN 语义令牌（亮暗由 CSS 变量切换） ----
        canvas: 'var(--canvas)',
        surface: 'var(--surface)',
        'surface-2': 'var(--surface-2)',
        'surface-3': 'var(--surface-3)',
        line: 'var(--line)',
        ink: 'var(--ink)',
        'ink-2': 'var(--ink-2)',
        'ink-3': 'var(--ink-3)',
        accent: 'var(--accent)',
        seedling: 'var(--seedling)',
        growing: 'var(--growing)',
        evergreen: 'var(--evergreen)',
        danger: 'var(--danger)',

        // ---- 兼容色阶（既有 markup 大量使用，保持可用；色相已对齐 DAWN 强调色） ----
        garden: {
          50: '#f0faf5', 100: '#dcf5e8', 200: '#bbe9d2', 300: '#86d5b1',
          400: '#4bbd8c', 500: '#22a06e', 600: '#0E7C5A', 700: '#0c6849',
          800: '#0a543c', 900: '#084231', 950: '#032219',
        },
        obsidian: {
          950: '#080B11', 900: '#0A0D13', 800: '#11151E', 700: '#151A24', 600: '#1C222E',
        },
      },
      fontSize: {
        // 字号阶梯（spec 3.2）：11 / 12 / 13 / 14 / 15 / 17 / 20 / 24 / 30 / 38 / 46
        '2xs': ['11px', { lineHeight: '1.5' }],
        '3xs': ['10px', { lineHeight: '1.4' }], // 仅用于存量迁移过渡；界面文字硬性下限 12px
        'ds-sm': ['13px', { lineHeight: '1.6' }],
        'ds-base': ['15px', { lineHeight: '1.6' }],
        'ds-lg': ['17px', { lineHeight: '1.4' }],
        'ds-xl': ['20px', { lineHeight: '1.35' }],
        'ds-2xl': ['24px', { lineHeight: '1.3' }],
        'ds-3xl': ['30px', { lineHeight: '1.25' }],
        'ds-4xl': ['38px', { lineHeight: '1.2' }],
      },
      lineHeight: {
        ui: '1.6',
        summary: '1.75',
        prose: '1.85',
        title: '1.28',
      },
      borderRadius: {
        ctl: 'var(--r-8)',
        card: 'var(--r-16)',
        overlay: 'var(--r-20)',
      },
      boxShadow: {
        ds1: 'var(--shadow-1)',
        ds2: 'var(--shadow-2)',
        ds3: 'var(--shadow-3)',
      },
      spacing: {
        rail: 'var(--rail-w)',
        header: 'var(--header-h)',
        toc: 'var(--toc-w)',
        measure: 'var(--measure)',
      },
      transitionTimingFunction: {
        dawn: 'cubic-bezier(0.32, 0.72, 0, 1)',
      },
      transitionDuration: {
        micro: '120ms',
        base: '200ms',
        drawer: '320ms',
      },
      animation: {
        'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        float: 'float 6s ease-in-out infinite',
        glow: 'glow 2s ease-in-out infinite alternate',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        glow: {
          '0%': { opacity: '0.4', filter: 'drop-shadow(0 0 8px rgba(34, 160, 110, 0.35))' },
          '100%': { opacity: '0.8', filter: 'drop-shadow(0 0 16px rgba(34, 160, 110, 0.7))' },
        },
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
}
