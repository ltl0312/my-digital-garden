<script setup lang="ts">
import { Plus } from 'lucide-vue-next'

// FAB（交付物第 02 / 03 / 13 屏）：手机端拇指可达的「新建」入口，52×52 / 圆角 17（与设计稿一致）。
//
// 只负责展示与开合，三项动作由父级处理 —— 父级持有 create 菜单状态，
// 保证 FAB 与顶栏下拉走的是同一套动作实现（见 CreateMenuItems）。
//
// 滚动隐藏（交付物 §5 ②）：`hidden` 由 useScrollActivity 传入。
// 动效只用 transform + opacity（scale / translateY），不触碰布局尺寸 —— 否则会抖动列表。
//
// 不变量：视觉隐藏 ≠ 不可达。顶栏在手机端仍保留紧凑「新建」按钮，
// 所以 FAB 隐藏期间不会出现「没有任何新建入口」的死路。
const props = defineProps<{ open: boolean; hidden?: boolean }>()
const emit = defineEmits<{
  (e: 'update:open', v: boolean): void
  (e: 'note'): void
  (e: 'folder'): void
  (e: 'import'): void
}>()
</script>

<template>
  <!-- z-20：低于抽屉遮罩（z-30）与抽屉（z-40），抽屉打开时被正确盖住 -->
  <div class="sm:hidden absolute bottom-4 right-4 z-20" data-create-menu data-testid="app-fab">
    <div
      v-if="open"
      class="absolute bottom-[62px] right-0 w-44 rounded-card bg-surface border border-line shadow-ds3 p-1"
      role="menu"
    >
      <CreateMenuItems @note="emit('note')" @folder="emit('folder')" @import="emit('import')" />
    </div>

    <button
      type="button"
      class="w-[52px] h-[52px] rounded-[17px] bg-accent text-[var(--accent-ink)] shadow-ds3 flex items-center justify-center transition-[transform,opacity] duration-base ease-dawn"
      :class="props.hidden && !open ? 'translate-y-[160%] opacity-0 pointer-events-none scale-90' : 'translate-y-0 opacity-100 scale-100'"
      title="新建（笔记 / 文件夹 / 导入）"
      aria-label="新建"
      aria-haspopup="menu"
      :aria-expanded="open"
      @click="emit('update:open', !open)"
    >
      <Plus
        class="w-6 h-6 transition-transform duration-base ease-dawn"
        :class="open ? 'rotate-45' : ''"
        :stroke-width="2.5"
      />
    </button>
  </div>
</template>
