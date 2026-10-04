<template>
  <div
    class="absolute z-50 min-w-[208px] max-w-[240px] rounded-[10px] border border-line bg-surface shadow-ds3 py-1 select-none"
    data-testid="graph-context-menu"
    :data-menu-kind="target ? 'node' : 'canvas'"
    :data-menu-node="target ? target.id : ''"
    :style="{ left: pos.x + 'px', top: pos.y + 'px' }"
    role="menu"
    @contextmenu.prevent
  >
    <template v-for="(item, i) in items" :key="i">
      <div v-if="item.kind === 'sep'" class="my-1 h-px bg-line" />
      <div
        v-else-if="item.kind === 'label'"
        class="px-3 pt-1.5 pb-1 text-[11px] font-medium tracking-wide text-ink-3"
      >
        {{ item.text }}
      </div>
      <div v-else-if="item.kind === 'swatches'" class="px-2.5 pt-1 pb-1.5">
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="c in NODE_COLOR_PALETTE"
            :key="c"
            type="button"
            class="h-5 w-5 rounded-full border transition-transform duration-micro hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            :class="isCurrentColor(c) ? 'border-ink ring-1 ring-ink/40' : 'border-black/10'"
            :style="{ background: c }"
            :data-testid="`graph-menu-color-${c.slice(1)}`"
            :title="c"
            :aria-label="`设为颜色 ${c}`"
            @click="pick(c)"
          />
          <button
            type="button"
            class="h-5 rounded-full border border-line px-2 text-[11px] text-ink-2 hover:bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            data-testid="graph-menu-color-reset"
            title="恢复领域色"
            @click="pick(null)"
          >
            默认
          </button>
        </div>
      </div>
      <button
        v-else
        type="button"
        class="flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-ds-sm transition-colors duration-micro hover:bg-surface-2 focus:outline-none focus-visible:bg-surface-2"
        :class="item.danger ? 'text-[#D6409F]' : 'text-ink'"
        :data-testid="`graph-menu-${item.id}`"
        role="menuitem"
        @click="run(item)"
      >
        <span class="truncate">{{ item.label }}</span>
        <span v-if="item.hint" class="shrink-0 text-[11px] text-ink-3">{{ item.hint }}</span>
      </button>
    </template>
  </div>
</template>

<script setup lang="ts">
import { CONTEXT_MENU, LABEL_MODE_LABEL, LABEL_MODES, NODE_COLOR_PALETTE } from '~/lib/graph-constants'
import type { LabelMode } from '~/lib/graph-types'

/** 右键目标；`null` 表示在画布空白处右键 */
export interface ContextTarget {
  id: string
  title: string
  slug: string
  pinned: boolean
  color: string | null
}

type Item =
  | { kind: 'sep' }
  | { kind: 'label'; text: string }
  | { kind: 'swatches' }
  | { kind: 'action'; id: string; label: string; hint?: string; danger?: boolean; run: () => void }

const props = defineProps<{
  /** 相对画布容器的像素坐标 */
  x: number
  y: number
  /** 容器尺寸，用于贴边避让 */
  containerW: number
  containerH: number
  target: ContextTarget | null
  labelMode: LabelMode
  /** 该节点是否为路径起点 / 终点 */
  isPathStart?: boolean
  isPathEnd?: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'open-note', slug: string): void
  (e: 'focus-neighbors', id: string): void
  (e: 'path-start', id: string): void
  (e: 'path-end', id: string): void
  (e: 'toggle-pin', id: string): void
  (e: 'set-color', id: string, color: string | null): void
  (e: 'copy', text: string, label: string): void
  (e: 'detach', id: string): void
  (e: 'fit'): void
  (e: 'reset-layout'): void
  (e: 'reheat'): void
  (e: 'label-mode', m: LabelMode): void
  (e: 'clear-filters'): void
}>()

/** 贴边避让：先按估算尺寸夹到容器内，再留 8px 边距 */
const pos = computed(() => {
  const w = CONTEXT_MENU.width
  const h = CONTEXT_MENU.height
  const maxX = Math.max(8, props.containerW - w - 8)
  const maxY = Math.max(8, props.containerH - h - 8)
  return {
    x: Math.min(Math.max(8, props.x), maxX),
    y: Math.min(Math.max(8, props.y), maxY)
  }
})

const isCurrentColor = (c: string) => props.target?.color === c

function pick(color: string | null) {
  if (!props.target) return
  emit('set-color', props.target.id, color)
  emit('close')
}

function run(item: Item) {
  if (item.kind !== 'action') return
  item.run()
}

const items = computed<Item[]>(() => {
  const t = props.target
  if (!t) {
    return [
      { kind: 'action', id: 'fit', label: '适配全图', hint: 'G F', run: () => emit('fit') },
      { kind: 'action', id: 'reset-layout', label: '重置布局', run: () => emit('reset-layout') },
      { kind: 'action', id: 'reheat', label: '重新点火', run: () => emit('reheat') },
      { kind: 'sep' },
      { kind: 'label', text: '标签显示' },
      ...LABEL_MODES.map<Item>(m => ({
        kind: 'action',
        id: `label-${m}`,
        label: LABEL_MODE_LABEL[m],
        hint: props.labelMode === m ? '✓' : undefined,
        run: () => {
          emit('label-mode', m)
          emit('close')
        }
      })),
      { kind: 'sep' },
      {
        kind: 'action',
        id: 'clear-filters',
        label: '清除筛选',
        danger: true,
        run: () => {
          emit('clear-filters')
          emit('close')
        }
      }
    ]
  }

  return [
    { kind: 'action', id: 'open', label: '打开笔记', hint: '⏎', run: () => { emit('open-note', t.slug); emit('close') } },
    { kind: 'action', id: 'focus', label: '聚焦邻居（2 跳）', run: () => { emit('focus-neighbors', t.id); emit('close') } },
    { kind: 'sep' },
    {
      kind: 'action',
      id: 'path-start',
      label: '设为路径起点',
      hint: props.isPathStart ? '✓' : undefined,
      run: () => { emit('path-start', t.id); emit('close') }
    },
    {
      kind: 'action',
      id: 'path-end',
      label: '设为路径终点',
      hint: props.isPathEnd ? '✓' : undefined,
      run: () => { emit('path-end', t.id); emit('close') }
    },
    { kind: 'sep' },
    {
      kind: 'action',
      id: 'pin',
      label: t.pinned ? '解除固定' : '固定位置',
      hint: t.pinned ? '双击解除' : undefined,
      run: () => { emit('toggle-pin', t.id); emit('close') }
    },
    { kind: 'label', text: '设置颜色' },
    { kind: 'swatches' },
    { kind: 'sep' },
    {
      kind: 'action',
      id: 'copy-link',
      label: '复制 [[双链]]',
      run: () => { emit('copy', `[[${t.title}]]`, '双链'); emit('close') }
    },
    {
      kind: 'action',
      id: 'copy-title',
      label: '复制标题',
      run: () => { emit('copy', t.title, '标题'); emit('close') }
    },
    { kind: 'sep' },
    {
      kind: 'action',
      id: 'detach',
      label: '断开全部关系',
      danger: true,
      run: () => { emit('detach', t.id); emit('close') }
    }
  ]
})

/** Esc 关闭 + 点外面关闭。pointerdown 用捕获阶段，避免被画布自己的处理器吞掉 */
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.stopPropagation()
    emit('close')
  }
}

function onOutside(e: PointerEvent) {
  const el = (e.target as HTMLElement | null)?.closest?.('[data-testid="graph-context-menu"]')
  if (!el) emit('close')
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown, true)
  window.addEventListener('pointerdown', onOutside, true)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown, true)
  window.removeEventListener('pointerdown', onOutside, true)
})
</script>
