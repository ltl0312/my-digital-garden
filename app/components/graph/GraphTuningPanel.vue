<!--
  图谱控制面板（需求 m01104 第 3 条，仿 Obsidian 图谱设置）。
  三段：标签（显示模式）/ 节点与连线（大小、粗细）/ 力导向（中心力、排斥力、连接力、连接距离、聚焦斥力）。
  参数由页面持有并持久化在 garden-graph-settings-v3；本组件只发 patch，不改 props。
-->
<template>
  <section
    class="flex flex-col gap-4 p-3 border-t border-line"
    data-testid="graph-tuning-panel"
    aria-label="图谱控制"
  >
    <header class="flex items-center justify-between">
      <h2 class="text-[12px] font-semibold text-ink-3">图谱控制</h2>
      <button
        type="button"
        class="text-[11px] text-ink-3 hover:text-ink-2 transition-colors duration-micro"
        data-testid="graph-tuning-reset"
        @click="emit('reset')"
      >
        恢复默认
      </button>
    </header>

    <!-- 标签显示模式 -->
    <div>
      <h3 class="text-[12px] font-semibold text-ink-3 mb-2">标签</h3>
      <div class="grid grid-cols-3 gap-1" role="radiogroup" aria-label="标签显示模式">
        <button
          v-for="m in LABEL_MODES"
          :key="m"
          type="button"
          role="radio"
          :aria-checked="labelMode === m"
          :data-testid="`graph-label-mode-${m}`"
          class="h-7 rounded-[6px] border text-[12px] transition-colors duration-micro"
          :class="labelMode === m
            ? 'border-[var(--accent)] text-[var(--accent)] bg-surface-2'
            : 'border-line text-ink-2 hover:bg-surface-3'"
          @click="emit('labelMode', m)"
        >
          {{ LABEL_MODE_LABEL[m] }}
        </button>
      </div>
      <p class="mt-1.5 text-[11px] text-ink-3 leading-relaxed" data-testid="graph-label-mode-hint">
        {{ LABEL_MODE_HINT[labelMode] }}
      </p>
    </div>

    <!-- 节点与连线 -->
    <div>
      <h3 class="text-[12px] font-semibold text-ink-3 mb-2">节点与连线</h3>
      <SliderRow
        v-for="s in DISPLAY_SLIDERS"
        :key="s.key"
        :def="s"
        :value="tuning[s.key]"
        @input="onInput(s.key, $event)"
      />
    </div>

    <!-- 力导向 -->
    <div>
      <h3 class="text-[12px] font-semibold text-ink-3 mb-2">力导向</h3>
      <SliderRow
        v-for="s in FORCE_SLIDERS"
        :key="s.key"
        :def="s"
        :value="tuning[s.key]"
        @input="onInput(s.key, $event)"
      />
      <p class="mt-2 text-[11px] text-ink-3 leading-relaxed">
        调整任一参数都会重新点火；跑稳之后物理引擎会自动停下。
      </p>
      <button
        v-if="!physics"
        type="button"
        class="mt-2 w-full h-8 rounded-[6px] border border-line text-[12px] text-ink-2 hover:bg-surface-3 transition-colors duration-micro"
        data-testid="graph-tuning-reheat"
        @click="emit('reheat')"
      >
        重新点火
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
// SliderRow 就地定义：只有这个面板用，不值得单开文件。
import { defineComponent, h, type PropType } from 'vue'
import {
  LABEL_MODES,
  LABEL_MODE_HINT,
  LABEL_MODE_LABEL,
  TUNING_RANGES
} from '~/lib/graph-constants'
import type { GraphTuning, LabelMode } from '~/lib/graph-types'

interface SliderDef {
  key: keyof GraphTuning
  label: string
  hint: string
  format: (v: number) => string
}

const SliderRow = defineComponent({
  name: 'TuningSliderRow',
  props: {
    def: { type: Object as PropType<SliderDef>, required: true },
    value: { type: Number, required: true }
  },
  emits: ['input'],
  setup(props, { emit }) {
    return () => {
      const key = props.def.key
      const range = TUNING_RANGES[key]
      const id = `graph-tuning-${key}`
      return h('div', { class: 'mb-2.5 last:mb-0' }, [
        h('div', { class: 'flex items-baseline justify-between mb-1' }, [
          h('label', { for: id, class: 'text-[12px] text-ink-2' }, props.def.label),
          h('span', { class: 'font-mono text-[11px] text-ink-3 tabular-nums' }, props.def.format(props.value))
        ]),
        h('input', {
          id,
          type: 'range',
          min: range.min,
          max: range.max,
          step: range.step,
          value: props.value,
          'data-testid': `graph-tuning-${key}`,
          'aria-label': props.def.label,
          class: 'w-full h-4 cursor-pointer accent-[var(--accent)]',
          onInput: (e: Event) => emit('input', Number((e.target as HTMLInputElement).value))
        }),
        props.def.hint
          ? h('p', { class: 'mt-0.5 text-[11px] text-ink-3 leading-relaxed' }, props.def.hint)
          : null
      ])
    }
  }
})

defineProps<{
  tuning: GraphTuning
  labelMode: LabelMode
  physics: boolean
}>()

const emit = defineEmits<{
  (e: 'change', patch: Partial<GraphTuning>): void
  (e: 'labelMode', v: LabelMode): void
  (e: 'reheat'): void
  (e: 'reset'): void
}>()

const DISPLAY_SLIDERS: SliderDef[] = [
  { key: 'nodeScale', label: '节点大小', hint: '', format: v => `${v.toFixed(2)}×` },
  { key: 'edgeWidth', label: '连线粗细', hint: '', format: v => `${v.toFixed(2)}×` }
]

const FORCE_SLIDERS: SliderDef[] = [
  { key: 'centerStrength', label: '中心力', hint: '把节点拉向画布中心；0 = 仅保持整体居中', format: v => v.toFixed(2) },
  { key: 'chargeStrength', label: '排斥力', hint: '越大节点之间越分散', format: v => `${v.toFixed(1)}×` },
  { key: 'linkStrength', label: '连接力', hint: '越大有连接的节点越贴紧', format: v => `${v.toFixed(1)}×` },
  { key: 'linkDistance', label: '连接距离', hint: '有连接的节点之间的目标距离', format: v => `${v.toFixed(1)}×` },
  { key: 'focusRepel', label: '聚焦斥力', hint: '聚焦时被聚焦节点之间的排斥力倍数', format: v => `${v.toFixed(1)}×` }
]

const onInput = (key: keyof GraphTuning, v: number) => {
  emit('change', { [key]: v } as Partial<GraphTuning>)
}
</script>
