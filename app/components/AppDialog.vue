<script setup lang="ts">
import { X } from 'lucide-vue-next'

// 通用对话框（spec 6：遮罩 + 卡片 + 头/体/尾三段；焦点进入、ESC 关闭、点击遮罩关闭）
// 关闭键用 `.modal-x` 绝对定位钉在右上角，与标题长度/行数无关（spec 5.8 ②）
//
// 两种形态（交付物第 11 / 12 / 15 屏）—— **由 CSS 决定，不用 JS 断点**（否则手机首帧会闪）：
//   · ≥640：居中卡片（既有形态，E4 已验收）
//   · <640：底部弹层 —— 贴底、上圆角 24、grabber 拖拽暗示、按钮拉通、底部安全区
// 圆角刻意用长写属性（`rounded-t-*` / `rounded-b-*`）而非 `rounded` 简写，
// 避免简写与长写在层叠上的先后歧义。
const props = withDefaults(defineProps<{
  open: boolean
  title: string
  /** 视觉宽度档位（仅桌面形态生效） */
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
  if (props.size === 'sm') return 'sm:max-w-[420px]'
  if (props.size === 'lg') return 'sm:max-w-[720px]'
  return 'sm:max-w-[560px]'
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
        class="fixed inset-0 z-[110] flex items-end sm:items-center justify-center sm:p-6 bg-[color-mix(in_srgb,var(--ink)_38%,transparent)]"
        @click.self="onOverlay"
        @keydown="onKeydown"
      >
        <div
          ref="card"
          class="relative w-full flex flex-col max-h-[92vh] sm:max-h-[86vh] border-t sm:border border-line bg-surface shadow-ds3 outline-none rounded-t-[24px] sm:rounded-t-[var(--r-20)] sm:rounded-b-[var(--r-20)]"
          :class="widthOf"
          role="dialog"
          aria-modal="true"
          aria-labelledby="dlg-title"
          tabindex="-1"
          data-dialog-card
          data-testid="app-dialog"
        >
          <!-- grabber：手机端底部弹层的拖拽暗示（纯装饰） -->
          <div class="sm:hidden pt-3 pb-1 flex justify-center shrink-0">
            <span class="w-10 h-1 rounded-full bg-[var(--line)]" aria-hidden="true"></span>
          </div>

          <!-- 标题栏：关闭键绝对定位（.modal-x） -->
          <header class="px-5 sm:px-6 pt-3 sm:pt-5 pb-3 border-b border-line shrink-0">
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

          <div class="px-5 sm:px-6 py-4 flex-1 min-h-0 overflow-y-auto">
            <slot />
          </div>

          <!-- 页脚：手机端按钮拉通并堆叠（拇指可达区），桌面端右对齐 -->
          <footer
            v-if="$slots.footer"
            class="px-5 sm:px-6 pt-4 border-t border-line flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 shrink-0 [&>*]:w-full sm:[&>*]:w-auto"
            style="padding-bottom: calc(1rem + env(safe-area-inset-bottom, 0px))"
          >
            <slot name="footer" />
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
