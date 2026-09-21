<script setup lang="ts">
// 下拉菜单（spec 6 Menu）：右对齐浮层 + 图标项 + 危险项分隔
// 点击空白 / ESC / 滚动 / 打开其他菜单时自动收起；ESC 与方向键可达
export interface MenuEntry {
  key: string
  label: string
  /** lucide 图标组件 */
  icon?: any
  danger?: boolean
  disabled?: boolean
  /** 禁用原因，写入 title 并显示在右侧 */
  reason?: string
}

const props = withDefaults(defineProps<{
  open: boolean
  items: MenuEntry[]
  align?: 'left' | 'right'
}>(), { align: 'right' })

const emit = defineEmits<{
  (e: 'update:open', v: boolean): void
  (e: 'select', key: string): void
}>()

const root = ref<HTMLElement | null>(null)
const panel = ref<HTMLElement | null>(null)
// 视口四边收敛：默认右对齐；若会溢出左边则改左对齐
const flipLeft = ref(false)

const close = () => emit('update:open', false)

const choose = (it: MenuEntry) => {
  if (it.disabled) return
  close()
  emit('select', it.key)
}

// 触发器点击开合（trigger 插槽内容由调用方决定，包装层负责路由点击）
const onTriggerClick = (e: MouseEvent) => {
  const el = e.target as HTMLElement
  // 点菜单面板内部不处理（交给 choose / 文档监听）
  if (panel.value?.contains(el)) return
  emit('update:open', !props.open)
}

const onDocClick = (e: MouseEvent) => {
  if (!props.open) return
  if (!root.value?.contains(e.target as Node)) close()
}

const onKey = (e: KeyboardEvent) => {
  if (!props.open) return
  if (e.key === 'Escape') {
    e.stopPropagation()
    close()
    return
  }
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
  e.preventDefault()
  const buttons = Array.from(panel.value?.querySelectorAll<HTMLButtonElement>('button:not([disabled])') || [])
  if (!buttons.length) return
  const idx = buttons.indexOf(document.activeElement as HTMLButtonElement)
  const next = e.key === 'ArrowDown' ? (idx + 1) % buttons.length : (idx - 1 + buttons.length) % buttons.length
  buttons[next]?.focus()
}

onMounted(() => {
  document.addEventListener('click', onDocClick)
  document.addEventListener('keydown', onKey)
  window.addEventListener('scroll', close, true)
})
onScopeDispose(() => {
  document.removeEventListener('click', onDocClick)
  document.removeEventListener('keydown', onKey)
  window.removeEventListener('scroll', close, true)
})

watch(() => props.open, async (v) => {
  if (!v) return
  await nextTick()
  const r = root.value?.getBoundingClientRect()
  flipLeft.value = !!r && r.left < 180
  panel.value?.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus()
})
</script>

<template>
  <div ref="root" class="relative" @click="onTriggerClick">
    <slot name="trigger" />

    <Transition
      enter-active-class="transition duration-micro ease-dawn"
      enter-from-class="opacity-0 -translate-y-1"
      leave-active-class="transition duration-micro ease-dawn"
      leave-to-class="opacity-0 -translate-y-1"
    >
      <div
        v-if="open"
        ref="panel"
        class="absolute z-50 mt-2 w-52 rounded-card bg-surface border border-line shadow-ds3 p-1"
        :class="align === 'right' ? (flipLeft ? 'left-0' : 'right-0') : 'left-0'"
        role="menu"
      >
        <template v-for="it in items" :key="it.key">
          <div v-if="it.key === '__sep'" class="-mx-1 my-1 border-t border-line"></div>
          <button
            v-else
            class="w-full px-2.5 py-2 rounded-ctl text-ds-sm text-left flex items-center gap-2 transition-colors duration-micro"
            :class="[
              it.disabled
                ? 'text-ink-3 cursor-not-allowed'
                : it.danger
                  ? 'text-danger hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)]'
                  : 'text-ink-2 hover:text-ink hover:bg-surface-3'
            ]"
            :disabled="it.disabled"
            :title="it.reason || it.label"
            role="menuitem"
            @click="choose(it)"
          >
            <component :is="it.icon" v-if="it.icon" class="w-3.5 h-3.5 shrink-0" />
            <span class="flex-1 truncate">{{ it.label }}</span>
            <span v-if="it.reason" class="text-[12px] text-ink-3 shrink-0">{{ it.reason }}</span>
          </button>
        </template>
      </div>
    </Transition>
  </div>
</template>
