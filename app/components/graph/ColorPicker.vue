<!--
  通用颜色选择器（需求：自定义颜色不能只支持固定色板）。

  预设色板 + **任意颜色**输入：
    · 原生 `<input type="color">` 挑 RGB（它只认 #rrggbb，所以透明度得我们自己管）
    · 透明度滑杆 5%–100%，最终拼成 `rgba(r, g, b, a)`
    · 一路文本框，接受 #RGB / #RRGGBB / #RRGGBBAA / rgb() / rgba() / hsl()
  规范化与校验都在 shared/graph-colors.ts（前端与服务端同一份白名单）。

  预览底色画成棋盘格，半透明时才看得出「确实透了」。

  交互约定：**改动立即 emit，没有「应用」按钮**——但预设色与自定义色的行为由父级决定
  （右键菜单里点预设会关菜单、调滑杆不会关，见 GraphContextMenu）。
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
        @click="emit('update', c, 'preset')"
      />
    </div>

    <!-- 自定义：原生取色 + 棋盘格预览 + 当前透明度 -->
    <div class="flex items-center gap-1.5">
      <input
        :value="hex6"
        type="color"
        class="h-6 w-7 shrink-0 rounded-[4px] border border-line bg-surface p-0 cursor-pointer"
        :data-testid="`${testid}-native`"
        aria-label="自定义颜色"
        :title="`自定义颜色（当前 ${value || '未设置'}）`"
        @input="onNative"
      >
      <span
        class="relative h-5 min-w-0 flex-1 rounded-[4px] border border-line overflow-hidden"
        :style="checkerStyle"
        aria-hidden="true"
      >
        <span
          class="absolute inset-0"
          :style="{ background: value || 'transparent' }"
          :data-testid="`${testid}-preview`"
        />
      </span>
      <span
        class="w-9 shrink-0 text-right text-[10px] text-ink-3 tabular-nums"
        :data-testid="`${testid}-alpha-label`"
      >{{ alphaPct }}%</span>
    </div>

    <input
      :value="alphaPct"
      type="range"
      :min="COLOR_ALPHA_MIN_PCT"
      :max="COLOR_ALPHA_MAX_PCT"
      step="1"
      class="h-4 w-full accent-[var(--accent)]"
      :data-testid="`${testid}-alpha`"
      aria-label="不透明度"
      @input="onAlpha"
    >

    <input
      v-model="text"
      type="text"
      spellcheck="false"
      autocomplete="off"
      placeholder="#RRGGBB / rgba(…)"
      class="w-full h-6 px-1.5 rounded-[4px] border border-line bg-surface text-[10px] text-ink placeholder:text-ink-3 focus:outline-none focus:border-[var(--accent)]"
      :data-testid="`${testid}-text`"
      aria-label="颜色值"
      @keydown.stop
      @change="onText"
      @keydown.enter.prevent="onText"
    >

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
import { formatColor, parseColor, toHex6, withAlpha } from '#shared/graph-colors'

const props = withDefaults(defineProps<{
  /** 当前生效色（`#rrggbb` / `rgba(...)` / `hsl(...)` 都可以） */
  modelValue?: string | null
  /** testid 前缀：预设色拼成 `<前缀>-<HEX>`，自定义控件拼成 `<前缀>-native/-alpha/-text` */
  testid: string
  presets?: readonly string[]
}>(), {
  modelValue: null,
  presets: () => NODE_COLOR_PALETTE
})

/**
 * `source` 让父级区分「点了预设色」与「用了自定义控件」：右键菜单里点预设色要顺手关掉
 * 菜单，而拖透明度滑杆时菜单必须留着（否则滑一下菜单就没了，看不到节点变色）。
 */
const emit = defineEmits<{ (e: 'update', color: string, source: 'preset' | 'custom'): void }>()

/** 棋盘格：半透明色才看得出「确实透了」 */
const CHECKER = 'repeating-conic-gradient(var(--surface-3, #E6E3D9) 0% 25%, var(--surface, #FFFFFF) 0% 50%)'
const checkerStyle = { backgroundImage: CHECKER, backgroundSize: '8px 8px' }

const value = computed(() => props.modelValue ?? '')
const alphaPct = computed(() => Math.round((parseColor(props.modelValue)?.a ?? 1) * 100))
const hex6 = computed(() => toHex6(props.modelValue, props.presets[0] ?? '#8B8D98'))

/** 文本框内容；服务端/父级改了色就跟上，用户手打时以本地为准 */
const text = ref(value.value)
const textInvalid = ref(false)

watch(value, (v) => {
  if (v !== text.value) {
    text.value = v
    textInvalid.value = false
  }
})

const isSame = (c: string): boolean => value.value.toLowerCase() === c.toLowerCase()

function onNative(e: Event) {
  const hex = (e.target as HTMLInputElement).value
  // 原生取色只管 RGB，透明度沿用当前值
  const next = withAlpha(hex, (parseColor(props.modelValue)?.a ?? 1))
  if (next) {
    textInvalid.value = false
    emit('update', next, 'custom')
  }
}

function onAlpha(e: Event) {
  const pct = Number((e.target as HTMLInputElement).value)
  if (!Number.isFinite(pct)) return
  const next = withAlpha(props.modelValue, pct / 100)
  if (next) {
    textInvalid.value = false
    emit('update', next, 'custom')
  }
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
  textInvalid.value = false
  // 走 formatColor 把 hsl/rgb/简写 hex 都归一成规范写法（不透明回 hex，半透明回 rgba）
  emit('update', formatColor(parsed), 'custom')
}
</script>
