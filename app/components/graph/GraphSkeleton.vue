<template>
  <!--
    图谱加载骨架屏（T1.4）。
    三类状态互不复用：本组件只表示「数据加载中」，与「筛选无结果」「图谱真空态」是不同组件。
  -->
  <div class="flex h-full w-full overflow-hidden bg-canvas" data-testid="graph-skeleton" aria-busy="true" aria-live="polite">
    <span class="sr-only">图谱加载中</span>

    <!-- 左栏骨架 -->
    <div class="hidden lg:block w-[240px] xl:w-[272px] shrink-0 border-r border-line bg-surface p-3 space-y-4">
      <div v-for="g in 3" :key="g" class="space-y-2">
        <div class="h-3 w-20 rounded-full bg-surface-3 animate-pulse"></div>
        <div v-for="i in 4" :key="i" class="h-5 rounded-ctl bg-surface-3/70 animate-pulse" :style="{ width: `${88 - i * 9}%` }"></div>
      </div>
    </div>

    <!-- 画布骨架 -->
    <div class="relative flex-1 min-w-0">
      <div class="absolute inset-0 opacity-60">
        <svg class="w-full h-full" viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <g stroke="var(--line)" stroke-width="1">
            <line v-for="(l, i) in lines" :key="`l${i}`" :x1="l[0]" :y1="l[1]" :x2="l[2]" :y2="l[3]" />
          </g>
          <circle
            v-for="(c, i) in dots"
            :key="`d${i}`"
            :cx="c[0]"
            :cy="c[1]"
            :r="c[2]"
            fill="var(--surface-3)"
            class="animate-pulse"
          />
        </svg>
      </div>
      <div class="absolute left-2 top-2 h-9 w-[min(420px,60%)] rounded-ctl border border-line bg-surface/80 animate-pulse"></div>
      <div class="absolute right-2 top-14 h-[112px] w-[164px] rounded-[10px] border border-line bg-surface/80 animate-pulse"></div>
    </div>

    <!-- 右栏骨架 -->
    <div class="hidden lg:block w-[288px] xl:w-[320px] shrink-0 border-l border-line bg-surface p-3 space-y-3">
      <div class="h-[86px] rounded-ctl bg-surface-3/70 animate-pulse"></div>
      <div v-for="i in 6" :key="i" class="h-6 rounded-ctl bg-surface-3/70 animate-pulse" :style="{ width: `${92 - i * 6}%` }"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
// 骨架图的节点/连线是固定伪随机布局（每次 SSR/CSR 一致），避免闪烁。
//
// 注意：这里必须把结果**量化**（保留 1 位小数）后再渲染。
// 原因：Node 与浏览器 Chrome 的 V8 版本不同，Math.sin/Math.cos 在最后 1 个 ULP 上会有差异，
// 未量化时 SSR 输出 cy="531.9326911852078"、客户端算出 cy="531.9326911852077"，
// Vue 会判定为 hydration attribute mismatch 并在控制台报错。
const round = (v: number, digits = 1) => {
  const p = 10 ** digits
  return Math.round(v * p) / p
}

const seed = (i: number) => round(((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1, 6)

const dots = Array.from({ length: 46 }, (_, i) => {
  const a = seed(i) * Math.PI * 2
  const r = 60 + seed(i + 100) * 260
  return [round(400 + Math.cos(a) * r * 1.35), round(300 + Math.sin(a) * r * 0.9), round(4 + seed(i + 200) * 7)] as [number, number, number]
})

const lines: [number, number, number, number][] = []
for (let i = 0; i < dots.length; i++) {
  for (let j = i + 1; j < dots.length; j++) {
    if (seed(i * 31 + j) > 0.955) {
      lines.push([dots[i]![0], dots[i]![1], dots[j]![0], dots[j]![1]])
    }
  }
}
</script>
