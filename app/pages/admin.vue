<script setup lang="ts">
const { isAdmin } = useAuth()
const requestFetch = useRequestFetch()
const keys = ref<any[]>([])
const label = ref('')
const role = ref('user')
const notice = ref('')

const loadKeys = async () => {
  keys.value = await requestFetch('/api/admin/keys')
}
await loadKeys()

const createKey = async () => {
  if (!label.value.trim()) return
  const created = await $fetch('/api/admin/keys', {
    method: 'POST',
    body: { label: label.value.trim(), role: role.value }
  })
  notice.value = `已生成密钥：${created.key}（${created.role === 'admin' ? '管理员' : '普通'}，永久有效）`
  label.value = ''
  await loadKeys()
}

const toggleKey = async (k: any) => {
  await $fetch(`/api/admin/keys/${k.id}`, { method: 'PATCH', body: { isActive: !k.isActive } })
  await loadKeys()
}

const removeKey = async (k: any) => {
  if (!confirm(`确定删除密钥「${k.label}」？该用户将立即失去访问权限。`)) return
  await $fetch(`/api/admin/keys/${k.id}`, { method: 'DELETE' })
  await loadKeys()
}

useHead({ title: '管理后台 · 拾光' })
</script>

<template>
  <div class="max-w-4xl mx-auto px-4 py-8">
    <h1 class="text-2xl font-bold tracking-tight mb-6">管理后台</h1>

    <section class="mb-8 rounded-xl border border-[var(--border-color)] bg-[var(--card-bg)] p-5">
      <h2 class="text-lg font-semibold mb-4">生成密钥</h2>
      <div class="flex flex-wrap gap-3 items-end">
        <label class="flex flex-col gap-1 text-xs text-[var(--text-secondary)]">
          备注名
          <input v-model="label" placeholder="如：朋友小明" class="px-3 py-2 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-color)] text-sm outline-none" />
        </label>
        <label class="flex flex-col gap-1 text-xs text-[var(--text-secondary)]">
          角色
          <select v-model="role" class="px-3 py-2 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-color)] text-sm outline-none">
            <option value="user">普通用户</option>
            <option value="admin">管理员</option>
          </select>
        </label>
        <button class="px-4 py-2 rounded-lg text-sm bg-[var(--accent-color)] text-white" @click="createKey">生成密钥</button>
      </div>
      <p v-if="notice" class="mt-3 text-sm text-[var(--accent-color)] break-all">{{ notice }}</p>
    </section>

    <section class="rounded-xl border border-[var(--border-color)] bg-[var(--card-bg)] p-5">
      <h2 class="text-lg font-semibold mb-4">密钥列表（{{ keys.length }}）</h2>
      <table class="w-full text-sm">
        <thead>
          <tr class="text-left text-xs text-[var(--text-secondary)] border-b border-[var(--border-color)]">
            <th class="py-2 pr-3">备注</th>
            <th class="py-2 pr-3">密钥</th>
            <th class="py-2 pr-3">角色</th>
            <th class="py-2 pr-3">状态</th>
            <th class="py-2 pr-3">最近使用</th>
            <th class="py-2">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="k in keys" :key="k.id" class="border-b border-[var(--border-color)]/50 last:border-0">
            <td class="py-2 pr-3">{{ k.label }}</td>
            <td class="py-2 pr-3 font-mono text-xs">{{ k.key }}</td>
            <td class="py-2 pr-3">{{ k.role === 'admin' ? '管理员' : '普通' }}</td>
            <td class="py-2 pr-3">{{ k.isActive ? '启用' : '已禁用' }}</td>
            <td class="py-2 pr-3">{{ k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString('zh-CN') : '—' }}</td>
            <td class="py-2 space-x-2">
              <button class="text-xs text-[var(--accent-color)] hover:underline" @click="toggleKey(k)">
                {{ k.isActive ? '禁用' : '启用' }}
              </button>
              <button class="text-xs text-red-400 hover:underline" @click="removeKey(k)">删除</button>
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  </div>
</template>
