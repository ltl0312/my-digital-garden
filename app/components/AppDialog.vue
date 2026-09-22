<script setup lang="ts">
import { X } from 'lucide-vue-next'

// 通用对话框（spec 6：遮罩 + 卡片 + 头/体/尾三段；焦点进入、ESC 关闭、点击遮罩关闭）
// 关闭键用 `.modal-x` 绝对定位钉在右上角，与标题长度/行数无关（spec 5.8 ②）
const props = withDefaults(defineProps<{
  open: boolean
  title: string
  /** 视觉宽度档位 */
  size?: 'sm' | 'md' | 'lg'
  /** 点击遮罩是否关闭（危险操作用户可能误触时置 false） */
  closeOnOverlay?: boolean
  /** 是否显示右上角关闭键 */
  closable?: boolean
}>(), {
  size: 'md',
  closeOnOverlay: true,
  closable: true
})

const emit = defineEmits<{
  (e: 'update:open', v: boolean): void
  (e: 'close'): void
}>()

const card = ref<HTMLElement | null>(null)

const close = () => {
  emit('update:open', false)
  emit('close')
}

const onOverlay = () => {
  if (props.closeOnOverlay) close()
}

const onKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    e.stopPropagation()
    close()
  }
}

const widthOf = computed(() => {
  if (props.size === 'sm') return 'max-w-[420px]'
  if (props.size === 'lg') return 'max-w-[720px]'
  return 'max-w-[560px]'
})

// 打开时把焦点移入对话框（进入卡片本身，再由用户 Tab 到具体控件）
watch(() => props.open, async (v) => {
  if (!v || !import.meta.client) return
  await nextTick()
  card.value?.focus()
})
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-micro ease-dawn"
      enter-from-class="opacity-0"
      leave-active-class="transition duration-micro ease-dawn"
      leave-to-class="opacity-0"
    >
      <div
        v-if="open"
        class="fixed inset-0 z-[110] flex items-start justify-center overflow-y-auto p-4 sm:p-6 bg-[color-mix(in_srgb,var(--ink)_38%,transparent)]"
        @click.self="onOverlay"
        @keydown="onKeydown"
      >
        <div
          ref="card"
          class="relative w-full my-auto rounded-overlay border border-line bg-surface shadow-ds3 outline-none"
          :class="widthOf"
          role="dialog"
          aria-modal="true"
          aria-labelledby="dlg-title"
          tabindex="-1"
        >
          <!-- 标题栏：关闭键绝对定位（.modal-x） -->
          <header class="px-5 sm:px-6 pt-5 pb-3 border-b border-line">
            <h2 id="dlg-title" class="text-ds-lg font-semibold text-ink pr-10 leading-title">{{ title }}</h2>
            <slot name="subtitle" />
          </header>

          <button
            v-if="closable"
            class="modal-x"
            type="button"
            aria-label="关闭对话框"
            @click="close"
          >
            <X class="w-4 h-4" />
          </button>

          <div class="px-5 sm:px-6 py-4">
            <slot />
          </div>

          <footer v-if="$slots.footer" class="px-5 sm:px-6 py-4 border-t border-line flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2">
            <slot name="footer" />
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
