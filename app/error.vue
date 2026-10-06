<script setup lang="ts">
/**
 * 全局错误页（Nuxt 的 error.vue 不走 layout，所以这里自带一份最小外壳）。
 *
 * 为什么要有它：此前没有 error.vue，一旦某个页面加载失败（最典型的是详情页
 * `/api/notes/<slug>` 返回 404），用户看到的就是 Nuxt 默认错误页 —— 观感上
 * 「一片空白、连标题和按钮都没有」，既不知道发生了什么，也没有出路。
 * 2026-10-06 的线上故障（标题为纯数字的笔记永远入不了库 → 详情页 404）就是这个观感。
 *
 * 这里把哑故障变成可读提示：说清可能的原因、给出「重试」与「回到笔记列表」两条出路，
 * 并把状态码与原始 message 放在一个弱化的等宽块里，便于对照容器日志排查。
 */
import { AlertTriangle, FileQuestion, RotateCw, ArrowLeft, LayoutGrid } from 'lucide-vue-next'
import type { NuxtError } from '#app'

const props = defineProps<{ error: NuxtError }>()

const status = computed(() => Number(props.error?.statusCode) || 500)
const isNotFound = computed(() => status.value === 404)
const title = computed(() => (isNotFound.value ? '这篇笔记打不开' : '页面出错了'))
const hint = computed(() =>
  isNotFound.value
    ? '它可能已被删除、还没入库，或者地址不完整。若文件确实还在 vault 里，后台会自动把它补入库（watcher 每 5 分钟对账一次），稍后重试即可。'
    : '服务端返回了一个错误。可以先重试；若持续失败，请查看容器日志里的对应时间点。'
)

const retry = () => reloadNuxtApp()
const backToNotes = () => clearError({ redirect: '/notes' })
const backHome = () => clearError({ redirect: '/' })

useHead({ title: `${status.value} · 拾光` })
</script>

<template>
  <div class="min-h-screen bg-surface flex items-center justify-center px-4 py-10">
    <div class="w-full max-w-[520px] rounded-card border border-line bg-surface-2 p-6 sm:p-7 shadow-ds3">
      <div class="flex items-start gap-3">
        <div class="w-10 h-10 rounded-ctl bg-surface-3 border border-line flex items-center justify-center shrink-0">
          <FileQuestion v-if="isNotFound" class="w-5 h-5 text-ink-3" />
          <AlertTriangle v-else class="w-5 h-5 text-danger" />
        </div>
        <div class="min-w-0">
          <h1 class="text-ds-lg font-semibold text-ink">{{ title }}</h1>
          <p class="mt-1.5 text-ds-sm text-ink-2 leading-summary">{{ hint }}</p>
        </div>
      </div>

      <p class="mt-4 px-3 py-2 rounded-ctl bg-surface-3 border border-line font-mono text-[12px] text-ink-3 break-all">
        {{ status }}<span v-if="error?.message"> · {{ error.message }}</span>
      </p>

      <div class="mt-5 flex flex-wrap items-center gap-2">
        <button
          class="px-3.5 py-2 rounded-ctl text-ds-sm font-semibold bg-accent text-[var(--accent-ink)] transition-opacity duration-micro hover:opacity-90 inline-flex items-center gap-1.5"
          @click="retry"
        ><RotateCw class="w-3.5 h-3.5" />重试</button>
        <button
          class="px-3.5 py-2 rounded-ctl text-ds-sm border border-line text-ink-2 hover:bg-surface-3 transition-colors duration-micro inline-flex items-center gap-1.5"
          @click="backToNotes"
        ><ArrowLeft class="w-3.5 h-3.5" />回到笔记列表</button>
        <button
          class="px-3.5 py-2 rounded-ctl text-ds-sm border border-line text-ink-2 hover:bg-surface-3 transition-colors duration-micro inline-flex items-center gap-1.5"
          @click="backHome"
        ><LayoutGrid class="w-3.5 h-3.5" />首页</button>
      </div>
    </div>
  </div>
</template>
