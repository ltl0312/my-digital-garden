<script setup lang="ts">
// 确认对话框宿主：挂在布局根部，由 useConfirm() 驱动（替换原生 confirm）
const { state, settle, cancelPending } = useConfirm()
const o = computed(() => state.value.opts)

// 宿主被卸载（路由切换/布局重建）时把还悬着的 Promise 结束掉。
// 否则调用方 `await confirm()` 永不返回，它后面「关闭自己的弹窗」也就永不执行 ——
// 用户看到的就是「确认框没了，但原来的弹窗一直挂着，只能手动叉掉」。
onBeforeUnmount(() => cancelPending())
</script>

<template>
  <AppDialog
    :open="state.open"
    :title="o?.title || '请确认'"
    size="sm"
    :closable="false"
    @update:open="(v: boolean) => { if (!v) settle(false) }"
  >
    <p class="text-ds-base text-ink-2 leading-summary">{{ o?.message }}</p>
    <p
      v-if="o?.detail"
      class="mt-3 px-3 py-2 rounded-ctl bg-surface-3 border border-line font-mono text-ds-sm text-ink-2 break-all"
    >{{ o.detail }}</p>

    <template #footer>
      <button
        class="px-3.5 py-2 rounded-ctl text-ds-sm border border-line text-ink-2 hover:bg-surface-3 transition-colors duration-micro"
        @click="settle(false)"
      >{{ o?.cancelText || '取消' }}</button>
      <button
        class="px-3.5 py-2 rounded-ctl text-ds-sm font-semibold text-white transition-opacity duration-micro"
        :class="o?.danger ? 'bg-danger hover:opacity-90' : 'bg-accent text-[var(--accent-ink)] hover:opacity-90'"
        @click="settle(true)"
      >{{ o?.confirmText || '确认' }}</button>
    </template>
  </AppDialog>
</template>
