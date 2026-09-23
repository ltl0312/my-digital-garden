<script setup lang="ts">
import { X } from 'lucide-vue-next'

// 底部抽屉（交付物第 09 / 11 / 12 / 13 / 22 屏共用的容器）
//
// 触屏浮层的统一范式：贴底、圆角 24、含 grabber 拖拽暗示、内容区独立滚动、安全区内边距。
// 与 AppDialog（居中卡片）的**语义完全相同**，只是呈现范式不同 —— 二者的选择由触发方式决定，
// 不改变任何业务逻辑。
//
// 顺序刻意安排为「遮罩 → 卡片」，两者各自独立过渡：遮罩淡入，卡片自下而上滑入。
const props = withDefaults(defineProps<{
  open: boolean
  title?: string
  /** 内容区最大高度（CSS 值） */
  maxHeight?: string
  /** 点击遮罩是否关闭 */
  closeOnOverlay?: boolean
  /** 是否显示右上角关闭键（列表型面板通常不需要，靠底部「取消」关闭） */
  closable?: boolean
}>(), {
  title: '',
  maxHeight: '86vh',
  closeOnOverlay: true,
  closable: false
})

const emit = defineEmits<{
  (e: 'update:open', v: boolean): void
  (e: 'close'): void
}>()

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
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-[120] flex flex-col justify-end"
      @keydown="onKeydown"
    >
      <Transition
        enter-active-class="transition-opacity duration-base ease-dawn"
        enter-from-class="opacity-0"
        leave-active-class="transition-opacity duration-micro ease-dawn"
        leave-to-class="opacity-0"
      >
        <div
          v-if="open"
          class="absolute inset-0 bg-[color-mix(in_srgb,var(--ink)_45%,transparent)]"
          @click="onOverlay"
        ></div>
      </Transition>

      <Transition
        appear
        enter-active-class="transition-transform duration-base ease-dawn"
        enter-from-class="translate-y-full"
        leave-active-class="transition-transform duration-micro ease-dawn"
        leave-to-class="translate-y-full"
      >
        <div
          v-if="open"
          class="relative w-full flex flex-col rounded-t-[24px] border-t border-line bg-surface shadow-ds3"
          :style="{ maxHeight }"
          role="dialog"
          aria-modal="true"
          data-testid="sheet"
        >
          <!-- grabber：拖拽暗示（纯装饰，关闭靠遮罩 / 取消 / ESC） -->
          <div class="pt-3 pb-1 flex justify-center shrink-0">
            <span class="w-10 h-1 rounded-full bg-[var(--line)]" aria-hidden="true"></span>
          </div>

          <header v-if="title || $slots.subtitle" class="px-5 pt-1 pb-3 shrink-0 flex items-start gap-3">
            <div class="min-w-0 flex-1">
              <h2 class="text-ds-lg font-semibold text-ink leading-title truncate">{{ title }}</h2>
              <slot name="subtitle" />
            </div>
            <button
              v-if="closable"
              type="button"
              class="shrink-0 w-8 h-8 -mt-1 rounded-ctl flex items-center justify-center text-ink-3 hover:text-ink hover:bg-surface-3 transition-colors duration-micro"
              aria-label="关闭"
              @click="close"
            >
              <X class="w-4 h-4" />
            </button>
          </header>

          <div class="flex-1 min-h-0 overflow-y-auto px-5">
            <slot />
          </div>

          <div
            v-if="$slots.footer"
            class="shrink-0 px-5 pt-3 border-t border-line"
            style="padding-bottom: calc(18px + env(safe-area-inset-bottom))"
          >
            <slot name="footer" />
          </div>
          <div v-else class="shrink-0" style="height: calc(16px + env(safe-area-inset-bottom))"></div>
        </div>
      </Transition>
    </div>
  </Teleport>
</template>
