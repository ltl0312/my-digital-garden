---
aliases: [Vue3响应式, Proxy, Composition API, script setup, Object.defineProperty]
maturity: GROWING
tags:
  - status/进行中
  - type/笔记
  - 前端/Vue
created: "2026-06-16 12:30"
updated: "2026-06-16 15:00"
source: "00_Inbox/Java全栈开发实战笔记(SpringBoot+Vue3).md"
知识体系: "前端 → L1 框架核心"
技术版本: "Vue 3.4"
---

# Vue 3 响应式引擎与 Composition API

## 📍 知识体系定位
（严格按 03_Knowledge/技术划分.md 填写）
- **所属技术栈**：前端 Vue 3
- **所在层级**：前端 Vue 3 → L1 框架核心
- **上游依赖**：（根据该技术在技术划分中的层级，列出上一层必须掌握的前置知识）
- **下游延伸**：（列出下一层可以学习的进阶技术）
- **同级技术**：（同层级解决同类问题的其他技术）

## 核心概念
> Vue 3 用 Proxy 替代 Object.defineProperty 重写了响应式引擎，从根本上解决了新增/删除属性无法监听的痛点。Composition API 允许将同一功能的 data、methods、computed、watch 封装在一起，彻底告别 Options API 的逻辑碎片化。

---

## 一、响应式引擎的重构：Object.defineProperty → Proxy

### Vue 2 的先天缺陷

```javascript
// Vue 2 响应式原理
const obj = {};
Object.defineProperty(obj, 'name', {
    get() { return value; },
    set(newVal) { /* 触发更新 */ }
});
obj.name = '张三'; // ✅ 触发 setter

// 致命缺陷1：新增属性无法监听
obj.age = 18;      // ❌ age 没有被 defineProperty 劫持 → 视图不更新！
// 必须用 Vue.set(obj, 'age', 18)

// 致命缺陷2：数组索引修改无法监听
this.items[0] = 'new';  // ❌ 视图不更新
// 必须用 this.$set(this.items, 0, 'new')

// 致命缺陷3：删除属性无法监听
delete obj.name;         // ❌ 视图不更新
// 必须用 Vue.delete(obj, 'name')
```

### Vue 3 的 Proxy：彻底无死角

```javascript
// Vue 3 响应式原理
const obj = { name: '张三' };
const proxy = new Proxy(obj, {
    get(target, key)       { /* 读取拦截 */ return target[key]; },
    set(target, key, val)  { /* 写入拦截 */ target[key] = val; /* 触发更新 */ },
    deleteProperty(target, key) { /* 删除拦截 */ delete target[key]; /* 触发更新 */ }
});

proxy.name = '李四';  // ✅ 触发 set
proxy.age = 18;       // ✅ 触发 set（新增属性也能拦截！）
delete proxy.age;     // ✅ 触发 deleteProperty（删除属性也能拦截！）

// 数组也完美支持
proxy.items[0] = 'x'; // ✅
proxy.items.push('y');// ✅
```

### 为什么 Proxy 可以在对象外面设"海关"？

```
Object.defineProperty → 逐个属性"贴封条"，新增属性没贴到
Proxy → 在整个对象外面设一道"海关"，无论读写增删，全部先过海关

比喻：
  defineProperty = 给房子的每一扇门装锁（但新开的门没锁）
  Proxy = 给整个房子修一堵围墙 + 一个门卫（所有进出都要登记）
```

---

## 二、Composition API vs Options API

### Options API 的"逻辑碎片化"问题

```
Vue 2 的同一个功能代码散落在不同选项中：

export default {
  data() { return { searchQuery: '', searchResults: [] } },  // 数据在这
  methods: { search() { ... }, clearSearch() { ... } },      // 方法在这
  computed: { filteredResults() { ... } },                    // 计算在这
  watch: { searchQuery() { ... } },                           // 监听在这
  mounted() { this.loadHistory() },                           // 生命周期在这
}

当你需要修改"搜索"这个功能时：
→ 在 data 找到 searchQuery
→ 在 methods 找到 search() 和 clearSearch()
→ 在 computed 找到 filteredResults()
→ 在 watch 找到 searchQuery 的监听
→ 在 mounted 找到初始化
→ 上下疯狂滚动，跨越几十甚至几百行代码！
```

### Composition API：同一功能的代码在一起

```vue
<script setup>
import { ref, computed, watch, onMounted } from 'vue';

// ===== 搜索功能的所有代码封装在一起 =====
const searchQuery = ref('');
const searchResults = ref([]);

const filteredResults = computed(() => {
    return searchResults.value.filter(/* ... */);
});

watch(searchQuery, (newVal) => {
    // 监听搜索词变化
});

async function search() {
    const res = await fetch(`/api/search?q=${searchQuery.value}`);
    searchResults.value = await res.json();
}

function clearSearch() {
    searchQuery.value = '';
    searchResults.value = [];
}

onMounted(() => { loadHistory(); });

// ===== 用户资料功能的所有代码封装在一起 =====
const userProfile = ref(null);
// ... 相关代码紧跟其后
</script>
```

### 三大核心 API 速查

| Composition API | 等价 Options API | 说明 |
|-----------------|-----------------|------|
| `ref(initVal)` | `data()` 中的变量 | 基本类型的响应式包装 |
| `reactive(obj)` | `data()` 中的对象 | 引用类型的响应式包装 |
| `computed(fn)` | `computed` | 计算属性 |
| `watch(source, cb)` | `watch` | 监听数据变化 |
| `onMounted(fn)` | `mounted` | 生命周期钩子 |
| `defineProps()` | `props` | 接收父组件传值 |
| `defineEmits()` | `$emit` | 向父组件发事件 |

---

## 三、`<script setup>`：编译时语法糖

```vue
<script setup>
// ① 无需 return → 模板可直接使用
const count = ref(0);
// <template> 中直接 {{ count }}

// ② 无需注册组件 → import 即用
import HelloWorld from './HelloWorld.vue';
// <template> 中直接 <HelloWorld />

// ③ 无需声明 props/emits → 编译器自动处理
const props = defineProps({ title: String });
const emit = defineEmits(['update']);

// ④ 完整的 TypeScript 支持
interface User { name: string; age: number; }
const user = ref<User>({ name: '张三', age: 28 });
</script>
```

---

## 关联上下文
- **前置知识**：掌握 Vue 2 Options API 及其响应式缺陷是理解 Proxy 重构的背景，详见 📋 待补充：Vue2基础与Options API
- **横向对比**：Vue 3 的 Composition API 与 React Hooks 都解决逻辑复用问题，但 Vue 的 setup 不会产生闭包陷阱，详见 📋 待补充：Vue3 vs React Hooks对比
- **实际应用**：大型中后台系统中按功能域组织代码，大幅提升可维护性，详见 📋 待补充：中后台系统架构实践
- **进阶方向**：深入掌握 Vue 3 响应式源码、自定义 ref、响应式工具函数库，详见 📋 待补充：Vue3响应式源码解析
- **易混淆概念**：`ref` vs `reactive` 的选择、`shallowRef` vs `ref` 的性能差异，详见 📋 待补充：Vue3 ref与reactive区别
- **前端 Axios 契约**：Vue 3 组件通过 Axios 调用后端 API，需要前后端约定统一的 Result 格式，详见源文件第六篇的拦截器设计

---

## 四、响应式 API 深入（ref / reactive / computed / watch / watchEffect）

> *以下内容来自 Vue 3 全方位详细学习笔记（已归档），补充响应式 API 的完整用法。*

### ref() 与 reactive()

```javascript
import { ref, reactive } from 'vue'

// ref：任意类型，JS 中需 .value，模板中自动解包
const count = ref(0)
count.value++

// reactive：仅对象类型，基于 Proxy
const state = reactive({ name: 'Alice', age: 25 })
state.age++  // 直接访问，不需 .value

// ★ reactive 的注意事项：
// 1. 解构丢失响应式 → 用 toRefs()
const { name, age } = toRefs(state)  // name 和 age 现在是 ref
// 2. 不能重新赋值整个对象
// state = reactive({}) // ❌ 断开响应式连接
```

### computed() 计算属性

```javascript
const count = ref(1)
// 只读
const double = computed(() => count.value * 2)
// 可写（提供 getter + setter）
const fullName = computed({
    get() { return firstName.value + ' ' + lastName.value },
    set(newValue) { [firstName.value, lastName.value] = newValue.split(' ') }
})
```

### watch() 侦听器

```javascript
// 侦听单个 ref
watch(count, (newVal, oldVal) => { /* ... */ })
// 侦听 getter 函数
watch(() => state.age, (newVal) => { /* ... */ })
// 侦听多个源
watch([count, () => state.age], ([newCount, newAge]) => { /* ... */ })
// 选项
watch(source, callback, {
    immediate: true,   // 立即执行一次
    deep: true,        // 深度侦听
    flush: 'post',     // DOM 更新后执行
    once: true         // Vue 3.4+：只触发一次
})
```

### watchEffect()

```javascript
// 自动追踪依赖，无需显式指定侦听源（获取不到旧值）
watchEffect(() => {
    console.log(`Count is: ${count.value}`)  // 依赖改变自动重新执行
})
```

### 响应式工具函数

| API | 说明 |
|-----|------|
| `toRef(obj, key)` | 将 reactive 对象的某个属性提取为独立 ref，保持响应式连接 |
| `toRefs(obj)` | 将 reactive 对象所有属性转为 ref（用于解构不丢响应式） |
| `isRef(value)` | 检查是否为 ref |
| `unref(value)` | `isRef(val) ? val.value : val` |
| `readonly(obj)` | 创建只读代理 |
| `shallowRef()` | 只监听 .value 赋值，不深度代理内部对象 |
| `markRaw(obj)` | 标记对象永不被转为 proxy（用于第三方类实例） |

---

## 五、生命周期钩子（Composition API）

```javascript
import { onMounted, onUnmounted, onBeforeUpdate } from 'vue'

// ★ 最常用
onMounted(() => { /* DOM 已挂载，可发起请求、操作 DOM */ })
onUnmounted(() => { /* 清理定时器、解绑全局事件 */ })
onBeforeUpdate(() => { /* DOM 更新前 */ })

// 缓存组件专属（<KeepAlive>）
onActivated(() => { /* 组件激活（插入 DOM） */ })
onDeactivated(() => { /* 组件失活（移出 DOM） */ })

// 其他
onBeforeMount, onUpdated, onBeforeUnmount,
onErrorCaptured, onRenderTracked, onRenderTriggered, onServerPrefetch

// 注意：Composition API 中没有 beforeCreate / created
// → 直接在 <script setup> 顶层写代码即等价于 created
```

---

## 六、组件系统高级特性

> *以下内容补充自 Vue 3 全方位详细学习笔记（已归档）。*

### defineModel()（Vue 3.4+）

```vue
<!-- 父组件 -->
<Child v-model="msg" />
<Child v-model:title="titleMsg" />

<!-- 子组件 -->
<script setup>
// 默认 v-model
const model = defineModel({ type: String, default: '' })
// 具名 v-model
const title = defineModel('title', { type: String })
</script>
<template>
    <input v-model="model" />
</template>
```

### defineOptions（Vue 3.3+）

```javascript
defineOptions({ name: 'MyComponent', inheritAttrs: false })
```

### useTemplateRef（Vue 3.5+）

```vue
<script setup>
import { useTemplateRef, onMounted } from 'vue'
const inputRef = useTemplateRef('my-input')
onMounted(() => { inputRef.value.focus() })
</script>
<template><input ref="my-input" /></template>
```

### 依赖注入：provide / inject

```javascript
// 祖先组件
provide('key', value)  // value 可以是响应式数据
// 后代组件
const value = inject('key', '默认值')
// 建议用 Symbol 作 key 避免命名冲突
```

> 📂 所属：[[MOC - Vue3]]
