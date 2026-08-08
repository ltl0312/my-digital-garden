---
aliases: [TypeScript MOC, TS 知识地图]
tags: [status/进行中, type/MOC, 前端/TypeScript]
created: "2026-06-16 22:30"
updated: "2026-08-06 13:25"
知识体系: "前端 → L3 工程化"
---

# MOC - TypeScript

> <a href="obsidian://open?file=MOC - 前端">MOC - 前端</a> > **TypeScript** | 20 篇笔记。JS 的静态类型超集——L3 工程化。

## 目录结构

```
TypeScript/
├── MOC - TypeScript.md
├── 基础与特殊类型.md
├── 接口与函数类型.md
├── 类与高级类型.md
├── 泛型.md
├── 类型断言与类型守卫.md
├── 类型兼容性与结构化类型.md
├── 索引签名与索引访问类型.md
├── 映射类型.md
├── 工具类型与装饰器.md
├── 类型声明文件.md
└── 环境配置/
    ├── 基础语法-环境配置与项目初始化.md
    ├── 接口与函数-环境配置与项目初始化.md
    ├── 类与枚举-环境配置与项目初始化.md
    ├── 泛型-环境配置与项目初始化.md
    ├── 类型断言与守卫-环境配置与项目初始化.md
    ├── 类型兼容性-环境配置与项目初始化.md
    ├── 索引签名与索引访问类型-环境配置与项目初始化.md
    ├── 映射类型-环境配置与项目初始化.md
    ├── 类型声明文件-环境配置与项目初始化.md
    └── 工具类型与装饰器-环境配置与项目初始化.md
```

## 笔记列表

| 笔记 | 简介 |
|------|------|
| <a href="obsidian://open?file=基础与特殊类型">TypeScript-基础与特殊类型</a> | any/unknown/void/never 四种特殊类型 + 隐式 any 场景 |
| <a href="obsidian://open?file=接口与函数类型">TypeScript-接口与函数类型</a> | Interface 对象形状、函数重载、interface vs type |
| <a href="obsidian://open?file=类与高级类型">TypeScript-类与高级类型</a> | 访问修饰符、枚举细节、readonly 推断、联合/交叉类型 |
| <a href="obsidian://open?file=泛型">TypeScript-泛型</a> | `<T>` 泛型函数/约束、keyof 运算符、多类型变量约束 |
| <a href="obsidian://open?file=类型断言与类型守卫">TypeScript-类型断言与类型守卫</a> | as 断言、typeof/instanceof/in、is 谓词、typeof 类型查询 |
| <a href="obsidian://open?file=类型兼容性与结构化类型">TypeScript-类型兼容性与结构化类型</a> | 结构化类型系统、class/接口/函数兼容规则、逆变与协变 |
| <a href="obsidian://open?file=索引签名与索引访问类型">TypeScript-索引签名与索引访问类型</a> | `[key: string]: T` 任意属性约束、`T[P]` 查询属性类型 |
| <a href="obsidian://open?file=映射类型">TypeScript-映射类型</a> | `[K in Keys]` 逐键变换、工具类型的实现机制、键重映射 |
| <a href="obsidian://open?file=工具类型与装饰器">TypeScript-工具类型与装饰器</a> | Partial/Pick/Omit/Record/ReturnType + @decorator |
| <a href="obsidian://open?file=类型声明文件">TypeScript-类型声明文件</a> | .ts vs .d.ts、@types/DefinitelyTyped、declare 关键字 |

## 学习路径

基础类型 → 接口与函数 → 类与高级类型 → 泛型 → 类型断言守卫 → **类型兼容性与结构化类型** → **索引签名与索引访问类型** → **映射类型** → 工具类型与装饰器 → **类型声明文件**

> 其中索引签名 → 映射类型 → 工具类型是一条强依赖链：映射类型借用索引签名语法，内置工具类型全部基于映射类型实现。

## 跨领域关联

| 概念 | 关联 |
|------|------|
| TS 类型检查 | <a href="obsidian://open?file=XD-4 编程语言与编译">XD-4 编程语言与编译</a> — Hindley-Milner 类型推导 |
| 结构化类型系统 | <a href="obsidian://open?file=XD-4 编程语言与编译">XD-4 编程语言与编译</a> — 结构类型 vs 名义类型、逆变/协变理论 |
| `never` 穷尽检查 | <a href="obsidian://open?file=XD-5 数据结构与算法">XD-5 数据结构与算法</a> — 空集是其他类型的子类型 |
| 类型兼容"成员多赋给成员少" | <a href="obsidian://open?file=XD-5 数据结构与算法">XD-5 数据结构与算法</a> — 集合论：类型 = 值集合，子类型 = 子集 |
| 泛型约束 `extends` | <a href="obsidian://open?file=XD-5 数据结构与算法">XD-5 数据结构与算法</a> — 集合论子类型关系 |
| 工具类型 Pick/Omit | <a href="obsidian://open?file=XD-5 数据结构与算法">XD-5 数据结构与算法</a> — 集合论操作 |
| 映射类型遍历 | <a href="obsidian://open?file=XD-5 数据结构与算法">XD-5 数据结构与算法</a> — 对键集合的一一代换 |
| 类型声明文件 | <a href="obsidian://open?file=XD-4 编程语言与编译">XD-4 编程语言与编译</a> — C/C++ 头文件声明与实现分离思想的现代化 |
| 装饰器 | <a href="obsidian://open?file=XD-6 软件工程与架构">XD-6 软件工程与架构</a> — AOP 面向切面编程 |

## 标签统计

| 标签 | 频次 |
|------|------|
| `前端/TypeScript` | 20 |
| `type/笔记` | 10 |
| `type/教程` | 10 |

> 📂 所属：[[MOC - 前端]]
