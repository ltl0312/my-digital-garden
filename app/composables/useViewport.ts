// 断点单源（spec 第 4 章 + 交付物 MOBILE-PARITY §5 ④）
//
// 背景：断点值此前散落在四处 —— Tailwind 前缀（sm=640 / lg=1024）、
// layouts/default.vue 的 isNarrow（1024）、GraphView.minScale（768）、
// main.css 的媒体查询（640）。E4 就因 md(768) 与 lg(1024) 混用出现过
// 「768–1023 图标栏已隐藏但汉堡按钮也被 md:hidden 隐藏 → 抽屉根本打不开」的真实缺陷。
// 此后**所有 JS 侧断点判定一律从这里取**，不要再写字面量。
//
// 注意：`GraphView.minScale()` 里的 768 是「**画布宽度**」阈值而非视口断点，
// 不属于本文件管辖（已在该处加注释），迁移时不要误并入。
export const BP = {
  /** 手机上限：与 Tailwind `sm` 严格对齐 */
  sm: 640,
  /** 桌面起点：与 Tailwind `lg` 严格对齐 */
  lg: 1024
} as const

/** 抽屉宽度（交付物 §5 ④）：min(320, max(300, 屏宽 × 0.82)) */
export function drawerWidth(viewportWidth: number) {
  return Math.round(Math.min(320, Math.max(300, viewportWidth * 0.82)))
}

export function useViewport() {
  // SSR 与客户端首帧一律按桌面（1440）渲染，挂载后校正。
  // 这样 SSR 输出与客户端首帧结构一致，**不会产生 hydration mismatch**。
  //
  // 因此：纯「显隐」类需求请改用 CSS（如 `sm:hidden`），不要依赖本 ref，
  // 否则会在手机上出现首帧闪烁。本 ref 只用于 CSS 表达不了的事
  // （抽屉宽度公式、ESC 行为、按视口分档的 JS 计算）。
  const width = useState<number>('shell-vp-width', () => 1440)

  const sync = () => {
    if (import.meta.client) width.value = window.innerWidth
  }

  onMounted(() => {
    sync()
    window.addEventListener('resize', sync, { passive: true })
  })
  onBeforeUnmount(() => {
    if (import.meta.client) window.removeEventListener('resize', sync)
  })

  const isPhone = computed(() => width.value < BP.sm)
  const isTablet = computed(() => width.value >= BP.sm && width.value < BP.lg)
  /** 抽屉模式：手机 + 平板（<1024），与图标栏的 `lg:block` 互补 */
  const isNarrow = computed(() => width.value < BP.lg)
  const isDesktop = computed(() => width.value >= BP.lg)

  return {
    width,
    isPhone,
    isTablet,
    isNarrow,
    isDesktop,
    drawerW: computed(() => drawerWidth(width.value))
  }
}
