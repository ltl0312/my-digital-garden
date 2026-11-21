<script setup lang="ts">
// 行式列表行（spec 5.3 / 6 NoteRow）
// 左缘 3px 领域色条（悬停显现）→ 徽章行 → 标题 17px → 路径（等宽 12px）→ 摘要 2 行 → 标签（最多 3 + N）→ 悬停箭头
// 紧凑模式隐藏摘要与路径；无摘要时用路径替代「暂无摘要」
import { ArrowRight, MoreHorizontal } from 'lucide-vue-next'
import { domainOfSlug, hueVarOf } from '~/composables/useFacets'
import { useLongPress, LONG_PRESS_CLASS } from '~/composables/useLongPress'
import { highlightHtml } from '~/composables/useNoteList'

const props = withDefaults(defineProps<{
  note: {
    slug: string
    title: string
    summary?: string | null
    /** 搜索态才有：后端按命中位置截取的上下文（纯文本 ≤120 字） */
    snippet?: string | null
    /** 命中位置：有 snippet 时才有；本轮只用于将来判断高亮标题还是正文 */
    matchField?: 'title' | 'content'
    maturity: string
    readingTime?: number | null
    updatedAt: string
    tags?: { tag: { name: string; count?: number } }[]
  }
  compact?: boolean
  /** 启用触屏长按操作（交付物第 22 屏）：只有「全部笔记」列表开启；
   *  首页「最近更新」是浏览入口，不挂破坏性操作。 */
  actions?: boolean
  /** 当前搜索词：用于把 snippet 里的命中片段包成 <mark>。空串＝不高亮 */
  highlight?: string
}>(), { compact: false, actions: false, highlight: '' })

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

/**
 * 命中片段的 HTML（已转义，命中词包 <mark>）。
 * 只在真的有 snippet 时才产出内容：没有 snippet 说明这条不是搜索命中，
 * 不能拿 summary 去套高亮 —— 那会把摘要里碰巧出现的同名词也标成命中。
 */
const snippetHtml = computed(() =>
  props.note.snippet ? highlightHtml(props.note.snippet, props.highlight) : ''
)
</script>

<template>
  <NuxtLink
    :to="`/notes/${note.slug.split('/').map(encodeURIComponent).join('/')}`"
    class="group relative block pl-4 py-3.5 rounded-card border border-transparent bg-surface hover:border-line hover:shadow-ds1 transition-all duration-base ease-dawn"
    :class="[actions ? LONG_PRESS_CLASS : '', actions ? 'pr-12' : 'pr-3']"
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
      <span v-if="note.readingTime" class="text-ds-xs text-ink-3">{{ note.readingTime }} 分钟</span>
      <span class="text-ds-xs text-ink-3">{{ when }}</span>
    </div>

    <!-- 标题 -->
    <h3 class="text-ds-lg font-semibold text-ink leading-title mb-1 group-hover:text-accent-text transition-colors duration-micro">
      {{ note.title }}
    </h3>

    <!-- 路径（等宽，真实数据） -->
    <p v-if="!compact && meta.dirPath" class="font-mono text-ds-xs text-ink-3 truncate mb-1.5">
      {{ meta.dirPath }}
    </p>

    <!-- 搜索命中：snippet 是后端按命中位置截取的上下文（≤120 字），比 summary 更能回答
         「这条为什么被搜到」。有 snippet 时优先显示它；渲染走 highlightHtml（先转义再包 <mark>），
         绝不把服务端字符串直接 v-html 进来。
         摘要：仅在真正有摘要时显示。此前 summary 为空会 fallback 到路径，
         与上方「路径」行重复成两条一模一样的文字（用户反馈的「重复显示」之一） -->
    <p
      v-if="!compact && note.snippet"
      class="text-ds-sm text-ink-2 leading-summary line-clamp-2"
      data-testid="note-row-snippet"
      v-html="snippetHtml"
    ></p>
    <p v-else-if="!compact && note.summary" class="text-ds-sm text-ink-2 leading-summary line-clamp-2">
      {{ note.summary }}
    </p>

    <!-- 标签 -->
    <div v-if="tagList.length" class="flex flex-wrap items-center gap-1.5 mt-2">
      <TagPill v-for="t in shown" :key="t" :name="t" />
      <span v-if="rest" class="text-ds-xs text-ink-3 font-mono">+{{ rest }}</span>
    </div>

    <!-- 悬停箭头；启用行内操作时右移，给常驻「⋯」让位（紧凑行只有 76px 高，两者会叠在一起） -->
    <ArrowRight
      class="w-4 h-4 absolute top-1/2 -translate-y-1/2 text-ink-3 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all duration-base"
      :class="actions ? 'right-12' : 'right-3'"
      aria-hidden="true"
    />

    <!-- 行内常驻「⋯」：触屏用户看不到「长按」这种隐形手势，桌面用户也不想按住 500ms。
         视觉 28×28（内层 span），点击热区 44×44（外层 p-2，8+28+8）—— 热区撑到 44 才够手指点。
         stopPropagation × 3：不拦则 pointerdown 会冒泡到整行的长按探测器、click 会顺带打开笔记。
         动作与长按同源（都 emit longpress），不是第二套操作菜单。 -->
    <button
      v-if="actions"
      type="button"
      class="group/more absolute right-0.5 top-0.5 p-2 rounded-ctl text-ink-3 transition-colors duration-micro"
      :aria-label="`更多操作：${note.title}`"
      data-testid="note-row-more"
      @click.stop.prevent="emit('longpress', note)"
      @pointerdown.stop
      @pointerup.stop
      @pointermove.stop
      @pointercancel.stop
    >
      <span class="w-7 h-7 rounded-xs flex items-center justify-center group-hover/more:bg-surface-3 group-hover/more:text-ink">
        <MoreHorizontal class="w-4 h-4" />
      </span>
    </button>
  </NuxtLink>
</template>
