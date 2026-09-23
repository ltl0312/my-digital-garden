<script setup lang="ts">
// 触屏长按操作面板（交付物第 09 / 22 屏）
//
// 与 TreeContextMenu（鼠标右键锚点菜单）**共用同一份 items 与权限置灰规则**，
// 差别只在呈现范式：跟随鼠标的锚点浮层 vs 贴底的拇指可达面板。
// 因此这里的 item 结构与 MenuItem 刻意保持一致（key / label / icon / danger / disabled / hint / divider），
// 调用方可以把同一份数组交给任一方渲染，不存在两套权限判断。
export interface SheetItem {
  key: string
  label: string
  /** lucide 图标组件 */
  icon?: any
  /** 红色危险项 */
  danger?: boolean
  disabled?: boolean
  /** 禁用原因或补充说明，显示在行尾 */
  hint?: string
  /** 该项之前画一条分隔线 */
  divider?: boolean
}

withDefaults(defineProps<{
  open: boolean
  items: SheetItem[]
  title?: string
  subtitle?: string
  /** 关闭项文案（点击遮罩等价） */
  cancelText?: string
}>(), { title: '', subtitle: '', cancelText: '取消' })

const emit = defineEmits<{
  (e: 'update:open', v: boolean): void
  (e: 'select', key: string): void
}>()

const pick = (it: SheetItem) => {
  if (it.disabled) return
  emit('update:open', false)
  emit('select', it.key)
}
</script>

<template>
  <Sheet
    :open="open"
    :title="title"
    max-height="86vh"
    @update:open="(v: boolean) => emit('update:open', v)"
  >
    <template v-if="subtitle" #subtitle>
      <p class="mt-1 text-[12px] text-ink-3 font-mono break-all leading-summary">{{ subtitle }}</p>
    </template>

    <ul class="-mx-1 pb-1">
      <li v-for="it in items" :key="it.key">
        <div v-if="it.divider" class="my-2 border-t border-line"></div>
        <button
          type="button"
          role="menuitem"
          class="w-full px-3 py-3.5 rounded-ctl flex items-center gap-3 text-left text-ds-base transition-colors duration-micro disabled:cursor-not-allowed"
          :class="it.danger
            ? 'text-danger hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] disabled:opacity-45'
            : 'text-ink-2 hover:text-ink hover:bg-surface-3 disabled:opacity-45'"
          :disabled="it.disabled"
          :title="it.hint || it.label"
          @click="pick(it)"
        >
          <component :is="it.icon" v-if="it.icon" class="w-4 h-4 shrink-0" />
          <span class="flex-1 truncate">{{ it.label }}</span>
          <span v-if="it.hint" class="text-[12px] text-ink-3 shrink-0 max-w-[46%] truncate">{{ it.hint }}</span>
        </button>
      </li>
    </ul>

    <template #footer>
      <button
        type="button"
        class="w-full py-3.5 rounded-ctl bg-surface-2 border border-line text-ds-base text-ink-2 hover:bg-surface-3 transition-colors duration-micro"
        @click="emit('update:open', false)"
      >{{ cancelText }}</button>
    </template>
  </Sheet>
</template>
