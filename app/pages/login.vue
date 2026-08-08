<script setup lang="ts">
definePageMeta({ layout: 'auth' })

const route = useRoute()
const key = ref('')
const error = ref('')
const loading = ref(false)

const submit = async () => {
  if (!key.value.trim()) return
  loading.value = true
  error.value = ''
  try {
    await $fetch('/api/auth/verify', { method: 'POST', body: { key: key.value.trim() } })
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
    await navigateTo(redirect)
  } catch (e: any) {
    error.value = e?.data?.message || '登录失败'
  } finally {
    loading.value = false
  }
}

useHead({ title: '访问验证 · 拾光' })
</script>

<template>
  <div class="w-full max-w-sm">
    <div class="rounded-2xl glass-card bg-white/90 dark:bg-obsidian-800/90 p-8">
      <h1 class="text-2xl font-bold tracking-tight mb-2 text-center">✨ 拾光</h1>
      <p class="text-sm text-[var(--text-secondary)] text-center mb-6">私人知识花园，请输入访问密钥</p>
      <input
        v-model="key"
        type="password"
        placeholder="访问密钥"
        class="w-full px-3 py-2.5 rounded-lg bg-slate-100/90 dark:bg-obsidian-900/90 border border-slate-200 dark:border-white/10 text-sm text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-garden-500/60 focus:ring-1 focus:ring-garden-500/30 transition-all mb-3"
        @keyup.enter="submit"
      />
      <p v-if="error" class="text-sm text-red-400 mb-3">{{ error }}</p>
      <button
        class="w-full py-2.5 rounded-lg text-sm bg-gradient-to-r from-garden-500 to-emerald-600 dark:from-garden-400 dark:to-emerald-600 text-white font-semibold shadow-lg shadow-garden-500/20 hover:shadow-garden-500/30 transition-all disabled:opacity-50"
        :disabled="loading"
        @click="submit"
      >{{ loading ? '验证中…' : '进入花园' }}</button>
    </div>
    <p class="text-center text-xs text-slate-400 dark:text-slate-500 mt-4">密钥永久有效 · 登录状态 30 天，过期需重新输入密钥</p>
  </div>
</template>
