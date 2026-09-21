<script setup lang="ts">
// 越权兜底页（spec 6 / 8.3 user 形态）：锁形图标 + 说明 + 两个出口 + 服务端兜底提示
import { Lock, House, BookOpen } from 'lucide-vue-next'

withDefaults(defineProps<{
  title?: string
  message?: string
}>(), {
  title: '无权限访问密钥管理',
  message: '当前身份为普通用户（只读），密钥管理仅对初始管理员与普通管理员开放。'
})
</script>

<template>
  <section class="rounded-card border border-line bg-surface p-8 text-center shadow-ds1">
    <div class="w-12 h-12 mx-auto mb-4 rounded-full bg-surface-3 border border-line flex items-center justify-center">
      <Lock class="w-5 h-5 text-ink-3" />
    </div>
    <h2 class="text-ds-lg font-semibold text-ink mb-1.5">{{ title }}</h2>
    <p class="text-ds-sm text-ink-2 leading-summary max-w-[46ch] mx-auto">{{ message }}</p>

    <p class="mt-4 inline-flex items-center gap-1.5 text-[12px] text-ink-3 px-2.5 py-1 rounded-full bg-surface-3 border border-line">
      界面隐藏不等于权限放开：以上接口在服务端同样返回 403
    </p>

    <div class="flex flex-col sm:flex-row items-center justify-center gap-2.5 mt-6">
      <NuxtLink
        to="/"
        class="w-full sm:w-auto px-4 py-2 rounded-ctl text-ds-sm border border-line text-ink-2 hover:bg-surface-3 transition-colors duration-micro inline-flex items-center justify-center gap-1.5"
      >
        <House class="w-4 h-4" />返回首页
      </NuxtLink>
      <NuxtLink
        to="/notes"
        class="w-full sm:w-auto px-4 py-2 rounded-ctl text-ds-sm font-semibold bg-accent text-[var(--accent-ink)] hover:opacity-90 transition-opacity duration-micro inline-flex items-center justify-center gap-1.5"
      >
        <BookOpen class="w-4 h-4" />浏览笔记
      </NuxtLink>
    </div>
  </section>
</template>
