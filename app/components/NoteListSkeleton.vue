<script setup lang="ts">
// 列表骨架（批次 5：状态闭环）。
//
// 为什么不是「加载中…」那一行字：真实行高 76px，一行文字只有 20px 左右，
// 数据到达时下方内容会被整体下推，CLS 直接超标。骨架块按 NoteRow 的标准行
// 尺寸（76px 高、四行节奏）占位，切换时视觉不跳动。
//
// aria-busy 让读屏软件知道「这块还在动」，而不是读到一堆空 div。
withDefaults(defineProps<{ rows?: number }>(), { rows: 6 })
</script>

<template>
  <ul class="space-y-1" aria-busy="true" data-testid="note-list-skeleton">
    <li
      v-for="i in rows"
      :key="i"
      class="px-4 py-3.5 rounded-card border border-line bg-surface min-h-[76px]"
    >
      <div class="flex items-center gap-2">
        <span class="h-3.5 w-14 rounded-full bg-surface-3 animate-pulse" />
        <span class="h-3 w-10 rounded-full bg-surface-3 animate-pulse" />
      </div>
      <span class="mt-2.5 block h-4 rounded bg-surface-3 animate-pulse" :style="{ width: `${52 + ((i * 7) % 30)}%` }" />
      <span class="mt-2 block h-3 w-full rounded bg-surface-3 animate-pulse" />
      <span class="mt-1.5 block h-3 rounded bg-surface-3 animate-pulse" :style="{ width: `${70 + ((i * 5) % 20)}%` }" />
    </li>
  </ul>
</template>
