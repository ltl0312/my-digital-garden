import { Home, FileText, Share2, Settings, KeyRound } from 'lucide-vue-next'

// 主导航单源：图标栏 RailNav（≥1024）与底部 TabBar（<640）共用同一份定义，
// 避免两处漂移（历史上图标栏与会话菜单的角色化可见性就曾各自为政）。
//
// spec 8.4：**「我的密钥」所有角色可见**。因此 /admin 对普通用户也必须可达 ——
// 它们不是「管理后台」而是「我的密钥」（pages/admin.vue:185 起对全角色渲染身份卡，
// :427 才对无权部分渲染 DeniedState）。
//
// 顺带给既有缺陷收口：RailNav 原先写成 `if (isAdmin) push('/admin')`，
// 普通用户在桌面端没有任何入口能进入「我的密钥」。
export function useNavItems() {
  const { canManage } = useRoles()

  return computed(() => [
    { to: '/', icon: Home, label: '首页', short: '首页' },
    { to: '/notes', icon: FileText, label: '笔记', short: '笔记', match: '/notes' },
    { to: '/graph', icon: Share2, label: '知识图谱', short: '图谱' },
    {
      to: '/admin',
      icon: canManage.value ? Settings : KeyRound,
      label: canManage.value ? '管理后台' : '我的密钥',
      short: canManage.value ? '后台' : '密钥'
    }
  ])
}

/** 导航项命中判定：'/' 需精确匹配，其余按前缀（详情页 /notes/xxx 也算「笔记」） */
export function navItemActive(item: { to: string; match?: string }, path: string) {
  const target = item.match || item.to
  return target === '/' ? path === '/' : path.startsWith(target)
}
