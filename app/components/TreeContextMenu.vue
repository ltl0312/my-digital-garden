<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

// TreeContextMenu（spec 6 / 8.9）：结构树右键菜单
// · fixed 跟随鼠标、贴近视口边缘自动翻转；点击外部 / ESC / 滚动 关闭
// · 危险项（删除）红色、禁用项置灰并给出原因提示（hint）
export interface MenuItem {
  key: string
  label: string
  icon?: any
  /** 红色危险项 */
  danger?: boolean
  disabled?: boolean
  /** 禁用原因（hover 提示）或补充说明 */
  hint?: string
  /** 该项之前画一条分隔线 */
  divider?: boolean
}

const props = defineProps<{
  open: boolean
  x: number
  y: number
  items: MenuItem[]
}>()

const emit = defineEmits<{
  (e: 'select', key: string): void
  (e: 'close'): void
}>()

const WIDTH = 208
const root = ref<HTMLElement | null>(null)

const pos = computed(() => {
  const margin = 8
  const h = props.items.length * 34 + (props.items.filter(i => i.divider).length * 9) + 12
  let left = props.x
  let top = props.y
  if (typeof window !== 'undefined') {
    if (left + WIDTH + margin > window.innerWidth) left = Math.max(margin, props.x - WIDTH)
    if (top + h + margin > window.innerHeight) top = Math.max(margin, window.innerHeight - h - margin)
  }
  return { left: `${left}px`, top: `${top}px`, width: `${WIDTH}px` }
})

const onDocPointer = (e: PointerEvent) => {
  if (!props.open) return
  if (root.value && e.target instanceof Node && root.value.contains(e.target)) return
  emit('close')
}
const onKey = (e: KeyboardEvent) => {
  if (props.open && e.key === 'Escape') emit('close')
}
const onScrollOrResize = () => { if (props.open) emit('close') }

onMounted(() => {
  window.addEventListener('pointerdown', onDocPointer, true)
  window.addEventListener('keydown', onKey, true)
  window.addEventListener('scroll', onScrollOrResize, true)
  window.addEventListener('resize', onScrollOrResize, true)
})
onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', onDocPointer, true)
  window.removeEventListener('keydown', onKey, true)
  window.removeEventListener('scroll', onScrollOrResize, true)
  window.removeEventListener('resize', onScrollOrResize, true)
})

// 菜单打开时把焦点移入，便于键盘操作
watch(() => props.open, async (v) => {
  if (!v) return
  await nextTick()
  root.value?.focus()
})

const pick = (item: MenuItem) => {
  if (item.disabled) return
  emit('select', item.key)
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      ref="root"
      class="fixed z-[120] py-1.5 rounded-overlay border border-line bg-surface shadow-ds3 outline-none"
      :style="pos"
      role="menu"
      tabindex="-1"
      @contextmenu.prevent
    >
      <template v-for="item in items" :key="item.key">
        <div v-if="item.divider" class="my-1.5 border-t border-line"></div>
        <button
          type="button"
          role="menuitem"
          class="w-full px-3 py-1.5 text-ds-sm flex items-center gap-2.5 text-left transition-colors duration-micro disabled:cursor-not-allowed"
          :class="item.danger
            ? 'text-danger hover:bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] disabled:opacity-45'
            : 'text-ink-2 hover:text-ink hover:bg-surface-3 disabled:opacity-45'"
          :disabled="item.disabled"
          :title="item.hint || ''"
          @click="pick(item)"
        >
          <component :is="item.icon" v-if="item.icon" class="w-3.5 h-3.5 shrink-0" />
          <span class="flex-1 truncate">{{ item.label }}</span>
        </button>
      </template>
    </div>
  </Teleport>
</template>
