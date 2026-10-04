<template>
  <div ref="pageEl" class="h-full w-full min-h-[560px]" data-testid="graph-page">
    <ClientOnly>
      <!-- ① 加载中（骨架屏，T1.4） -->
      <GraphSkeleton v-if="loading" />

      <!-- ② 错误态（T4.1：网络失败 / 无权限 / 解析失败；与「筛选无结果」「真空态」互不复用） -->
      <div v-else-if="loadError" class="h-full w-full flex items-center justify-center p-6" data-testid="graph-error">
        <div class="w-full max-w-[420px] rounded-card border border-dashed border-line bg-surface p-6 text-center">
          <AlertTriangle class="w-6 h-6 mx-auto text-[var(--hue-32)]" />
          <h2 class="mt-3 text-ds-base font-semibold text-ink">图谱加载失败</h2>
          <p class="mt-1.5 text-ds-sm text-ink-2 leading-relaxed">{{ errorText }}</p>
          <div class="mt-4 flex items-center justify-center gap-2">
            <button
              type="button"
              class="h-9 px-3 rounded-ctl bg-[var(--accent)] text-[var(--accent-ink)] text-ds-sm font-medium hover:opacity-90 transition-opacity duration-micro inline-flex items-center gap-1.5"
              @click="retryLoad"
            >
              <RefreshCw class="w-3.5 h-3.5" /> 重试
            </button>
            <NuxtLink
              to="/"
              class="h-9 px-3 rounded-ctl border border-line text-ds-sm text-ink-2 hover:bg-surface-3 transition-colors duration-micro inline-flex items-center"
            >
              回到首页
            </NuxtLink>
          </div>
        </div>
      </div>

      <!-- ③ 图谱真空态（T4.1：vault 里还没有笔记 → 引导 + 预置 MOC 一键导入） -->
      <div v-else-if="graphIsEmpty" class="h-full w-full overflow-y-auto p-6" data-testid="graph-empty">
        <div class="mx-auto w-full max-w-[560px] rounded-card border border-line bg-surface p-6">
          <Sparkles class="w-6 h-6 text-[var(--accent)]" />
          <h2 class="mt-3 text-ds-xl font-semibold text-ink">图谱还是空的</h2>
          <p class="mt-2 text-ds-sm text-ink-2 leading-relaxed">
            vault 里还没有可发布的笔记，所以画布上没有任何节点。可以先用三篇预置的 MOC
            模板起步 —— 它们互相用 <code class="font-mono text-[12px] text-ink-2">[[双向链接]]</code> 连好，导入后立刻能看到一张小图谱。
          </p>
          <button
            type="button"
            class="mt-4 h-9 px-3 rounded-ctl bg-[var(--accent)] text-[var(--accent-ink)] text-ds-sm font-medium hover:opacity-90 transition-opacity duration-micro disabled:opacity-60 inline-flex items-center gap-1.5"
            :disabled="importingMoc"
            @click="importMocTemplates"
          >
            <Plus class="w-3.5 h-3.5" />
            {{ importingMoc ? '导入中…' : '导入 3 篇 MOC 模板' }}
          </button>
          <ul class="mt-4 space-y-1.5">
            <li v-for="t in MOC_TEMPLATES" :key="t.title" class="text-[12px] text-ink-3">
              · {{ t.title }}
            </li>
          </ul>
        </div>
      </div>

      <!-- ④ 三区骨架（A1：272 / flex / 320） -->
      <div v-else class="relative flex h-full w-full overflow-hidden bg-canvas">
        <!-- ================= 左栏 ================= -->
        <aside
          v-show="leftVisible"
          class="h-full shrink-0 border-r border-line bg-surface overflow-y-auto"
          :class="threePane ? 'relative w-[240px] xl:w-[272px]' : 'absolute inset-y-0 left-0 z-40 shadow-ds3'"
          :style="threePane ? undefined : { width: drawerW + 'px' }"
          data-testid="graph-left-panel"
          aria-label="图谱筛选"
        >
          <FilterPanel
            :filter="filter"
            :stats="stats"
            :domains="domains"
            :maturity-buckets="maturityBuckets"
            :has-selection="!!selectedId"
            :physics="physicsActive"
            :converged="renderStatus.converged"
            :render-status="renderStatus"
            @toggle-physics="togglePhysics"
          />
          <GraphTuningPanel
            :tuning="tuning"
            :label-mode="filterState.labelMode"
            :physics="physicsActive"
            :custom-color-count="renderStatus.customColorCount"
            @change="onTuningChange"
            @label-mode="setLabelMode"
            @reheat="reheatGraph"
            @reset="resetTuning"
            @clear-colors="onClearNodeColors"
          />
          <BatchColorPanel
            :query="batch.query.value"
            :fields="batch.fields"
            :summary="batch.summary.value"
            :matched-nodes="batch.matchedNodes.value"
            :matched-count="batch.matchedCount.value"
            :color-map="graphColors.colors.value"
            :syncing="graphColors.syncing.value"
            :sync-error="graphColors.error.value"
            :last-synced-at="graphColors.lastSyncedAt.value"
            :content-error="batch.contentError.value"
            @update:query="batch.query.value = $event"
            @toggle-field="batch.toggleField"
            @apply="onBatchApply"
            @clear-matched="onBatchClear"
            @locate="onBatchLocate"
          />
        </aside>

        <!-- 抽屉遮罩（非三区模式） -->
        <div
          v-if="!threePane && (leftOpen || rightOpen)"
          class="absolute inset-0 z-30 bg-[rgba(10,13,19,0.45)]"
          @click="closeOverlays"
        ></div>

        <!-- ================= 画布 ================= -->
        <div class="relative flex-1 min-w-0 h-full overflow-hidden">
          <GraphView
            ref="graphRef"
            v-model:physics-active="physicsActive"
            :nodes="viewNodes"
            :edges="viewEdges"
            :selected-id="selectedId"
            :focus-ids="activeFocusIds"
            :layout="layout"
            :label-mode="filterState.labelMode"
            :tuning="tuning"
            :picking-path="pickingPath"
            :color-map="graphColors.colors.value"
            :match-ids="batchMatchIds"
            @update:selected-id="onSelect"
            @open="openNote"
            @pick="onPick"
            @contextmenu="onGraphContextMenu"
            @set-color="onSetNodeColor"
            @clear-colors="onClearNodeColors"
          />

          <!-- 左栏收起 / 展开把手（需求 m01569 第 3 条）：只在三区模式下有意义 -->
          <button
            v-if="threePane"
            type="button"
            class="absolute left-0 top-1/2 -translate-y-1/2 z-30 h-16 w-4 rounded-r-[6px] border border-l-0 border-line bg-surface/95 backdrop-blur shadow-ds1 text-ink-3 hover:text-ink hover:bg-surface transition-colors duration-micro flex items-center justify-center"
            data-testid="graph-toggle-left"
            :data-collapsed="leftCollapsed ? '1' : '0'"
            :aria-label="leftCollapsed ? '展开图谱设置' : '收起图谱设置'"
            :title="leftCollapsed ? '展开图谱设置' : '收起图谱设置'"
            @click="leftCollapsed = !leftCollapsed"
          >
            <ChevronRight v-if="leftCollapsed" class="w-3 h-3" />
            <ChevronLeft v-else class="w-3 h-3" />
          </button>

          <!-- 顶部贴边工具栏（计划 ASCII 图允许「画布 + 贴边浮层」） -->
          <div class="absolute left-2 right-2 top-2 z-20 flex items-start gap-2 pointer-events-none">
            <div class="pointer-events-auto flex-1 min-w-0 max-w-[420px]">
              <GraphSearchPanel
                ref="searchRef"
                :nodes="allNodes"
                :domains="domains"
                :tags="tags"
                @select-note="onSearchSelect"
                @only-domain="onOnlyDomain"
                @tag="onTag"
                @command="onCommand"
              />
            </div>

            <div class="pointer-events-auto hidden sm:block w-[124px] shrink-0">
              <AppSelect v-model="layoutModel" :options="layoutOptions" size="sm" />
            </div>

            <div class="flex-1"></div>

            <button
              v-if="!threePane"
              type="button"
              class="pointer-events-auto shrink-0 h-9 px-2.5 rounded-ctl border border-line bg-surface/95 backdrop-blur shadow-ds1 text-[12px] text-ink-2 inline-flex items-center gap-1"
              data-testid="graph-open-filters"
              @click="leftOpen = !leftOpen"
            >
              <SlidersHorizontal class="w-3.5 h-3.5" /> 筛选
            </button>
            <button
              v-if="!threePane"
              type="button"
              class="pointer-events-auto shrink-0 h-9 px-2.5 rounded-ctl border border-line bg-surface/95 backdrop-blur shadow-ds1 text-[12px] text-ink-2 inline-flex items-center gap-1"
              data-testid="graph-open-detail"
              @click="rightOpen = !rightOpen"
            >
              详情
            </button>
          </div>

          <!-- 布局提示（切换布局时短暂说明） -->
          <p
            v-if="layoutHint && layout !== 'force'"
            class="absolute left-2 top-[52px] z-10 max-w-[min(320px,60%)] rounded-ctl border border-line bg-surface/90 backdrop-blur px-2 py-1 text-[11px] text-ink-3"
          >
            {{ layoutHint }}
          </p>

          <!-- 筛选空态提示条（T2.3 / T4.1：不清空画布，保留上次视图） -->
          <div
            v-if="isEmpty"
            class="absolute left-1/2 -translate-x-1/2 top-14 z-20 w-[min(560px,calc(100%-1rem))] rounded-ctl border border-[var(--hue-32)]/45 bg-surface/95 backdrop-blur shadow-ds2 px-3 py-2"
            data-testid="graph-filter-empty"
            role="status"
          >
            <p class="text-[12px] text-ink-2 leading-relaxed">{{ conflictHint }}</p>
            <div class="mt-1.5 flex items-center gap-2">
              <button type="button" class="text-[11px] text-accent hover:underline" @click="clearAll">清除全部筛选</button>
              <button
                v-if="conflictShortcut"
                type="button"
                class="text-[11px] text-ink-3 hover:text-ink hover:underline"
                @click="onlyDomain(conflictShortcut)"
              >
                只看「{{ conflictShortcut }}」
              </button>
            </div>
          </div>

          <!-- 关系类型全关提示（T2.3：提示而非空图） -->
          <p
            v-if="edgeKindHint"
            class="absolute left-1/2 -translate-x-1/2 top-14 z-20 rounded-ctl border border-line bg-surface/95 backdrop-blur shadow-ds1 px-3 py-1.5 text-[12px] text-ink-2"
            role="status"
          >
            {{ edgeKindHint }}
          </p>

          <!-- 缩略图（T3.3） -->
          <div v-if="!isPhone" class="absolute right-2 top-14 z-20" data-testid="graph-minimap-host">
            <Minimap
              v-if="minimap.nodes.length"
              :nodes="minimap.nodes"
              :canvas="minimap.canvas"
              :view="minimap.view"
              :edges="viewEdges"
              @center="onMinimapCenter"
              @zoom="onMinimapZoom"
            />
          </div>

          <!-- 缩放条（T3.4：−/百分比/+/适配全图/重置布局） -->
          <div
            class="absolute right-2 bottom-3 z-20 flex items-center gap-1 rounded-ctl border border-line bg-surface/95 backdrop-blur shadow-ds1 px-1 py-1 max-[639px]:bottom-[60px]"
          >
            <button
              type="button"
              class="w-8 h-8 rounded-[6px] flex items-center justify-center text-ink-2 hover:bg-surface-3 transition-colors duration-micro"
              aria-label="缩小"
              title="缩小"
              @click="zoomBy(1 / ZOOM.buttonStep)"
            >
              <Minus class="w-4 h-4" />
            </button>
            <span class="w-[46px] text-center font-mono text-[11px] text-ink-3 tabular-nums" data-testid="graph-zoom-level">
              {{ zoomPercent }}%
            </span>
            <button
              type="button"
              class="w-8 h-8 rounded-[6px] flex items-center justify-center text-ink-2 hover:bg-surface-3 transition-colors duration-micro"
              aria-label="放大"
              title="放大"
              @click="zoomBy(ZOOM.buttonStep)"
            >
              <ZoomIn class="w-4 h-4" />
            </button>
            <span class="w-px h-5 bg-line mx-0.5"></span>
            <button
              type="button"
              class="w-8 h-8 rounded-[6px] flex items-center justify-center text-ink-2 hover:bg-surface-3 transition-colors duration-micro"
              aria-label="适配全图"
              title="适配全图（G 然后 F）"
              @click="fitView"
            >
              <Maximize2 class="w-4 h-4" />
            </button>
            <button
              type="button"
              class="w-8 h-8 rounded-[6px] flex items-center justify-center text-ink-2 hover:bg-surface-3 transition-colors duration-micro"
              aria-label="重置布局"
              title="重置布局"
              @click="resetLayout"
            >
              <RotateCcw class="w-4 h-4" />
            </button>
          </div>

          <!-- <640 底部折叠面板（计划硬性提醒 6：沿用既有实现，只做适配） -->
          <div class="sm:hidden absolute inset-x-0 bottom-0 z-20">
            <div class="rounded-t-[20px] border-t border-line bg-surface/95 backdrop-blur shadow-ds3">
              <button
                type="button"
                class="w-full flex items-center gap-2 px-4 py-2.5 text-left"
                data-testid="graph-panel-toggle"
                :aria-expanded="mobilePanelOpen"
                aria-label="图例与统计"
                @click="mobilePanelOpen = !mobilePanelOpen"
              >
                <Network class="w-4 h-4 text-ink-3 shrink-0" />
                <span class="flex-1 text-ds-sm font-medium text-ink">图例与统计</span>
                <span class="font-mono text-[11px] text-ink-3 tabular-nums">{{ stats.nodeCount }} · {{ stats.edgeCount }} · {{ stats.isolatedCount }}</span>
                <ChevronUp
                  class="w-4 h-4 text-ink-3 transition-transform duration-base ease-dawn"
                  :class="mobilePanelOpen ? 'rotate-180' : ''"
                />
              </button>
              <div v-if="mobilePanelOpen" class="px-4 pb-4 max-h-[44vh] overflow-y-auto">
                <h3 class="text-[12px] font-semibold text-ink-3 mb-2">图例</h3>
                <ul class="space-y-1">
                  <li v-for="d in domains" :key="d.name" class="flex items-center gap-2 text-[12px] text-ink-2">
                    <span class="w-2.5 h-2.5 rounded-full shrink-0" :style="{ background: d.color }"></span>
                    <span class="flex-1 truncate">{{ d.name }}</span>
                    <span class="font-mono text-ink-3 tabular-nums shrink-0">{{ d.count }}</span>
                  </li>
                  <li v-if="!domains.length" class="text-[12px] text-ink-3">暂无领域数据</li>
                </ul>
                <h3 class="text-[12px] font-semibold text-ink-3 mt-3 mb-2">统计</h3>
                <dl class="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <dd class="font-mono text-ds-base font-bold text-ink tabular-nums">{{ stats.nodeCount }}</dd>
                    <dt class="text-[11px] text-ink-3">节点</dt>
                  </div>
                  <div>
                    <dd class="font-mono text-ds-base font-bold text-ink tabular-nums">{{ stats.edgeCount }}</dd>
                    <dt class="text-[11px] text-ink-3">连接</dt>
                  </div>
                  <div>
                    <dd class="font-mono text-ds-base font-bold text-ink tabular-nums">{{ stats.isolatedCount }}</dd>
                    <dt class="text-[11px] text-ink-3">孤立</dt>
                  </div>
                </dl>
              </div>
            </div>
          </div>

          <!-- 右键菜单（需求 m01569 第 6 条）：节点菜单与画布菜单共用同一组件 -->
          <GraphContextMenu
            v-if="menu"
            :x="menu.x"
            :y="menu.y"
            :container-w="menuBox.w"
            :container-h="menuBox.h"
            :target="menuTarget"
            :label-mode="filterState.labelMode"
            :is-path-start="!!menu.id && filter.pathFrom.value === menu.id"
            :is-path-end="!!menu.id && filter.pathTo.value === menu.id"
            @close="closeMenu"
            @open-note="openNote"
            @focus-neighbors="focusNeighbors"
            @path-start="onMenuPathStart"
            @path-end="onMenuPathEnd"
            @toggle-pin="onMenuTogglePin"
            @set-color="onMenuSetColor"
            @copy="onMenuCopy"
            @detach="onMenuDetach"
            @fit="fitView"
            @reset-layout="resetLayout"
            @reheat="reheatGraph"
            @label-mode="setLabelMode"
            @clear-filters="onMenuClearFilters"
          />
        </div>

        <!-- ================= 右栏 ================= -->
        <aside
          v-show="rightVisible"
          class="h-full shrink-0 border-l border-line bg-surface overflow-y-auto"
          :class="threePane ? 'relative w-[288px] xl:w-[320px]' : 'absolute inset-x-0 bottom-0 z-40 max-h-[64vh] rounded-t-[20px] border-t shadow-ds3'"
          data-testid="graph-right-panel"
          aria-label="节点详情与图谱概览"
        >
          <NodeDetail
            v-if="selectedNode"
            :node="selectedNode"
            :in-links="inLinks"
            :out-links="outLinks"
            @open="openNote"
            @select="onSelect"
            @locate="locateNode"
            @focus-neighbors="focusNeighbors"
            @only-domain="onOnlyDomain"
            @tag="onTag"
          />

          <!-- 默认空态：图谱概览（统计 + 孤立清单） -->
          <div v-else class="p-3 space-y-3">
            <div class="rounded-ctl border border-line bg-surface-2 p-2.5" data-testid="graph-stats">
              <h3 class="text-[12px] font-semibold text-ink-3 mb-2">图谱概览</h3>
              <dl class="grid grid-cols-3 gap-2 text-center">
                <div>
                  <dd class="font-mono text-ds-base font-bold text-ink tabular-nums">{{ stats.nodeCount }}</dd>
                  <dt class="text-[11px] text-ink-3">节点</dt>
                </div>
                <div>
                  <dd class="font-mono text-ds-base font-bold text-ink tabular-nums">{{ stats.edgeCount }}</dd>
                  <dt class="text-[11px] text-ink-3">连接</dt>
                </div>
                <div>
                  <dd class="font-mono text-ds-base font-bold text-ink tabular-nums">{{ stats.isolatedCount }}</dd>
                  <dt class="text-[11px] text-ink-3">孤立</dt>
                </div>
              </dl>
              <dl class="mt-2 pt-2 border-t border-line grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[11px] text-ink-3 tabular-nums">
                <div class="flex justify-between"><dt>显式链接</dt><dd class="text-ink-2">{{ stats.linkCount }}</dd></div>
                <div class="flex justify-between"><dt>标签共有</dt><dd class="text-ink-2">{{ stats.tagEdgeCount }}</dd></div>
                <div class="flex justify-between"><dt>领域</dt><dd class="text-ink-2">{{ stats.domainCount }}</dd></div>
                <div class="flex justify-between"><dt>标签</dt><dd class="text-ink-2">{{ stats.tagCount }}</dd></div>
              </dl>
            </div>

            <p class="text-[12px] text-ink-3 leading-relaxed">
              单击节点查看详情，双击进入正文。按 <kbd class="font-mono">⌘K</kbd> 搜索，<kbd class="font-mono">G</kbd> 然后 <kbd class="font-mono">F</kbd> 适配全图。
            </p>

            <section>
              <h3 class="text-[12px] font-semibold text-ink-3 mb-1.5">孤立笔记（{{ isolatedNodes.length }}）</h3>
              <ul v-if="isolatedNodes.length" class="space-y-0.5">
                <li v-for="n in isolatedNodes.slice(0, 12)" :key="n.id">
                  <button
                    type="button"
                    class="w-full text-left h-7 px-2 rounded-[6px] text-[12px] text-ink-2 hover:text-ink hover:bg-surface-3 transition-colors duration-micro truncate"
                    @click="locateNode(n.id)"
                  >
                    {{ n.title }}
                  </button>
                </li>
              </ul>
              <p v-else class="text-[12px] text-ink-3">没有孤立节点</p>
              <p v-if="isolatedNodes.length > 12" class="mt-1 text-[11px] text-ink-3">
                还有 {{ isolatedNodes.length - 12 }} 篇未列出
              </p>
            </section>
          </div>
        </aside>
      </div>

      <template #fallback>
        <GraphSkeleton />
      </template>
    </ClientOnly>
  </div>
</template>

<script setup lang="ts">
import {
  AlertTriangle, ChevronLeft, ChevronRight, ChevronUp, Maximize2, Minus, Network, Plus,
  RefreshCw, RotateCcw, SlidersHorizontal, Sparkles, ZoomIn
} from 'lucide-vue-next'
import type { GraphEdge, GraphTuning, LabelMode, LayoutName } from '~/lib/graph-types'
import { GRAPH_TUNING_DEFAULTS, LAYOUT_OPTIONS, MIN_THREE_PANE_WIDTH, ZOOM } from '~/lib/graph-constants'
import { patchGraphState, readGraphSettings, readGraphState, writeGraphSettings } from '~/lib/graphState'
import { useGraphData } from '~/composables/useGraphData'
import { useGraphFilter } from '~/composables/useGraphFilter'
import { useGraphColors } from '~/composables/useGraphColors'
import { useGraphBatchColor, type BatchNode } from '~/composables/useGraphBatchColor'
import { useConfirm } from '~/composables/useConfirm'
import { useToast } from '~/composables/useToast'
import { useViewport } from '~/composables/useViewport'
import GraphView from '~/components/GraphView.vue'
import type { GraphColorPayload, GraphNodeProp } from '~/components/GraphView.vue'
import GraphSkeleton from '~/components/graph/GraphSkeleton.vue'
import FilterPanel from '~/components/graph/FilterPanel.vue'
import GraphTuningPanel from '~/components/graph/GraphTuningPanel.vue'
import BatchColorPanel from '~/components/graph/BatchColorPanel.vue'
import NodeDetail from '~/components/graph/NodeDetail.vue'
import GraphSearchPanel from '~/components/graph/GraphSearchPanel.vue'
import Minimap from '~/components/graph/Minimap.vue'
import GraphContextMenu from '~/components/graph/GraphContextMenu.vue'
import AppSelect from '~/components/AppSelect.vue'

const route = useRoute()
const toast = useToast()
const { confirm } = useConfirm()
const { isDesktop, isPhone, drawerW } = useViewport()

// 三区布局需**同时**满足：视口 ≥ BP.lg(1024)（计划书 T2.1）且容器足够宽。
// 为什么还要看容器：外壳「导航栏 + 上下文侧边栏」吃掉约 384px，视口 1024 时
// 图谱页可用宽度只剩 ~640px，若仍强上三区，画布只有百余像素，
// 缩略图（164px）与缩放条会被 overflow-hidden 裁掉。
// 初值 1440 = SSR/首帧按宽屏渲染，挂载后由 ResizeObserver 校正（与 useViewport 的约定一致）。
const pageEl = ref<HTMLElement | null>(null)
const pageWidth = ref(1440)
const threePane = computed(() => isDesktop.value && pageWidth.value >= MIN_THREE_PANE_WIDTH)
let pageObserver: ResizeObserver | null = null

// graph 是普通对象（内部全是 ref），模板里必须解构出来才能自动解包。
const graph = useGraphData()
const {
  nodes: allNodes,
  edges: allEdges,
  domains,
  tags,
  maturityBuckets,
  stats,
  nodeById,
  incoming,
  outgoing,
  isolatedIds,
  pending,
  error: loadError,
  refresh: refreshGraph,
  degreeOf,
  neighborsOf
} = graph

const selectedId = ref<string | null>(null)
const filter = useGraphFilter(graph, selectedId)
const {
  state: filterState,
  edgeKindHint,
  visibleNodes,
  visibleEdges,
  isEmpty,
  conflictHint,
  conflictShortcut,
  pathNodeIds,
  pickingPath,
  onlyDomain,
  clearAll
} = filter

// ---------- 节点自定义颜色：服务端按用户同步 ----------
// 权威数据在服务端（按访问密钥隔离）；本地只留一份缓存让首帧不闪白。
// GraphView 不再自己读写 localStorage，只通过 props.colorMap 读、通过 setColor 事件写。
const graphColors = useGraphColors()

/**
 * 批量上色的圈选范围 = **全部图谱节点**，不是当前可见节点：
 * 颜色是持久化属性，不该因为此刻恰好筛掉了某个领域就上不了色。
 * 面板上会另外显示「其中 M 个当前可见」。
 */
const batchNodes = computed<BatchNode[]>(() =>
  allNodes.value.map(n => ({ id: n.id, slug: n.slug, title: n.title, dirPath: n.dirPath, tags: n.tags }))
)
const visibleNodeIds = computed(() => new Set(visibleNodes.value.map(n => n.id)))
const batch = useGraphBatchColor(batchNodes, visibleNodeIds)
/** 传给 GraphView 的圈选高亮（数组形式，方便 watch 比较） */
const batchMatchIds = computed(() => [...batch.matchedIds.value])

// ---------- 视图状态 ----------
interface MinimapSnapshot {
  nodes: { id: string; x: number; y: number; r: number; degree: number; domain?: string; color?: string }[]
  canvas: { w: number; h: number }
  view: { x: number; y: number; k: number }
}
interface RenderStatus {
  fps: number
  firstPaintMs: number
  nodeCount: number
  edgeCount: number
  drawnCount: number
  tier: 'svg' | 'canvas'
  converged: boolean
  zoomK: number
  labelMode: LabelMode
  labelCount: number
  mocCount: number
  focusedCount: number
  customColorCount: number
  tuning: GraphTuning
}
/** GraphView / GraphSearchPanel 通过 defineExpose 暴露的方法（只列本页用到的） */
interface GraphViewApi {
  resetLayout: () => void
  togglePhysics: () => void
  reheat: (alpha?: number) => void
  zoomBy: (factor: number) => void
  fitView: () => void
  focusNode: (key: string) => boolean
  centerOn: (gx: number, gy: number) => void
  zoomTo: (k: number) => void
  setNodeColor: (id: string, color: string | null) => void
  resetNodeColors: () => void
  nodeColorOf: (id: string) => string | null
  togglePin: (id: string) => boolean
  isPinned: (id: string) => boolean
  minimap: () => MinimapSnapshot
  renderStatus: () => RenderStatus
}
interface SearchPanelApi {
  focus: () => void
  close: () => void
}

const graphRef = ref<GraphViewApi | null>(null)
const searchRef = ref<SearchPanelApi | null>(null)

const physicsActive = ref(true)
const layout = ref<LayoutName>('force')
const layoutOptions = LAYOUT_OPTIONS.map(o => ({ value: o.value, label: o.label }))
const layoutHint = computed(() => LAYOUT_OPTIONS.find(o => o.value === layout.value)?.hint ?? '')
const layoutModel = computed({
  get: () => layout.value,
  set: (v: string) => { layout.value = v as LayoutName }
})

// ---------- 图谱控制面板（显示 + 力导向，仿 Obsidian；需求 m01104 第 3 条）----------
// 参数单独持久化在 garden-graph-settings-v3：与 garden-graph-state（坐标 / 筛选）分开，
// 清掉坐标或筛选不会连带把调好的力参数一起清掉。
const tuning = reactive<GraphTuning>(readGraphSettings())
const onTuningChange = (patch: Partial<GraphTuning>) => {
  Object.assign(tuning, patch)
  writeGraphSettings({ ...tuning })
}
const resetTuning = () => {
  Object.assign(tuning, GRAPH_TUNING_DEFAULTS)
  writeGraphSettings({ ...tuning })
}
const setLabelMode = (m: LabelMode) => { filterState.labelMode = m }
const reheatGraph = () => graphRef.value?.reheat()

// 浏览器标签标题（需求 m01104 第 4 条）：此前本页没有 useHead，标签显示的是 URL
useHead({ title: '知识图谱 · 拾光' })

const leftOpen = ref(false)
const rightOpen = ref(false)
const mobilePanelOpen = ref(false)
/**
 * 左栏是否被手动收起（需求 m01569 第 3 条）。
 * 只在三区模式下有意义——窄屏左栏本来就是抽屉，收起等同于关闭。
 */
const leftCollapsed = ref(false)
const leftVisible = computed(() => (threePane.value && !leftCollapsed.value) || leftOpen.value)
const rightVisible = computed(() => threePane.value || rightOpen.value)

function closeOverlays() {
  leftOpen.value = false
  rightOpen.value = false
}

// ---------- 渲染状态（A12 常驻可见） ----------
const renderStatus = ref<RenderStatus>({
  fps: 0,
  firstPaintMs: 0,
  nodeCount: 0,
  edgeCount: 0,
  drawnCount: 0,
  tier: 'svg',
  converged: false,
  zoomK: 1,
  labelMode: 'moc',
  labelCount: 0,
  mocCount: 0,
  focusedCount: 0,
  customColorCount: 0,
  tuning: { ...GRAPH_TUNING_DEFAULTS }
})
const zoomPercent = computed(() => Math.round((renderStatus.value.zoomK || 1) * 100))

const minimap = ref<MinimapSnapshot>({ nodes: [], canvas: { w: 800, h: 500 }, view: { x: 0, y: 0, k: 1 } })

let statusTimer: ReturnType<typeof setInterval> | null = null
function syncStatus() {
  const api = graphRef.value
  if (!api) return
  renderStatus.value = api.renderStatus()
  minimap.value = api.minimap()
}

// ---------- 派生 ----------
const viewNodes = computed<GraphNodeProp[]>(() =>
  visibleNodes.value.map(n => ({ ...n, degree: degreeOf(n.id), isolated: isolatedIds.value.has(n.id) }))
)
const viewEdges = computed<GraphEdge[]>(() => visibleEdges.value)

const loading = computed(() => pending.value && allNodes.value.length === 0)
const graphIsEmpty = computed(() => !pending.value && !loadError.value && allNodes.value.length === 0)
const errorText = computed(() => {
  const e: any = loadError.value
  const status = e?.statusCode || e?.status
  if (status === 401 || status === 403) return '当前账号没有查看图谱的权限，请重新登录后再试。'
  if (status === 500) return '服务端解析图谱数据失败，稍后重试；若持续失败请检查 vault 文件。'
  return e?.data?.message || e?.message || '网络请求失败，请检查网络或本地服务是否在运行。'
})

const selectedNode = computed<GraphNodeProp | null>(() => {
  const id = selectedId.value
  if (!id) return null
  return nodeById.value.get(id) ?? null
})

function resolveNodes(ids: string[] | undefined): GraphNodeProp[] {
  const out: GraphNodeProp[] = []
  if (!ids) return out
  for (const id of ids) {
    const n = nodeById.value.get(id)
    if (n) out.push(n)
  }
  return out
}
const inLinks = computed(() => resolveNodes(incoming.value.get(selectedId.value || '')))
const outLinks = computed(() => resolveNodes(outgoing.value.get(selectedId.value || '')))
const isolatedNodes = computed<GraphNodeProp[]>(() => resolveNodes([...isolatedIds.value]))

/** 「聚焦邻居」/ 路径模式共用的高亮集合 */
const focusIds = ref<string[] | null>(null)
const activeFocusIds = computed<string[] | null>(() => {
  if (filterState.scope === 'path') {
    const ids = pathNodeIds.value
    return ids && ids.length ? ids : null
  }
  return focusIds.value
})

// ---------- 交互 ----------
function onSelect(id: string | null) {
  selectedId.value = id
  if (!id) focusIds.value = null
}

function openNote(slug: string) {
  navigateTo(`/notes/${slug.split('/').map(encodeURIComponent).join('/')}`)
}

function onPick(id: string) {
  filter.setPathPoint(id)
}

function onSearchSelect(id: string) {
  selectedId.value = id
  focusIds.value = null
  nextTick(() => graphRef.value?.focusNode(id))
}

function onOnlyDomain(name: string) {
  onlyDomain(name)
  closeOverlays()
}

function onTag(name: string) {
  filter.toggleTag(name)
  closeOverlays()
}

function locateNode(id: string) {
  selectedId.value = id
  nextTick(() => graphRef.value?.focusNode(id))
}

function focusNeighbors(id: string) {
  const set = neighborsOf(id, 2)
  focusIds.value = [...set]
  selectedId.value = id
  toast.success(`已聚焦 ${focusIds.value.length} 个 2 跳邻居`)
}

function onCommand(name: 'sort-degree' | 'find-path' | 'new-note') {
  if (name === 'sort-degree') {
    const top = [...allNodes.value].sort((a, b) => degreeOf(b.id) - degreeOf(a.id))[0]
    if (!top) return
    selectedId.value = top.id
    focusIds.value = null
    nextTick(() => graphRef.value?.focusNode(top.id))
    toast.success(`已定位度数最高的节点「${top.title}」`)
    return
  }
  if (name === 'find-path') {
    filter.setScope('path')
    filter.clearPath()
    toast.success('选点模式：依次点两个节点查找最短路径')
    return
  }
  // new-note：把请求投给外壳布局，创建成功后回到 /graph?focus=<slug>
  createNoteRequest.value = 'graph'
}

// ---------- 缩放 / 布局 ----------
function zoomBy(factor: number) { graphRef.value?.zoomBy(factor) }
function fitView() { graphRef.value?.fitView() }
function resetLayout() {
  graphRef.value?.resetLayout()
  toast.success('布局已重置')
}
function togglePhysics() { graphRef.value?.togglePhysics() }
function onMinimapCenter(gx: number, gy: number) { graphRef.value?.centerOn(gx, gy) }
function onMinimapZoom(k: number) { graphRef.value?.zoomTo(k) }

// ---------- 右键菜单（需求 m01569 第 6 条） ----------
type GraphContextPayload = { id: string | null; x: number; y: number }

const menu = ref<GraphContextPayload | null>(null)

/** 右键目标：节点菜单需要标题 / slug / 固定状态 / 当前自定义色；空白处右键则为 null */
const menuTarget = computed(() => {
  const m = menu.value
  if (!m || !m.id) return null
  const n = nodeById.value.get(m.id)
  if (!n) return null
  return {
    id: n.id,
    title: n.title,
    slug: n.slug,
    pinned: !!graphRef.value?.isPinned(n.id),
    color: graphRef.value?.nodeColorOf(n.id) ?? null
  }
})

/** 菜单贴边避让用的容器尺寸（取最近一次同步到的画布尺寸） */
const menuBox = computed(() => ({
  w: minimap.value.canvas.w || 800,
  h: minimap.value.canvas.h || 500
}))

function onGraphContextMenu(p: GraphContextPayload) {
  menu.value = { ...p }
}
function closeMenu() { menu.value = null }

/** GraphView 发回的单个节点改色意图（右键菜单） */
function onSetNodeColor(p: GraphColorPayload) {
  graphColors.set(p.slug, p.color)
  toast.success(p.color ? '已设置节点颜色' : '已恢复领域色')
}
/** GraphView 发回的「清除全部自定义颜色」意图（控制面板按钮） */
function onClearNodeColors() {
  void graphColors.clearAll()
  toast.success('已清除全部自定义颜色')
}
/** 批量上色：把圈选到的节点一次涂成同一色 */
function onBatchApply(color: string) {
  const entries: Record<string, string> = {}
  for (const n of batch.matchedNodes.value) entries[n.slug] = color
  const changed = graphColors.setMany(entries)
  if (changed) toast.success(`已给 ${changed} 个节点上色`)
  else toast.warn('这些节点已经是该颜色')
}
/** 批量清除：只清圈选到、且确实有自定义色的节点 */
function onBatchClear() {
  const entries: Record<string, null> = {}
  let touched = 0
  for (const n of batch.matchedNodes.value) {
    if (graphColors.colors.value[n.slug]) { entries[n.slug] = null; touched++ }
  }
  if (!touched) {
    toast.warn('匹配到的节点没有自定义颜色')
    return
  }
  graphColors.setMany(entries)
  toast.success(`已清除 ${touched} 个节点的颜色`)
}
/** 面板里点一个匹配到的节点 → 定位过去 */
function onBatchLocate(id: string) {
  selectedId.value = id
  nextTick(() => graphRef.value?.focusNode(id))
}
function onMenuSetColor(id: string, color: string | null) {
  graphRef.value?.setNodeColor(id, color)
}
function onMenuCopy(text: string, label: string) {
  const p = navigator.clipboard?.writeText(text)
  if (!p) {
    toast.error('当前环境不支持剪贴板')
    return
  }
  p.then(
    () => toast.success(`已复制${label}`),
    () => toast.error('复制失败，浏览器未授权剪贴板')
  )
}
function onMenuPathStart(id: string) {
  filter.setScope('path')
  filter.pathFrom.value = id
  filter.pathTo.value = null
  toast.success('已设为路径起点，再右键另一个节点选终点')
}
function onMenuPathEnd(id: string) {
  filter.setScope('path')
  if (!filter.pathFrom.value || filter.pathFrom.value === id) {
    filter.pathFrom.value = id
    filter.pathTo.value = null
    toast.success('已设为路径起点')
  } else {
    filter.pathTo.value = id
  }
}
function onMenuTogglePin(id: string) {
  const on = graphRef.value?.togglePin(id)
  toast.success(on ? '已固定该节点' : '已解除固定')
}
function onMenuDetach(id: string) {
  selectedId.value = id
  nextTick(() => { unlinkSelected() })
}
function onMenuClearFilters() {
  clearAll()
  closeMenu()
}

// ---------- 断开全部关系（T4.2 Delete，二次确认） ----------
async function unlinkSelected() {
  const node = selectedNode.value
  if (!node) return
  if (!node.outDegree) {
    toast.warn('这篇笔记没有出链，无需断开')
    return
  }
  const ok = await confirm({
    title: '断开全部关系',
    message: `将移除「${node.title}」正文中的全部 [[双向链接]] 语法，正文文字保留。`,
    detail: node.slug,
    confirmText: '断开',
    danger: true
  })
  if (!ok) return
  const path = node.slug.split('/').map(encodeURIComponent).join('/')
  try {
    const note = await $fetch<{ content?: string }>(`/api/notes/${path}`)
    const content = note?.content || ''
    const next = content.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, target: string, alias?: string) => (alias || target).trim())
    if (next === content) {
      toast.warn('正文中没有可断开的链接')
      return
    }
    await $fetch(`/api/vault/notes/${path}`, { method: 'PUT', body: { content: next } })
    await refreshGraph()
    toast.success('已断开全部关系')
  } catch (e: any) {
    toast.error(e?.data?.message || '断开失败')
  }
}

// ---------- 真空态：导入 3 篇 MOC 模板 ----------
const MOC_TEMPLATES = [
  {
    title: 'MOC · 知识地图',
    body: [
      '# MOC · 知识地图',
      '',
      '这片花园的总入口，从下面两张地图开始：',
      '',
      '- [[MOC · 阅读清单]]',
      '- [[MOC · 项目索引]]',
      '',
      '> 由图谱空状态一键导入，可以自由改写或删除。'
    ].join('\n')
  },
  {
    title: 'MOC · 阅读清单',
    body: [
      '# MOC · 阅读清单',
      '',
      '在读与读完的书、文章：',
      '',
      '- [[MOC · 知识地图]]',
      '',
      '## 待读',
      '',
      '- '
    ].join('\n')
  },
  {
    title: 'MOC · 项目索引',
    body: [
      '# MOC · 项目索引',
      '',
      '进行中的项目与复盘：',
      '',
      '- [[MOC · 知识地图]]',
      '- [[MOC · 阅读清单]]'
    ].join('\n')
  }
]
const importingMoc = ref(false)

async function importMocTemplates() {
  importingMoc.value = true
  try {
    for (const t of MOC_TEMPLATES) {
      const { slug } = await $fetch<{ slug: string }>('/api/vault/notes', {
        method: 'POST',
        body: { path: '', title: t.title }
      })
      const path = slug.split('/').map(encodeURIComponent).join('/')
      await $fetch(`/api/vault/notes/${path}`, { method: 'PUT', body: { content: t.body } })
    }
    await refreshNuxtData('vault-tree')
    // 等 watcher 把新文件同步进库，再拉一次图谱
    await new Promise(r => setTimeout(r, 900))
    await refreshGraph()
    toast.success('已导入 3 篇 MOC 模板')
  } catch (e: any) {
    toast.error(e?.data?.message || '导入失败')
  } finally {
    importingMoc.value = false
  }
}

// ---------- 加载 / 重试 ----------
async function retryLoad() {
  await refreshGraph()
}

// ---------- ?focus=<slug>（新建笔记后回到图谱定位） ----------
function applyFocusQuery() {
  const q = route.query.focus
  if (typeof q !== 'string' || !q) return
  const n = graph.nodeBySlug.value.get(q)
  if (!n) return
  selectedId.value = n.id
  focusIds.value = null
  nextTick(() => graphRef.value?.focusNode(n.id))
}
watch(() => route.query.focus, () => applyFocusQuery())
watch(allNodes, (list) => { if (list.length) applyFocusQuery() })

// ---------- 键盘快捷键（T4.2） ----------
const commandOpen = useState('shell-command-open', () => false)
const createNoteRequest = useState<'note' | 'graph' | null>('shell-create-note', () => null)
let gPressedAt = 0

function isTypingTarget(t: EventTarget | null) {
  const el = t as HTMLElement | null
  if (!el || !el.tagName) return false
  const tag = el.tagName.toLowerCase()
  return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable === true
}

function onWindowKeydown(e: KeyboardEvent) {
  const mod = e.metaKey || e.ctrlKey
  const key = e.key.toLowerCase()
  // 不受输入焦点限制的两条
  if (mod && key === 'f') { e.preventDefault(); searchRef.value?.focus(); return }
  if (mod && key === 'l') { e.preventDefault(); togglePhysics(); return }
  if (isTypingTarget(e.target)) return

  if (e.key === 'Escape') {
    if (leftOpen.value || rightOpen.value) { e.preventDefault(); closeOverlays(); return }
    if (mobilePanelOpen.value) { e.preventDefault(); mobilePanelOpen.value = false; return }
    if (focusIds.value) { e.preventDefault(); focusIds.value = null }
    return
  }
  if (e.key === '/') { e.preventDefault(); commandOpen.value = true; return }
  if (e.key === 'Delete' && selectedId.value) { e.preventDefault(); unlinkSelected(); return }
  if (key === 'g' && !mod) { gPressedAt = Date.now(); return }
  if (key === 'f' && !mod && Date.now() - gPressedAt < 1200) {
    e.preventDefault()
    gPressedAt = 0
    fitView()
  }
}

// ---------- 自定义颜色的装载 / 落盘时机 ----------
// 装载必须等图谱数据到位：迁移旧版 id 键的颜色需要 id → slug 的映射表。
// 只在客户端跑（onMounted 内），SSR 期间不碰 $fetch 也不碰 localStorage。
let stopColorsInit: (() => void) | null = null
const colorsReady = ref(false)

function tryInitColors(): boolean {
  if (colorsReady.value || !batchNodes.value.length) return false
  colorsReady.value = true
  void graphColors.init(batchNodes.value)
  return true
}

/** 关页 / 切后台时把还没提交的颜色改动立刻发出去（防抖窗口内关页会丢最后一次改动） */
function flushColors() {
  if (graphColors.pending.value) void graphColors.flush()
}
function onVisibilityChange() {
  if (document.visibilityState === 'hidden') flushColors()
}

onMounted(() => {
  const saved = readGraphState().layout
  if (saved) layout.value = saved
  statusTimer = setInterval(syncStatus, 700)
  window.addEventListener('keydown', onWindowKeydown)

  if (!tryInitColors()) {
    stopColorsInit = watch(batchNodes, () => { if (tryInitColors()) { stopColorsInit?.(); stopColorsInit = null } })
  }
  window.addEventListener('beforeunload', flushColors)
  document.addEventListener('visibilitychange', onVisibilityChange)

  if (pageEl.value && typeof ResizeObserver !== 'undefined') {
    pageObserver = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width
      if (typeof w === 'number') pageWidth.value = w
    })
    pageObserver.observe(pageEl.value)
  }
})
onBeforeUnmount(() => {
  if (statusTimer) clearInterval(statusTimer)
  window.removeEventListener('keydown', onWindowKeydown)
  window.removeEventListener('beforeunload', flushColors)
  document.removeEventListener('visibilitychange', onVisibilityChange)
  stopColorsInit?.()
  stopColorsInit = null
  flushColors()
  pageObserver?.disconnect()
  pageObserver = null
})
watch(layout, (v) => patchGraphState({ layout: v }))
watch(selectedId, (v) => { if (!v) focusIds.value = null })
</script>
