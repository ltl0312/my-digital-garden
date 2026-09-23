<script setup lang="ts">
import { FilePlus, FolderPlus, Upload } from 'lucide-vue-next'

// 「新建」的三项动作 —— 顶栏下拉与手机 FAB 弹出层共用同一份实现，
// 避免两处各写一遍后在文案/图标/可管理性上漂移。
// 调用方负责 `v-if="canManage"` 的门禁与外层容器样式。
const emit = defineEmits<{
  (e: 'note'): void
  (e: 'folder'): void
  (e: 'import'): void
}>()

const ITEM_CLASS =
  'w-full px-3 py-2 rounded-ctl text-ds-sm text-left flex items-center gap-2 text-ink-2 hover:text-ink hover:bg-surface-3 transition-colors duration-micro'
</script>

<template>
  <button type="button" :class="ITEM_CLASS" @click="emit('note')">
    <FilePlus class="w-3.5 h-3.5 text-accent shrink-0" />新建笔记
  </button>
  <button type="button" :class="ITEM_CLASS" @click="emit('folder')">
    <FolderPlus class="w-3.5 h-3.5 text-accent shrink-0" />新建文件夹
  </button>
  <button type="button" :class="ITEM_CLASS" @click="emit('import')">
    <Upload class="w-3.5 h-3.5 text-accent shrink-0" />导入笔记
  </button>
</template>
