<!--
  颜色规则面板（需求 m00991 第 4/5/6 条）。

  「批量上色」在这里被重写成**一条记录在案的规则**：选一个维度（文件路径 / 文件名 /
  tag 标签 / 笔记属性 / 文章内容 / 领域 / 成熟度）、填一个值、挑一个颜色，添加。
  规则列表从上到下就是优先级，第一个命中的规则生效。

  原来写死在代码里的「按领域」「按成熟度」配色也变成了这个列表里的预置规则
  （见 useGraphColorRules 的 defaultRules），因此可以改颜色、可以调顺序、可以停用。

  面板只负责表单与列表；求值在 app/lib/graph-rules.ts，同步在 useGraphColorRules。
-->
<template>
  <section
    class="flex flex-col gap-3 p-3 border-t border-line"
    data-testid="graph-rule-panel"
    aria-label="颜色规则"
  >
    <header class="flex items-center justify-between gap-2">
      <h2 class="text-[12px] font-semibold text-ink-3">
        颜色规则
        <span class="ml-1 font-normal text-ink-3 tabular-nums" data-testid="graph-rule-count">{{ enabledCount }}/{{ count }}</span>
      </h2>
      <span
        class="text-[11px] text-ink-3 tabular-nums shrink-0"
        data-testid="graph-rule-sync"
        :title="syncTitle"
      >
        <template v-if="syncError">同步失败</template>
        <template v-else-if="syncing">同步中…</template>
        <template v-else-if="syncedLabel">{{ syncedLabel }}</template>
        <template v-else>未同步</template>
      </span>
    </header>

    <p class="text-[11px] leading-relaxed text-ink-3">
      从上到下依次匹配，<b class="font-medium text-ink-2">第一条命中</b>的规则生效；右键给单个节点设的颜色优先级最高。
      新规则会插到领域 / 成熟度配色之上，添加后立刻生效。
    </p>

    <!-- ---------- 新建规则 ---------- -->
    <div class="rounded-[6px] border border-line bg-surface-2 p-2" data-testid="graph-rule-form">
      <div class="grid grid-cols-2 gap-1.5">
        <label class="flex flex-col gap-0.5">
          <span class="text-[10px] text-ink-3">匹配维度</span>
          <select
            :value="draft.field"
            class="h-7 px-1.5 rounded-[5px] border border-line bg-surface text-[11px] text-ink focus:outline-none focus:border-[var(--accent)]"
            data-testid="graph-rule-field"
            aria-label="匹配维度"
            @change="onFieldChange(($event.target as HTMLSelectElement).value)"
          >
            <option v-for="f in RULE_FIELD_ORDER" :key="f" :value="f">{{ COLOR_RULE_FIELD_LABEL[f] }}</option>
          </select>
        </label>
        <label class="flex flex-col gap-0.5">
          <span class="text-[10px] text-ink-3">匹配方式</span>
          <select
            :value="draft.op"
            class="h-7 px-1.5 rounded-[5px] border border-line bg-surface text-[11px] text-ink focus:outline-none focus:border-[var(--accent)] disabled:opacity-60"
            :disabled="ops.length <= 1"
            data-testid="graph-rule-op"
            aria-label="匹配方式"
            @change="emit('update:draft', { op: ($event.target as HTMLSelectElement).value as ColorRuleOp })"
          >
            <option v-for="o in ops" :key="o" :value="o">{{ COLOR_RULE_OP_LABEL[o] }}</option>
          </select>
        </label>
      </div>

      <!-- 笔记属性是键值对：先说属性名，再说属性值 -->
      <label v-if="draft.field === 'property'" class="mt-1.5 flex flex-col gap-0.5">
        <span class="text-[10px] text-ink-3">属性名</span>
        <input
          :value="draft.key"
          type="text"
          autocomplete="off"
          placeholder="如 status / type / 状态"
          class="w-full h-7 px-2 rounded-[5px] border border-line bg-surface text-[11px] text-ink placeholder:text-ink-3 focus:outline-none focus:border-[var(--accent)]"
          data-testid="graph-rule-key"
          aria-label="属性名"
          @input="emit('update:draft', { key: ($event.target as HTMLInputElement).value })"
        >
      </label>

      <div class="mt-1.5 flex flex-col gap-0.5">
        <div class="flex items-center gap-1.5">
          <span class="text-[10px] text-ink-3 shrink-0">匹配值</span>
          <select
            v-if="valueOptions.length"
            class="ml-auto h-6 max-w-[120px] px-1 rounded-[5px] border border-line bg-surface text-[10px] text-ink-2 focus:outline-none focus:border-[var(--accent)]"
            data-testid="graph-rule-value-pick"
            aria-label="从已有值里选"
            @change="emit('update:draft', { value: ($event.target as HTMLSelectElement).value })"
          >
            <option value="">从已有值里选…</option>
            <option v-for="v in valueOptions" :key="v" :value="v">{{ v }}</option>
          </select>
        </div>
        <input
          :value="draft.value"
          type="text"
          autocomplete="off"
          :placeholder="valuePlaceholder"
          class="w-full h-7 px-2 rounded-[5px] border border-line bg-surface text-[11px] text-ink placeholder:text-ink-3 focus:outline-none focus:border-[var(--accent)]"
          data-testid="graph-rule-value"
          aria-label="匹配值"
          @input="emit('update:draft', { value: ($event.target as HTMLInputElement).value })"
        >
      </div>

      <!-- 颜色 -->
      <div class="mt-1.5 grid grid-cols-10 gap-1" data-testid="graph-rule-palette">
        <button
          v-for="c in NODE_COLOR_PALETTE"
          :key="c"
          type="button"
          class="h-5 rounded-[4px] border transition-transform duration-micro hover:scale-110"
          :class="c === draft.color ? 'border-[var(--ink)] ring-1 ring-[var(--ink)]' : 'border-line'"
          :style="{ background: c }"
          :data-testid="`graph-rule-color-${c.slice(1)}`"
          :aria-label="`用 ${c}`"
          :title="c"
          @click="emit('update:draft', { color: c })"
        ></button>
      </div>

      <!-- 预览：添加之前先看清这条规则会命中谁 -->
      <p
        class="mt-1.5 text-[11px] leading-relaxed"
        :class="previewError ? 'text-[var(--danger,#B4232A)]' : 'text-ink-3'"
        data-testid="graph-rule-preview"
      >
        {{ previewText }}
      </p>

      <button
        type="button"
        class="mt-1.5 w-full h-7 rounded-[6px] bg-[var(--accent)] text-[var(--accent-ink)] text-[11px] font-medium hover:opacity-90 transition-opacity duration-micro disabled:opacity-40"
        :disabled="!canAdd"
        data-testid="graph-rule-submit"
        @click="emit('add')"
      >
        添加规则
      </button>
    </div>

    <!-- ---------- 规则列表（从上到下 = 优先级） ---------- -->
    <ul v-if="rules.length" class="space-y-1" data-testid="graph-rule-list">
      <li
        v-for="(r, i) in rules"
        :key="r.id"
        class="rounded-[6px] border border-line bg-surface-2"
        :class="r.enabled ? '' : 'opacity-55'"
        data-testid="graph-rule-item"
        :data-rule-id="r.id"
        :data-rule-field="r.field"
        :data-rule-color="r.color"
        :data-rule-enabled="r.enabled ? '1' : '0'"
      >
        <div class="flex items-center gap-1.5 p-1.5">
          <button
            type="button"
            class="w-4 h-4 rounded-[4px] border border-line shrink-0"
            :style="{ background: r.color }"
            :data-testid="`graph-rule-swatch-${r.id}`"
            aria-label="修改颜色"
            title="修改颜色"
            @click="toggleEditor(r.id)"
          ></button>
          <div class="min-w-0 flex-1">
            <div class="text-[11px] text-ink truncate" :title="ruleDescription(r)">{{ ruleDescription(r) }}</div>
            <div class="text-[10px] text-ink-3 tabular-nums" data-testid="graph-rule-item-matches">
              <template v-if="r.field === 'content' || r.field === 'property'">
                <template v-if="matchSets[r.id]">{{ matchCount(r) }} 个节点</template>
                <template v-else-if="matchPending">检索中…</template>
                <template v-else>—</template>
              </template>
              <template v-else>{{ matchCount(r) }} 个节点</template>
            </div>
          </div>
          <div class="flex items-center shrink-0">
            <button
              type="button"
              class="w-5 h-5 grid place-items-center rounded-[4px] text-ink-3 hover:text-ink hover:bg-surface-3 transition-colors duration-micro"
              :data-testid="`graph-rule-toggle-${r.id}`"
              :aria-label="r.enabled ? '停用这条规则' : '启用这条规则'"
              :title="r.enabled ? '停用' : '启用'"
              @click="emit('toggle', r.id)"
            >
              <Eye v-if="r.enabled" class="w-3 h-3" />
              <EyeOff v-else class="w-3 h-3" />
            </button>
            <button
              type="button"
              class="w-5 h-5 grid place-items-center rounded-[4px] text-ink-3 hover:text-ink hover:bg-surface-3 transition-colors duration-micro disabled:opacity-30"
              :disabled="i === 0"
              :data-testid="`graph-rule-up-${r.id}`"
              aria-label="提高优先级"
              title="提高优先级"
              @click="emit('move', r.id, -1)"
            >
              <ChevronUp class="w-3 h-3" />
            </button>
            <button
              type="button"
              class="w-5 h-5 grid place-items-center rounded-[4px] text-ink-3 hover:text-ink hover:bg-surface-3 transition-colors duration-micro disabled:opacity-30"
              :disabled="i === rules.length - 1"
              :data-testid="`graph-rule-down-${r.id}`"
              aria-label="降低优先级"
              title="降低优先级"
              @click="emit('move', r.id, 1)"
            >
              <ChevronDown class="w-3 h-3" />
            </button>
            <button
              type="button"
              class="w-5 h-5 grid place-items-center rounded-[4px] text-ink-3 hover:text-[var(--danger,#B4232A)] hover:bg-surface-3 transition-colors duration-micro"
              :data-testid="`graph-rule-remove-${r.id}`"
              aria-label="删除这条规则"
              title="删除"
              @click="emit('remove', r.id)"
            >
              <Trash2 class="w-3 h-3" />
            </button>
          </div>
        </div>

        <!-- 行内编辑：改颜色 / 改匹配值 -->
        <div v-if="editingId === r.id" class="border-t border-line p-1.5" :data-testid="`graph-rule-editor-${r.id}`">
          <div class="grid grid-cols-10 gap-1">
            <button
              v-for="c in NODE_COLOR_PALETTE"
              :key="c"
              type="button"
              class="h-4 rounded-[3px] border transition-transform duration-micro hover:scale-110"
              :class="c === r.color ? 'border-[var(--ink)] ring-1 ring-[var(--ink)]' : 'border-line'"
              :style="{ background: c }"
              :data-testid="`graph-rule-edit-color-${r.id}-${c.slice(1)}`"
              :aria-label="`改成 ${c}`"
              @click="emit('update', r.id, { color: c })"
            ></button>
          </div>
          <input
            :value="r.field === 'property' ? (r.key ?? '') : r.value"
            type="text"
            :placeholder="r.field === 'property' ? '属性名' : '匹配值'"
            class="mt-1.5 w-full h-7 px-2 rounded-[5px] border border-line bg-surface text-[11px] text-ink placeholder:text-ink-3 focus:outline-none focus:border-[var(--accent)]"
            :data-testid="`graph-rule-edit-input-${r.id}`"
            :aria-label="r.field === 'property' ? '属性名' : '匹配值'"
            @input="emit('update', r.id, r.field === 'property'
              ? { key: ($event.target as HTMLInputElement).value }
              : { value: ($event.target as HTMLInputElement).value })"
          >
          <input
            v-if="r.field === 'property'"
            :value="r.value"
            type="text"
            placeholder="属性值"
            class="mt-1 w-full h-7 px-2 rounded-[5px] border border-line bg-surface text-[11px] text-ink placeholder:text-ink-3 focus:outline-none focus:border-[var(--accent)]"
            :data-testid="`graph-rule-edit-value-${r.id}`"
            aria-label="属性值"
            @input="emit('update', r.id, { value: ($event.target as HTMLInputElement).value })"
          >
          <button
            type="button"
            class="mt-1.5 w-full h-6 rounded-[5px] border border-line text-[11px] text-ink-2 hover:bg-surface-3 transition-colors duration-micro"
            :data-testid="`graph-rule-edit-done-${r.id}`"
            @click="editingId = null"
          >
            完成
          </button>
        </div>
      </li>
    </ul>
    <p v-else class="text-[11px] text-ink-3" data-testid="graph-rule-empty">
      还没有任何规则，节点按默认色显示。
    </p>

    <div class="flex items-center gap-1.5">
      <button
        type="button"
        class="flex-1 h-7 rounded-[6px] border border-line text-[11px] text-ink-2 hover:bg-surface-3 transition-colors duration-micro"
        data-testid="graph-rule-add-defaults"
        @click="emit('add-defaults')"
      >
        补充默认配色
      </button>
      <button
        type="button"
        class="flex-1 h-7 rounded-[6px] border border-line text-[11px] text-ink-2 hover:bg-surface-3 transition-colors duration-micro"
        data-testid="graph-rule-reset"
        @click="emit('reset')"
      >
        恢复默认配色
      </button>
    </div>

    <p v-if="matchError" class="text-[11px] leading-relaxed text-[var(--danger,#B4232A)]" data-testid="graph-rule-match-error">
      检索失败：{{ matchError }}
    </p>
    <p class="text-[11px] leading-relaxed text-ink-3">
      规则按你的身份同步到服务端，换设备重新登录同一密钥即恢复。
    </p>
  </section>
</template>

<script setup lang="ts">
import { ChevronDown, ChevronUp, Eye, EyeOff, Trash2 } from 'lucide-vue-next'
import type { ColorRule, ColorRuleField, ColorRuleOp } from '#shared/graph-colors'
import { COLOR_RULE_FIELD_LABEL, COLOR_RULE_OP_LABEL, ruleOpsFor } from '#shared/graph-colors'
import { NODE_COLOR_PALETTE } from '~/lib/graph-constants'
import {
  RULE_FIELD_ORDER,
  countRuleMatches,
  ruleDescription,
  type RuleDraft,
  type RuleMatchSets,
  type RuleSubject
} from '~/lib/graph-rules'

const props = defineProps<{
  rules: ColorRule[]
  count: number
  enabledCount: number
  /** 全部图谱节点（用来在本地算「这条规则命中几个」） */
  nodes: RuleSubject[]
  /** 服务端侧维度（正文 / 笔记属性）的命中集合 */
  matchSets: RuleMatchSets
  matchPending: boolean
  matchError: string | null
  draft: RuleDraft
  /** 草稿规则的匹配数（由页面算，正文 / 属性走服务端） */
  previewCount: number
  previewPending: boolean
  previewError: string | null
  syncing: boolean
  syncError: string | null
  lastSyncedAt: string | null
  /** 领域 / 成熟度的可选值（做成下拉，避免手打错字导致 equals 匹配不到） */
  domainOptions: string[]
  maturityOptions: { value: string; label: string }[]
}>()

const emit = defineEmits<{
  (e: 'update:draft', patch: Partial<RuleDraft>): void
  (e: 'add'): void
  (e: 'update', id: string, patch: Partial<ColorRule>): void
  (e: 'remove', id: string): void
  (e: 'move', id: string, delta: number): void
  (e: 'toggle', id: string): void
  (e: 'add-defaults'): void
  (e: 'reset'): void
}>()

const editingId = ref<string | null>(null)
function toggleEditor(id: string) {
  editingId.value = editingId.value === id ? null : id
}

const ops = computed(() => ruleOpsFor(props.draft.field))

/** 领域 / 成熟度用现成值下拉，其余维度没有「现成值」的概念 */
const valueOptions = computed(() => {
  if (props.draft.field === 'domain') return props.domainOptions
  if (props.draft.field === 'maturity') return props.maturityOptions.map(m => m.value)
  return []
})

const valuePlaceholder = computed(() => {
  switch (props.draft.field) {
    case 'path': return '如 KnowledgeBase/03_Knowledge'
    case 'filename': return '如 MOC'
    case 'tag': return '如 前端'
    case 'property': return '如 已发布'
    case 'content': return '正文里出现的词（服务端检索）'
    case 'domain': return '领域名'
    default: return '成熟度'
  }
})

/** 维度变了要顺手把算子重置成该维度允许的第一个（领域/成熟度只有 equals） */
function onFieldChange(field: string) {
  const next = field as ColorRuleField
  const allowed = ruleOpsFor(next)
  emit('update:draft', {
    field: next,
    op: allowed.includes(props.draft.op) ? props.draft.op : (allowed[0] ?? 'contains'),
    key: next === 'property' ? props.draft.key : ''
  })
}

const matchCount = (rule: ColorRule) => countRuleMatches(rule, props.nodes, props.matchSets)

const previewText = computed(() => {
  if (!props.draft.value && props.draft.field !== 'property') return '填一个匹配值，这里会显示会命中多少节点'
  if (props.draft.field === 'property' && (!props.draft.key || !props.draft.value)) {
    return '填好属性名与属性值，这里会显示会命中多少节点'
  }
  if (props.previewError) return `匹配失败：${props.previewError}`
  if (props.previewPending) return '匹配中…'
  return `将命中 ${props.previewCount} 个节点`
})

const canAdd = computed(() =>
  !!props.draft.value
  && (props.draft.field !== 'property' || !!props.draft.key)
  && !props.previewError
)

const syncedLabel = computed(() => {
  const iso = props.lastSyncedAt
  if (!iso) return ''
  const t = new Date(iso)
  if (Number.isNaN(t.getTime())) return '已同步'
  const hh = String(t.getHours()).padStart(2, '0')
  const mm = String(t.getMinutes()).padStart(2, '0')
  return `已同步 ${hh}:${mm}`
})
const syncTitle = computed(() => props.syncError || syncedLabel.value || '尚未与服务端同步')
</script>
