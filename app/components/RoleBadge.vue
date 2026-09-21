<script setup lang="ts">
// 角色徽章（spec 6 / 8.1）：三种角色 —— 王冠 / 盾牌 / 用户
import { Crown, ShieldCheck, User, Lock } from 'lucide-vue-next'

const props = withDefaults(defineProps<{
  role: string
  /** 内置身份（role=root 且 isBuiltin）额外显示锁形标识与说明 */
  builtin?: boolean
}>(), { builtin: false })

const meta = computed(() => {
  if (props.role === 'root') {
    return { icon: Crown, label: '初始管理员', cls: 'text-seedling border-seedling/35 bg-[color-mix(in_srgb,var(--seedling)_12%,transparent)]' }
  }
  if (props.role === 'admin') {
    return { icon: ShieldCheck, label: '普通管理员', cls: 'text-evergreen border-evergreen/35 bg-[color-mix(in_srgb,var(--evergreen)_12%,transparent)]' }
  }
  return { icon: User, label: '普通用户', cls: 'text-ink-2 border-line bg-surface-3' }
})
</script>

<template>
  <span class="inline-flex items-center gap-1.5 shrink-0">
    <span
      class="inline-flex items-center gap-1 h-[24px] px-2 rounded-full border text-[12px] font-semibold"
      :class="meta.cls"
    >
      <component :is="meta.icon" class="w-3.5 h-3.5" />
      {{ meta.label }}
    </span>
    <span
      v-if="builtin || role === 'root'"
      class="inline-flex items-center gap-1 text-[12px] text-ink-3"
      title="内置唯一身份，不可禁用 / 删除 / 再创建"
    >
      <Lock class="w-3 h-3" />内置
    </span>
  </span>
</template>
