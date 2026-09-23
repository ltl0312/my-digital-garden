<script setup lang="ts">
import { Check, ChevronDown } from 'lucide-vue-next'

// DAWN 自定义下拉（替代原生 <select>）
// 为什么不用原生 select：弹层容器由 UA 渲染，CSS 控制不到容器背景 ——
// 暗色主题下展开的第一帧是纯黑底，随后才绘出 option（用户反馈的「下拉框打开一瞬间黑色」），
// 且 html/option 上声明 color-scheme 与背景也无法消除（已在真机两次验证）。
// 这里用触发器 + fixed 定位的 listbox 完全接管渲染，顺带获得一致的键盘与 ARIA 行为。
interface SelectOption {
  value: string
  label: string
}

const props = withDefaults(defineProps<{
  modelValue: string
  options: SelectOption[]
  placeholder?: string
  size?: 'sm' | 'md'
  disabled?: boolean
  /** 弹层最大高度（px） */
  maxHeight?: number
}>(), {
  placeholder: '请选择',
  size: 'md',
  disabled: false,
  maxHeight: 300
})

const emit = defineEmits<{
  (e: 'update:modelValue', v: string): void
  (e: 'change', v: string): void
}>()

const root = ref<HTMLElement | null>(null)
const trigger = ref<HTMLButtonElement | null>(null)
const listEl = ref<HTMLElement | null>(null)
const open = ref(false)
const activeIndex = ref(-1)
const pos = ref({ left: 0, top: 0, width: 0 })

const current = computed(() => props.options.find(o => o.value === props.modelValue))

/** 定位：默认在触发器下方，空间不足则翻到上方（fixed 定位避免被弹窗 overflow 裁剪） */
const measure = () => {
  const el = trigger.value
  if (!el) return
  const r = el.getBoundingClientRect()
  const gap = 4
  const want = Math.min(props.maxHeight, props.options.length * 34 + 12)
  const openUp = r.bottom + gap + want > window.innerHeight && r.top - gap - want > 0
  pos.value = {
    left: r.left,
    top: openUp ? r.top - gap - want : r.bottom + gap,
    width: r.width
  }
}

const scrollActive = () => {
  listEl.value?.querySelector<HTMLElement>(`[data-idx="${activeIndex.value}"]`)?.scrollIntoView({ block: 'nearest' })
}

const openMenu = () => {
  if (props.disabled) return
  measure()
  activeIndex.value = Math.max(0, props.options.findIndex(o => o.value === props.modelValue))
  open.value = true
  nextTick(scrollActive)
}

const close = (focusBack = false) => {
  open.value = false
  if (focusBack) trigger.value?.focus()
}

const choose = (i: number) => {
  const o = props.options[i]
  if (!o) return
  if (o.value !== props.modelValue) {
    emit('update:modelValue', o.value)
    emit('change', o.value)
  }
  close(true)
}

const move = (d: number) => {
  const n = props.options.length
  if (!n) return
  if (!open.value) { openMenu(); return }
  activeIndex.value = (activeIndex.value + d + n) % n
  nextTick(scrollActive)
}

const jump = (i: number) => {
  if (!props.options.length) return
  activeIndex.value = Math.max(0, Math.min(i, props.options.length - 1))
  nextTick(scrollActive)
}

const onKeydown = (e: KeyboardEvent) => {
  switch (e.key) {
    case 'ArrowDown': e.preventDefault(); move(1); break
    case 'ArrowUp': e.preventDefault(); move(-1); break
    case 'Home': e.preventDefault(); jump(0); break
    case 'End': e.preventDefault(); jump(props.options.length - 1); break
    case 'Enter':
    case ' ':
      e.preventDefault()
      if (open.value) choose(activeIndex.value)
      else openMenu()
      break
    case 'Escape':
      if (open.value) { e.preventDefault(); e.stopPropagation(); close(true) }
      break
    case 'Tab':
      if (open.value) close()
      break
  }
}

const onPointerDownOutside = (e: PointerEvent) => {
  if (!open.value) return
  const t = e.target as Node
  if (root.value?.contains(t) || listEl.value?.contains(t)) return
  close()
}
// 视口变化时关闭下拉。滚动事件用捕获阶段监听（window + capture），因此**列表自身**的滚动
// 也会被捕获到 —— 用户滑动选项列表时下拉会自己关掉。这里按 target 是否在列表内排除。
const onScroll = (e: Event) => {
  if (!open.value) return
  const t = e.target as Node | null
  if (t && listEl.value?.contains(t)) return
  close()
}
const onResize = () => { if (open.value) close() }

onMounted(() => {
  document.addEventListener('pointerdown', onPointerDownOutside, true)
  window.addEventListener('scroll', onScroll, true)
  window.addEventListener('resize', onResize)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onPointerDownOutside, true)
  window.removeEventListener('scroll', onScroll, true)
  window.removeEventListener('resize', onResize)
})
</script>

<template>
  <div ref="root" class="relative">
    <button
      ref="trigger"
      type="button"
      role="combobox"
      aria-haspopup="listbox"
      :aria-expanded="open"
      :disabled="disabled"
      class="w-full flex items-center justify-between gap-2 rounded-ctl border text-left transition-colors duration-micro disabled:opacity-45 disabled:cursor-not-allowed"
      :class="[
        size === 'sm' ? 'px-2.5 py-1.5' : 'px-3 py-2',
        'text-ds-sm bg-surface-2 border-line text-ink',
        open ? 'border-accent/60' : 'hover:border-ink-3/40'
      ]"
      @click="open ? close(true) : openMenu()"
      @keydown="onKeydown"
    >
      <span class="truncate" :class="current ? '' : 'text-ink-3'">{{ current?.label || placeholder }}</span>
      <ChevronDown
        class="w-3.5 h-3.5 shrink-0 text-ink-3 transition-transform duration-base ease-dawn"
        :class="open ? 'rotate-180' : ''"
      />
    </button>

    <Teleport to="body">
      <Transition
        enter-active-class="transition duration-micro ease-dawn"
        enter-from-class="opacity-0 -translate-y-1"
        leave-active-class="transition duration-micro ease-dawn"
        leave-to-class="opacity-0"
      >
        <div
          v-if="open"
          ref="listEl"
          role="listbox"
          class="fixed z-[130] overflow-y-auto rounded-card border border-line bg-surface shadow-ds3 p-1"
          :style="{ left: pos.left + 'px', top: pos.top + 'px', width: pos.width + 'px', maxHeight: maxHeight + 'px' }"
        >
          <button
            v-for="(o, i) in options"
            :key="o.value"
            type="button"
            role="option"
            :data-idx="i"
            :aria-selected="o.value === modelValue"
            class="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-ctl text-ds-sm text-left transition-colors duration-micro"
            :class="[
              i === activeIndex ? 'bg-surface-3' : '',
              o.value === modelValue ? 'text-ink font-semibold' : 'text-ink-2'
            ]"
            @click="choose(i)"
            @mousemove="activeIndex = i"
          >
            <span class="flex-1 truncate">{{ o.label }}</span>
            <Check v-if="o.value === modelValue" class="w-3.5 h-3.5 shrink-0 text-accent" />
          </button>
          <p v-if="!options.length" class="px-2.5 py-2 text-ds-sm text-ink-3">无可选项</p>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>
