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
    <div class="rounded-2xl border border-[var(--border-color)] bg-[var(--card-bg)] p-8">
      <h1 class="text-2xl font-bold tracking-tight mb-2 text-center">✨ 拾光</h1>
      <p class="text-sm text-[var(--text-secondary)] text-center mb-6">私人知识花园，请输入访问密钥</p>
      <input
        v-model="key"
        type="password"
        placeholder="访问密钥"
        class="w-full px-3 py-2.5 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-color)] text-sm focus:border-[var(--accent-color)] outline-none mb-3"
        @keyup.enter="submit"
      />
      <p v-if="error" class="text-sm text-red-400 mb-3">{{ error }}</p>
      <button
        class="w-full py-2.5 rounded-lg text-sm bg-[var(--accent-color)] text-white disabled:opacity-50"
        :disabled="loading"
        @click="submit"
      >{{ loading ? '验证中…' : '进入花园' }}</button>
    </div>
    <p class="text-center text-xs text-[var(--text-secondary)] mt-4">密钥永久有效 · 登录状态 30 天，过期需重新输入密钥</p>
  </div>
</template>
