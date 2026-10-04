<!--
  通用颜色选择器：**调色盘**（饱和度/明度方阵 + 色相条 + 透明度条）+ 预设色板 + 颜色值输入。

  为什么不是「一排预设色 + 一个原生 <input type=color>」：那样调不出任意色，用户只能从
  固定色板里挑再调透明度。这里给的是真正的调色盘——
    · 方阵（SV）横轴是饱和度、纵轴是明度，底色用两层 CSS 渐变叠出来，光标可拖动
    · 色相条 0–360°，彩虹底，可拖动
    · 透明度条 5%–100%（刻意不设 0，全透明的节点等于消失，已超出「上色」语义）
    · 预设色板留给常用色，点一下就设
    · 文本框接受 #RGB / #RRGGBB / #RRGGBBAA / rgb() / rgba() / hsl()
  规范化与校验都在 shared/graph-colors.ts（前端与服务端同一份白名单）。

  预览底色画成棋盘格，半透明时才看得出「确实透了」。

  三条拖动条都是手写的指针拖拽（没有用 <input type=range>，因为要给轨道画渐变色与
  自绘圆形拖柄）；键盘 ←/→ 也能调，保持可访问性。

  交互约定：**改动立即 emit，没有「应用」按钮**——但预设色与调色盘的行为由父级决定
  （右键菜单里点预设会关菜单、拖调色盘不会关，见 GraphContextMenu）。
-->
<template>
  <div class="flex flex-col gap-1.5">
    <!-- 预设色板：testid 保持 `<前缀>-<HEX 去掉 #>`，老验收用例依赖它 -->
    <div class="flex flex-wrap gap-1.5">
      <button
        v-for="c in presets"
        :key="c"
        type="button"
        class="h-5 w-5 rounded-full border transition-transform duration-micro hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        :class="isSame(c) ? 'border-ink ring-1 ring-ink/40' : 'border-black/10'"
        :style="{ background: c }"
        :data-testid="`${testid}-${c.slice(1)}`"
        :title="c"
        :aria-label="`设为颜色 ${c}`"
        @click="onPreset(c)"
      />
    </div>

    <!-- 调色盘主体：饱和度 × 明度方阵 -->
    <div
      ref="svRef"
      class="relative h-20 w-full cursor-crosshair touch-none select-none rounded-[5px] border border-line"
      :style="svStyle"
      :data-testid="`${testid}-sv`"
      :data-hsv="hsvAttr"
      role="slider"
      tabindex="0"
      :aria-label="`饱和度与明度（${hsvAttr}）`"
      :aria-valuetext="hsvAttr"
      @pointerdown="onSvDown"
      @keydown="onSvKey"
    >
      <span
        class="pointer-events-none absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white ring-1 ring-black/40"
        :style="{ left: `${svX}%`, top: `${svY}%`, background: hueColor }"
        aria-hidden="true"
      />
    </div>

    <!-- 色相条 -->
    <div
      ref="hueRef"
      class="relative h-3.5 w-full cursor-pointer touch-none select-none rounded-[5px] border border-line"
      :style="{ backgroundImage: HUE_TRACK }"
      :data-testid="`${testid}-hue`"
      :data-hue="Math.round(hsv.h)"
      role="slider"
      tabindex="0"
      aria-label="色相"
      :aria-valuemin="0"
      :aria-valuemax="360"
      :aria-valuenow="Math.round(hsv.h)"
      @pointerdown="onHueDown"
      @keydown="onHueKey"
    >
      <span
        class="pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white ring-1 ring-black/40"
        :style="{ left: `${(hsv.h / 360) * 100}%`, background: hueColor }"
        aria-hidden="true"
      />
    </div>

    <!-- 透明度条 -->
    <div
      ref="alphaRef"
      class="relative h-3.5 w-full cursor-pointer touch-none select-none rounded-[5px] border border-line"
      :style="alphaTrackStyle"
      :data-testid="`${testid}-alpha`"
      :data-alpha="alphaPct"
      role="slider"
      tabindex="0"
      aria-label="不透明度"
      :aria-valuemin="COLOR_ALPHA_MIN_PCT"
      :aria-valuemax="COLOR_ALPHA_MAX_PCT"
      :aria-valuenow="alphaPct"
      @pointerdown="onAlphaDown"
      @keydown="onAlphaKey"
    >
      <span
        class="pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white ring-1 ring-black/40"
        :style="{ left: `${alphaRatio * 100}%`, background: value || 'transparent' }"
        aria-hidden="true"
      />
    </div>

    <!-- 结果回读：棋盘格 + 颜色值 + 当前不透明度 -->
    <div class="flex items-center gap-1.5">
      <span
        class="relative h-6 w-8 shrink-0 overflow-hidden rounded-[4px] border border-line"
        :style="checkerStyle"
        aria-hidden="true"
      >
        <span
          class="absolute inset-0"
          :style="{ background: value || 'transparent' }"
          :data-testid="`${testid}-preview`"
        />
      </span>
      <input
        v-model="text"
        type="text"
        spellcheck="false"
        autocomplete="off"
        placeholder="#RRGGBB / rgba(…)"
        class="h-6 min-w-0 flex-1 rounded-[4px] border border-line bg-surface px-1.5 text-[10px] text-ink placeholder:text-ink-3 focus:border-[var(--accent)] focus:outline-none"
        :data-testid="`${testid}-text`"
        aria-label="颜色值"
        @keydown.stop
        @change="onText"
        @keydown.enter.prevent="onText"
      >
      <span
        class="w-9 shrink-0 text-right text-[10px] text-ink-3 tabular-nums"
        :data-testid="`${testid}-alpha-label`"
      >{{ alphaPct }}%</span>
    </div>

    <p
      v-if="textInvalid"
      class="text-[10px] leading-snug text-[var(--danger,#B4232A)]"
      :data-testid="`${testid}-hint`"
    >
      认不出的颜色写法。支持 #RGB / #RRGGBB / #RRGGBBAA / rgb() / rgba() / hsl()。
    </p>
  </div>
</template>

<script setup lang="ts">
import { COLOR_ALPHA_MAX_PCT, COLOR_ALPHA_MIN_PCT, NODE_COLOR_PALETTE } from '~/lib/graph-constants'
import { formatColor, hsvToRgb, parseColor, rgbToHsv } from '#shared/graph-colors'

const props = withDefaults(defineProps<{
  /** 当前生效色（`#rrggbb` / `rgba(...)` / `hsl(...)` 都可以） */
  modelValue?: string | null
  /** testid 前缀：预设色拼成 `<前缀>-<HEX>`，调色盘拼成 `<前缀>-sv/-hue/-alpha/-text` */
  testid: string
  presets?: readonly string[]
}>(), {
  modelValue: null,
  presets: () => NODE_COLOR_PALETTE
})

/**
 * `source` 让父级区分「点了预设色」与「用了调色盘」：右键菜单里点预设色要顺手关掉
 * 菜单，而拖调色盘时菜单必须留着（否则拖一下菜单就没了，看不到节点变色）。
 */
const emit = defineEmits<{ (e: 'update', color: string, source: 'preset' | 'custom'): void }>()

/** 棋盘格：半透明色才看得出「确实透了」 */
const CHECKER = 'repeating-conic-gradient(var(--surface-3, #E6E3D9) 0% 25%, var(--surface, #FFFFFF) 0% 50%)'
const checkerStyle = { backgroundImage: CHECKER, backgroundSize: '8px 8px' }
const HUE_TRACK = 'linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)'

const value = computed(() => props.modelValue ?? '')
const alphaPct = computed(() => Math.round((parseColor(props.modelValue)?.a ?? 1) * 100))

/** 调色盘的状态就是 HSV：方阵横轴 s、纵轴 v，色相条单独选 h */
const hsv = reactive({ h: 210, s: 0.6, v: 0.9 })

/** 文本框内容；服务端/父级改了色就跟上，用户手打时以本地为准 */
const text = ref(value.value)
const textInvalid = ref(false)
/**
 * 自己刚发出去的值。父级会把同一个字符串回灌给我们，若不加这层判断就会「外部改了色 → 重新
 * 解析 → hsv 被 RGB 取整顶回去」，拖色相条时光标会跳。
 */
let lastEmitted = ''

const hueColor = computed(() => `hsl(${Math.round(hsv.h)} 100% 50%)`)
const svStyle = computed(() => ({
  backgroundImage: `linear-gradient(to top, #000, rgba(0, 0, 0, 0)), linear-gradient(to right, #fff, ${hueColor.value})`
}))
const svX = computed(() => hsv.s * 100)
const svY = computed(() => (1 - hsv.v) * 100)
const hsvAttr = computed(() => `h=${Math.round(hsv.h)} s=${Math.round(hsv.s * 100)} v=${Math.round(hsv.v * 100)}`)
const rgbNow = computed(() => hsvToRgb(hsv))
/** 透明度条的底：左端该色全透明、右端不透明，下面垫棋盘格 */
const alphaTrackStyle = computed(() => {
  const { r, g, b } = rgbNow.value
  return {
    backgroundImage: `linear-gradient(to right, rgba(${r}, ${g}, ${b}, 0), rgb(${r}, ${g}, ${b})), ${CHECKER}`,
    backgroundSize: 'auto, 8px 8px'
  }
})
/** 拖到最左 = 下限 5%，不是 0（全透明的节点等于消失） */
const alphaRatio = computed(() => {
  const min = COLOR_ALPHA_MIN_PCT / 100
  const a = parseColor(props.modelValue)?.a ?? 1
  return Math.min(1, Math.max(0, (a - min) / (1 - min)))
})

/** 从外部值重建调色盘光标位置；解析不了就保持现状 */
function adopt(v: string | null) {
  text.value = v ?? ''
  const parsed = parseColor(v)
  if (!parsed) return
  const next = rgbToHsv(parsed)
  // 灰阶（s=0）时色相反推不出来，保留用户当前选中的色相
  if (next.s > 0) hsv.h = next.h
  hsv.s = next.s
  hsv.v = next.v
}

watch(value, (v) => {
  if (v === lastEmitted) return
  textInvalid.value = false
  adopt(v || null)
})

adopt(props.modelValue ?? null)

const isSame = (c: string): boolean => value.value.toLowerCase() === c.toLowerCase()

/** 发色 + 让文本框与调色盘跟上（调色盘拖出来的值不必回灌解析，直接以自己的状态为准） */
function emitColor(color: string) {
  lastEmitted = color
  text.value = color
  textInvalid.value = false
  emit('update', color, 'custom')
}

function commit() {
  emitColor(formatColor({ ...hsvToRgb(hsv), a: alphaPct.value / 100 }))
}

function onPreset(c: string) {
  adopt(c)
  emit('update', c, 'preset')
}

// ---------------------------------------------------------------- 拖拽
type ApplyFn = (fx: number, fy: number) => void

function startDrag(el: HTMLElement | null, ev: PointerEvent, apply: ApplyFn) {
  if (!el) return
  ev.preventDefault()
  try {
    el.setPointerCapture(ev.pointerId)
  } catch {
    // 某些浏览器/合成事件拿不到 pointerId，退化成不捕获也能用
  }
  const run = (e: PointerEvent) => {
    const r = el.getBoundingClientRect()
    if (!r.width || !r.height) return
    const fx = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))
    const fy = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))
    apply(fx, fy)
  }
  run(ev)
  const stop = () => {
    el.removeEventListener('pointermove', run)
    el.removeEventListener('pointerup', stop)
    el.removeEventListener('pointercancel', stop)
  }
  el.addEventListener('pointermove', run)
  el.addEventListener('pointerup', stop)
  el.addEventListener('pointercancel', stop)
}

const svRef = ref<HTMLElement | null>(null)
const hueRef = ref<HTMLElement | null>(null)
const alphaRef = ref<HTMLElement | null>(null)

function onSvDown(e: PointerEvent) {
  startDrag(svRef.value, e, (fx, fy) => {
    hsv.s = fx
    hsv.v = 1 - fy
    commit()
  })
}

function onHueDown(e: PointerEvent) {
  startDrag(hueRef.value, e, (fx) => {
    hsv.h = fx * 360
    commit()
  })
}

function onAlphaDown(e: PointerEvent) {
  startDrag(alphaRef.value, e, (fx) => {
    const min = COLOR_ALPHA_MIN_PCT / 100
    emitColor(formatColor({ ...rgbNow.value, a: min + fx * (1 - min) }))
  })
}

// 键盘可访问性：←/→ 调整，Shift 加速
const step = (e: KeyboardEvent): number => (e.shiftKey ? 10 : 1)

function onSvKey(e: KeyboardEvent) {
  const d = step(e)
  if (e.key === 'ArrowLeft') hsv.s = Math.max(0, hsv.s - d / 100)
  else if (e.key === 'ArrowRight') hsv.s = Math.min(1, hsv.s + d / 100)
  else if (e.key === 'ArrowUp') hsv.v = Math.min(1, hsv.v + d / 100)
  else if (e.key === 'ArrowDown') hsv.v = Math.max(0, hsv.v - d / 100)
  else return
  e.preventDefault()
  commit()
}

function onHueKey(e: KeyboardEvent) {
  const d = step(e)
  if (e.key === 'ArrowLeft') hsv.h = (hsv.h - d + 360) % 360
  else if (e.key === 'ArrowRight') hsv.h = (hsv.h + d) % 360
  else return
  e.preventDefault()
  commit()
}

function onAlphaKey(e: KeyboardEvent) {
  const d = step(e)
  const cur = alphaPct.value
  const next = e.key === 'ArrowLeft' ? cur - d : e.key === 'ArrowRight' ? cur + d : null
  if (next === null) return
  e.preventDefault()
  const pct = Math.min(COLOR_ALPHA_MAX_PCT, Math.max(COLOR_ALPHA_MIN_PCT, next))
  emitColor(formatColor({ ...rgbNow.value, a: pct / 100 }))
}

/** 文本提交：认得出来才 emit；认不出就只留提示，别把脏值推进数据流 */
function onText() {
  const raw = text.value.trim()
  if (!raw || raw === value.value) {
    textInvalid.value = false
    text.value = value.value
    return
  }
  const parsed = parseColor(raw)
  if (!parsed) {
    textInvalid.value = true
    return
  }
  // 走 formatColor 把 hsl/rgb/简写 hex 都归一成规范写法（不透明回 hex，半透明回 rgba）
  adopt(raw)
  emitColor(formatColor(parsed))
}
</script>
