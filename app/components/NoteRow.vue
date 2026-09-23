<script setup lang="ts">
// 行式列表行（spec 5.3 / 6 NoteRow）
// 左缘 3px 领域色条（悬停显现）→ 徽章行 → 标题 17px → 路径（等宽 12px）→ 摘要 2 行 → 标签（最多 3 + N）→ 悬停箭头
// 紧凑模式隐藏摘要与路径；无摘要时用路径替代「暂无摘要」
import { ArrowRight } from 'lucide-vue-next'
import { domainOfSlug, hueVarOf } from '~/composables/useFacets'
import { useLongPress, LONG_PRESS_CLASS } from '~/composables/useLongPress'

const props = withDefaults(defineProps<{
  note: {
    slug: string
    title: string
    summary?: string | null
    maturity: string
    readingTime?: number | null
    updatedAt: string
    tags?: { tag: { name: string; count?: number } }[]
  }
  compact?: boolean
  /** 启用触屏长按操作（交付物第 22 屏）：只有「全部笔记」列表开启；
   *  首页「最近更新」是浏览入口，不挂破坏性操作。 */
  actions?: boolean
}>(), { compact: false, actions: false })

const emit = defineEmits<{
  (e: 'longpress', note: any): void
}>()

// 长按仅在 `actions` 为真时注册。**不能无条件绑上** —— useLongPress 在长按触发后会吞掉
// 紧随其后的 click，若始终注册，整行的「点开笔记」就会在按住 500ms 后失效。
const longPress = useLongPress(() => emit('longpress', props.note))
const onContextMenu = (e: MouseEvent) => {
  // 触屏长按在 Android 上会同时触发 contextmenu，必须拦掉；
  // 桌面右键则保持原样（用户仍可用浏览器菜单「在新标签页打开」）。
  if (props.actions) e.preventDefault()
}

const meta = computed(() => domainOfSlug(props.note.slug))
const hue = computed(() => `var(${hueVarOf(meta.value.domain || '其他')})`)
const tagList = computed(() => (props.note.tags || []).map(t => t.tag.name))
const shown = computed(() => tagList.value.slice(0, 3))
const rest = computed(() => Math.max(0, tagList.value.length - shown.value.length))

const when = computed(() => {
  const d = new Date(props.note.updatedAt)
  const now = Date.now()
  const min = Math.round((now - d.getTime()) / 60000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr} 小时前`
  const day = Math.round(hr / 24)
  if (day < 30) return `${day} 天前`
  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' })
})
</script>

<template>
  <NuxtLink
    :to="`/notes/${note.slug.split('/').map(encodeURIComponent).join('/')}`"
    class="group relative block pl-4 pr-3 py-3.5 rounded-card border border-transparent bg-surface hover:border-line hover:shadow-ds1 transition-all duration-base ease-dawn"
    :class="actions ? LONG_PRESS_CLASS : ''"
    data-testid="note-row"
    :style="{ '--h': hue }"
    @pointerdown="actions && longPress.onPointerdown($event)"
    @pointermove="actions && longPress.onPointermove($event)"
    @pointerup="actions && longPress.onPointerup($event)"
    @pointercancel="actions && longPress.onPointercancel($event)"
    @click.capture="actions && longPress.onClickCapture($event)"
    @contextmenu="onContextMenu"
  >
    <!-- 左缘领域色条（悬停显现） -->
    <span
      class="absolute left-0 top-3 bottom-3 w-[3px] rounded-full hue-bar opacity-0 group-hover:opacity-100 transition-opacity duration-base"
      aria-hidden="true"
    ></span>

    <!-- 徽章行 -->
    <div class="flex items-center flex-wrap gap-x-2 gap-y-1 mb-1.5">
      <StatusBadge :maturity="note.maturity" />
      <DomainChip v-if="meta.domain" :name="meta.domain" size="sm" />
      <span v-if="note.readingTime" class="text-[12px] text-ink-3">{{ note.readingTime }} 分钟</span>
      <span class="text-[12px] text-ink-3">{{ when }}</span>
    </div>

    <!-- 标题 -->
    <h3 class="text-ds-lg font-semibold text-ink leading-title mb-1 group-hover:text-accent transition-colors duration-micro">
      {{ note.title }}
    </h3>

    <!-- 路径（等宽，真实数据） -->
    <p v-if="!compact && meta.dirPath" class="font-mono text-[12px] text-ink-3 truncate mb-1.5">
      {{ meta.dirPath }}
    </p>

    <!-- 摘要：仅在真正有摘要时显示。此前 summary 为空会 fallback 到路径，
         与上方「路径」行重复成两条一模一样的文字（用户反馈的「重复显示」之一） -->
    <p v-if="!compact && note.summary" class="text-ds-sm text-ink-2 leading-summary line-clamp-2">
      {{ note.summary }}
    </p>

    <!-- 标签 -->
    <div v-if="tagList.length" class="flex flex-wrap items-center gap-1.5 mt-2">
      <TagPill v-for="t in shown" :key="t" :name="t" />
      <span v-if="rest" class="text-[12px] text-ink-3 font-mono">+{{ rest }}</span>
    </div>

    <!-- 悬停箭头 -->
    <ArrowRight
      class="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-ink-3 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all duration-base"
      aria-hidden="true"
    />
  </NuxtLink>
</template>
