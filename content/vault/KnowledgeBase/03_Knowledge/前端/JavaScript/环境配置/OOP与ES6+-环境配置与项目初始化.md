---
aliases: [JS ES6 环境, Babel 配置, ES6 转译]
tags: [status/进行中, type/教程, 前端/JavaScript]
created: "2026-06-16 19:19"
updated: "2026-06-16 19:19"
source: "https://babeljs.io/docs/en/usage"
知识体系: "前端 → L0 三件套"
技术版本: "ES6+"
---

# JavaScript OOP 与 ES6+ — 环境配置与项目初始化

## 信息来源
- **Babel**：https://babeljs.io/（✅ 可访问，ES6+ 转 ES5 兼容工具）
- **ECMAScript 兼容表**：https://kangax.github.io/compat-table/es6/（✅ 可访问）

## 前置条件
- Node.js（参考 <a href="obsidian://open?file=基础语法-环境配置与项目初始化">JavaScript-基础语法-环境配置与项目初始化</a>）

## Step 1: Babel 转译配置

```bash
npm init -y && npm install -D @babel/core @babel/cli @babel/preset-env
```
`.babelrc`：
```json
{ "presets": ["@babel/preset-env"] }
```
```bash
npx babel src --out-dir dist  # ES6+ → ES5
```

## Step 2: 检查浏览器兼容性

Chrome DevTools Console：
```javascript
typeof Symbol;          // "function"（支持）
typeof BigInt;          // "function"（Chrome 67+）
[].flat;                // function（Chrome 69+）
```

## Step 3: 最小可运行示例

```javascript
// 测试 ES6+ 特性
class Animal {
    constructor(name) { this.name = name; }
    speak() { console.log(`${this.name} makes a noise.`); }
}
const [a, ...rest] = [1, 2, 3, 4];
const merged = { ...{a:1}, ...{b:2} };
const unique = [...new Set([1,2,2,3])];
console.log(rest, merged, unique); // [2,3,4] {a:1,b:2} [1,2,3]
```

## 常见问题

1. **`...` 展开运算符报错**：确认目标环境支持 ES2018（对象展开）或使用 Babel 转译。
2. **`class` 在 IE 报错**：需要用 Babel 转译为 function + prototype 形式。

> 📂 所属：[[MOC - JavaScript]]
