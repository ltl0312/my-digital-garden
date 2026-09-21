<script setup lang="ts">
import { CircleCheck, TriangleAlert, CircleX, X } from 'lucide-vue-next'

const { items, dismiss } = useToast()

const iconOf = (kind: string) => kind === 'success' ? CircleCheck : kind === 'error' ? CircleX : TriangleAlert
const toneOf = (kind: string) => {
  if (kind === 'success') return 'text-evergreen border-evergreen/30'
  if (kind === 'error') return 'text-danger border-danger/30'
  return 'text-seedling border-seedling/30'
}
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed z-[120] bottom-4 right-4 flex flex-col gap-2 w-[min(360px,calc(100vw-2rem))] pointer-events-none"
      role="status"
      aria-live="polite"
    >
      <TransitionGroup
        enter-active-class="transition duration-base ease-dawn"
        enter-from-class="opacity-0 translate-y-2"
        leave-active-class="transition duration-base ease-dawn"
        leave-to-class="opacity-0 translate-y-1"
      >
        <div
          v-for="t in items"
          :key="t.id"
          class="pointer-events-auto flex items-start gap-2.5 px-3.5 py-3 rounded-card border shadow-ds2 bg-surface"
          :class="toneOf(t.kind)"
        >
          <component :is="iconOf(t.kind)" class="w-4 h-4 mt-0.5 shrink-0" />
          <p class="flex-1 text-ds-sm text-ink leading-summary break-words">{{ t.text }}</p>
          <button
            class="shrink-0 -mr-1 -mt-0.5 w-7 h-7 rounded-ctl flex items-center justify-center text-ink-3 hover:text-ink hover:bg-surface-3 transition-colors duration-micro"
            aria-label="关闭提示"
            @click="dismiss(t.id)"
          >
            <X class="w-3.5 h-3.5" />
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>
