<script setup lang="ts">
import { Link2, Network, BookOpen, KeyRound, Eye, EyeOff, AlertCircle, ArrowRight } from 'lucide-vue-next'

definePageMeta({ layout: 'auth' })

const route = useRoute()
const key = ref('')
const error = ref('')
const loading = ref(false)
const showKey = ref(false)

const capabilities = [
  { icon: Link2, title: '双向链接', desc: '在笔记里写 [[笔记名]]，两篇就互相关联' },
  { icon: Network, title: '知识图谱', desc: '按领域着色，看清知识之间真实的连接密度' },
  { icon: BookOpen, title: '沉浸阅读', desc: '正文 720px 单栏 + 目录栏跟随，长文也不迷路' },
  { icon: KeyRound, title: '密钥访问', desc: '分级权限：初始管理员 / 管理员 / 普通用户' }
]

const submit = async () => {
  if (!key.value.trim()) {
    error.value = '请输入访问密钥'
    return
  }
  loading.value = true
  error.value = ''
  try {
    await $fetch('/api/auth/verify', { method: 'POST', body: { key: key.value.trim() } })
    // 登录前 /api/auth/me 曾缓存为 null；此处必须失效，否则角色化界面（新建下拉 / 管理入口 / 导入）
    // 要等到硬刷新才出现 —— 这是上一轮的既有缺陷，E2 修复。
    await refreshNuxtData(['auth-me', 'sidebar-graph', 'vault-tree', 'sidebar-tags'])
    // 仅允许站内相对路径跳转（防 open redirect：拒绝绝对 URL 与协议相对 //evil.com）
    const raw = typeof route.query.redirect === 'string' ? route.query.redirect : ''
    const redirect = raw.startsWith('/') && !raw.startsWith('//') ? raw : '/'
    await navigateTo(redirect)
  } catch (e: any) {
    error.value = e?.data?.message || '密钥无效，请确认后重试'
  } finally {
    loading.value = false
  }
}

useHead({ title: '访问验证 · 拾光' })
</script>

<template>
  <div class="w-full max-w-[980px] grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-14 items-center">
    <!-- 左栏：品牌与产品能力（窄屏隐藏，spec 5.1） -->
    <section class="hidden lg:block">
      <p class="font-serif italic text-ds-base text-accent mb-2">Non-linear Knowledge Sanctuary</p>
      <h1 class="text-[38px] leading-[1.15] font-extrabold tracking-tight text-ink mb-3">✨ 拾光</h1>
      <p class="text-ds-base text-ink-2 leading-summary max-w-[46ch] mb-8">
        一座私人的、会自己生长的知识花园。以下都是它现在就能做的事，不是口号。
      </p>

      <!-- 纯 SVG 花园连线插画（与知识图谱同构） -->
      <svg viewBox="0 0 320 140" class="w-full max-w-[320px] mb-8" aria-hidden="true">
        <g stroke="var(--line)" stroke-width="1.5" fill="none">
          <path d="M60 96 L128 44" />
          <path d="M60 96 L150 106" />
          <path d="M128 44 L206 62" />
          <path d="M150 106 L206 62" />
          <path d="M206 62 L272 38" />
          <path d="M150 106 L236 118" />
          <path d="M272 38 L236 118" stroke-dasharray="3 4" />
        </g>
        <g>
          <circle cx="60" cy="96" r="9" fill="hsl(160 var(--hue-s) var(--hue-l))" />
          <circle cx="128" cy="44" r="7" fill="hsl(232 var(--hue-s) var(--hue-l))" />
          <circle cx="150" cy="106" r="11" fill="hsl(275 var(--hue-s) var(--hue-l))" />
          <circle cx="206" cy="62" r="8" fill="hsl(32 var(--hue-s) var(--hue-l))" />
          <circle cx="272" cy="38" r="6" fill="hsl(195 var(--hue-s) var(--hue-l))" />
          <circle cx="236" cy="118" r="7" fill="hsl(344 var(--hue-s) var(--hue-l))" />
        </g>
      </svg>

      <ul class="space-y-4">
        <li v-for="c in capabilities" :key="c.title" class="flex items-start gap-3">
          <span class="w-8 h-8 rounded-ctl bg-surface-2 border border-line flex items-center justify-center shrink-0">
            <component :is="c.icon" class="w-4 h-4 text-accent" />
          </span>
          <span class="min-w-0">
            <span class="block text-ds-sm font-semibold text-ink">{{ c.title }}</span>
            <span class="block text-[12px] text-ink-3 leading-summary">{{ c.desc }}</span>
          </span>
        </li>
      </ul>
    </section>

    <!-- 右栏：表单 -->
    <section class="w-full">
      <div class="rounded-overlay border border-line bg-surface p-7 sm:p-8 shadow-ds2">
        <!-- 窄屏时左栏隐藏，此处补一个轻量品牌行 -->
        <p class="lg:hidden font-serif italic text-ds-sm text-accent mb-1.5">Non-linear Knowledge Sanctuary</p>
        <h2 class="text-ds-xl font-bold tracking-tight text-ink mb-1.5">进入花园</h2>
        <p class="text-ds-sm text-ink-3 mb-6">请输入访问密钥，密钥由管理员发放</p>

        <label class="block mb-4">
          <span class="block text-[12px] text-ink-3 mb-1.5">访问密钥</span>
          <span class="relative block">
            <input
              v-model="key"
              :type="showKey ? 'text' : 'password'"
              placeholder="粘贴或输入密钥"
              autocomplete="current-password"
              class="w-full pl-3 pr-10 py-2.5 rounded-ctl bg-surface-2 border text-ds-sm text-ink placeholder-ink-3 focus:outline-none transition-colors duration-micro"
              :class="error ? 'border-danger/60' : 'border-line focus:border-accent/60'"
              :aria-invalid="!!error"
              aria-describedby="login-error"
              @keyup.enter="submit"
            />
            <button
              type="button"
              class="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-ctl flex items-center justify-center text-ink-3 hover:text-ink hover:bg-surface-3 transition-colors duration-micro"
              :title="showKey ? '隐藏密钥' : '显示密钥'"
              :aria-label="showKey ? '隐藏密钥' : '显示密钥'"
              @click="showKey = !showKey"
            >
              <EyeOff v-if="showKey" class="w-4 h-4" />
              <Eye v-else class="w-4 h-4" />
            </button>
          </span>
          <!-- 行内错误态（就近展示，不用全局弹窗） -->
          <span
            v-if="error"
            id="login-error"
            class="mt-2 flex items-center gap-1.5 text-[12px] text-danger"
            role="alert"
          >
            <AlertCircle class="w-3.5 h-3.5 shrink-0" />{{ error }}
          </span>
        </label>

        <button
          class="w-full py-2.5 rounded-ctl text-ds-sm font-semibold bg-accent text-[var(--accent-ink)] shadow-ds1 inline-flex items-center justify-center gap-1.5 transition-opacity duration-micro disabled:opacity-50"
          :disabled="loading"
          @click="submit"
        >
          {{ loading ? '验证中…' : '进入花园' }}<ArrowRight v-if="!loading" class="w-4 h-4" />
        </button>

        <!-- 有效期说明 -->
        <p class="mt-4 text-[12px] text-ink-3 leading-summary">
          密钥永久有效；登录状态保持 30 天，过期后需重新输入密钥。
        </p>
      </div>
    </section>
  </div>
</template>
