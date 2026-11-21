<script lang="ts">
// 保存状态机。与 app/pages/notes/[...slug].vue 中的同名联合类型逐字一致
// （页面侧不 import .vue 里的类型：仓库里没有任何 .vue 类型导入的先例，路径别名在
//  vue-tsc 下不稳，结构相同的联合类型可以直接赋值，不必为省一行引入跨文件类型依赖）。
export type SaveStatus = 'idle' | 'saving' | 'queued' | 'saved' | 'timeout' | 'conflict'
</script>

<script setup lang="ts">
// 一行保存状态条。为什么要有：过去只有一个 saving 布尔 —— 写入成功、入库滞后、
// 超时、被别处改过，四种处境在界面上长得一模一样，用户只能靠一条事后 toast 猜结果。
// 高度固定（h-9），出现/消失不推挤下面的编辑器。

const props = withDefaults(defineProps<{
  status: SaveStatus
  /** 最近一次成功的时刻：优先用响应里的 updatedAt，取不到时由调用方给本地时刻（ISO） */
  savedAt?: string
}>(), {
  savedAt: ''
})

const emit = defineEmits<{ (e: 'retry'): void }>()

// 「HH:mm」：用户关心的是「刚才那一下成功了没」，日期在这里没有信息量
const clock = computed(() => {
  const d = props.savedAt ? new Date(props.savedAt) : new Date()
  const t = Number.isNaN(d.getTime()) ? new Date() : d
  return `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`
})

const view = computed(() => {
  switch (props.status) {
    case 'saving':
      return { glyph: '◐', text: '正在写入文件', tone: 'text-ink-2', pulse: true, retry: false }
    case 'queued':
      // 文件已落盘、DB 还没跟上：不是错误，所以不用 danger 色，也不给重试
      return { glyph: '◐', text: '已写入 vault，等待入库…', tone: 'text-ink-2', pulse: true, retry: false }
    case 'saved':
      return { glyph: '●', text: `已保存 ${clock.value}`, tone: 'text-evergreen', pulse: false, retry: false }
    case 'timeout':
      // 超时不等于失败：请求可能已经到了服务端，所以给「重试」而不是「重新加载」
      return { glyph: '✕', text: '写入超时', tone: 'text-danger', pulse: false, retry: true }
    case 'conflict':
      return { glyph: '✕', text: '内容已被其他位置修改', tone: 'text-danger', pulse: false, retry: false }
    default:
      return null
  }
})
</script>

<template>
  <div
    v-if="view"
    class="flex items-center gap-2 px-3.5 h-9 rounded-card border border-line bg-surface-2"
    role="status"
    aria-live="polite"
  >
    <span
      class="font-mono text-ds-xs leading-none"
      :class="[view.tone, view.pulse ? 'animate-pulse' : '']"
      aria-hidden="true"
    >{{ view.glyph }}</span>
    <span class="text-ds-sm" :class="view.tone">{{ view.text }}</span>
    <button
      v-if="view.retry"
      type="button"
      class="ml-auto h-[26px] px-2 rounded-xs text-ds-xs border border-line text-ink-2 hover:bg-surface-3 hover:text-ink transition-colors duration-micro"
      @click="emit('retry')"
    >重试</button>
  </div>
</template>
