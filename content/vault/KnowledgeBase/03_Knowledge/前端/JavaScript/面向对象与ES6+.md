---
aliases: [JS 面向对象, JS 原型, ES6 Class, 解构赋值, 展开运算符, 模板字符串, Set, Map]
tags:
  - status/进行中
  - type/笔记
  - 前端/JavaScript
created: "2026-06-16 19:19"
updated: "2026-06-16 19:19"
source: "JavaScript 终极详细语法与核心知识笔记（已归档）"
知识体系: "前端 → L0 三件套"
技术版本: "ES6+"
---

# JavaScript 面向对象与 ES6+ 高级特性

## 📍 知识体系定位
- **所属技术栈**：前端 Vue 3
- **所在层级**：L0 三件套 → JavaScript → OOP 与 ES6+
- **上游依赖**：<a href="obsidian://open?file=函数与参数">JavaScript-函数与参数</a>、<a href="obsidian://open?file=核心内置对象">JavaScript-核心内置对象</a>
- **下游延伸**：Vue 3 组件系统（Options API / Class-based API）、TypeScript 类型系统
- **同级技术**：Java OOP（经典类继承）、Python OOP（多继承/Mixin）

## 概述（Overview）
> JavaScript 的面向对象基于**原型链（Prototype Chain）**而非类继承——每个对象都有一个隐式的 `Prototype（📋 待补充）` 链接到另一个对象，形成属性查找链。ES6 的 `class` 语法是原型的语法糖，写法更接近传统 OOP 语言。ES6+ 同时引入了**解构赋值**、**展开运算符**、**模板字符串**、**Set/Map** 等高级特性，大幅提升了 JS 的表达力。

## 设计初衷（Motivation）

### 设计思想
JavaScript 选择了原型继承而非类继承——这在 1995 年是极其大胆的设计。Brendan Eich 的原话："我被告知要让 JS 看起来像 Java，所以我做了 `new` 和构造函数，但继承机制我用了原型链。" 原型继承比类继承更灵活：可以动态修改原型（Monkey Patching），可以实现"组合优于继承"（Object.assign 混入）。

ES6 class 语法没有改变底层的原型机制——它只是让代码更好读、更好写。`class` 内部的方法仍然定义在 `prototype` 上。

### 跨学科溯源
- 原型链查找 → <a href="obsidian://open?file=XD-5 数据结构与算法">XD-5 数据结构与算法</a>（单链表向上遍历，类似作用域链查找算法）
- Set 数据结构 → <a href="obsidian://open?file=XD-5 数据结构与算法">XD-5 数据结构与算法</a>（哈希表实现的唯一值集合，add/has/delete 平均 O(1)）
- Map vs Object → <a href="obsidian://open?file=XD-5 数据结构与算法">XD-5 数据结构与算法</a>（哈希表键值对：Map 键可以是任意类型，Object 键只能是 String/Symbol）

## 实现（Implementation）

### ES5 构造函数与原型

```javascript
// ES5 方式：构造函数 + prototype
function Person(name, age) {
    this.name = name;      // 实例属性（每个实例一份）
    this.age = age;
}
// 共享方法挂载到 prototype（所有实例共享一份，节省内存）
Person.prototype.sayHello = function() {
    console.log("Hi, I am " + this.name);
};

const p1 = new Person("Alice", 25);
p1.sayHello(); // "Hi, I am Alice"
```

### ES6 Class 类语法

```javascript
class Animal {
    constructor(name) {
        this.name = name;
    }

    speak() {
        console.log(`${this.name} makes a noise.`);
    }
}

// 继承 extends
class Dog extends Animal {
    constructor(name, breed) {
        super(name);         // ★ 必须首先调用父类 constructor
        this.breed = breed;
    }

    // 方法重写
    speak() {
        console.log(`${this.name} barks!`);
    }
}

const d = new Dog("Rex", "German Shepherd");
d.speak(); // "Rex barks!"
```

### 解构赋值（Destructuring）

```javascript
// 对象解构
const user = { id: 1, username: "John", profile: { age: 30 } };
const { id, username: name, profile: { age } } = user;
// id = 1, name = "John"（可重命名）, age = 30（深层解构）
// 默认值：const { role = "user" } = user;
// 剩余属性：const { id, ...rest } = user;

// 数组解构
const colors = ["red", "green", "blue"];
const [firstColor, , thirdColor] = colors; // 逗号跳过：firstColor="red", thirdColor="blue"
// 交换变量：[a, b] = [b, a];
```

### 展开运算符与模板字符串

```javascript
// 展开运算符 ...（Spread）：打散数组/对象
const arr1 = [1, 2];
const arr2 = [...arr1, 3, 4];           // [1, 2, 3, 4] — 合并
const obj1 = { a: 1 };
const obj2 = { ...obj1, b: 2 };         // { a: 1, b: 2 } — 浅拷贝+扩展

// 模板字符串（反引号 ``，支持多行和插值）
const name = "JS";
const html = `
    <div>
        <h1>Welcome to ${name}</h1>
        <p>Today is ${new Date().toLocaleDateString()}</p>
    </div>
`;
```

### Set 与 Map（ES6 新数据结构）

```javascript
// ① Set：成员唯一（常用于去重）
const set = new Set([1, 2, 2, 3]);
set.add(4);
set.has(2);         // true
set.delete(3);
[...set];           // [1, 2, 4]
// 终极去重：[...new Set(array)]

// ② Map：真正的键值对（键可以是任意类型，不限于字符串）
const map = new Map();
map.set('string', 'value');      // 字符串键
map.set(123, 'number key');      // 数字键
map.set({ id: 1 }, 'object key');// ★ 对象也可以作为键！
map.get('string');               // "value"
map.has(123);                    // true
map.forEach((value, key) => console.log(key, value));
```

> **💡 补充**：Object vs Map 的选择原则——当键全为字符串/Symbol 且结构固定时用 Object；当键需要非字符串类型、频繁增删、需要保持插入顺序时用 Map。Map 的 `size` 属性直接获取条目数（Object 需要 `Object.keys(obj).length`）。

## 关联上下文（全量覆盖）
- **横向对比**：Java 面向对象 — Java 的 class 是真正的类（静态类型），JS 的 class 是原型的语法糖。（📋 待补充）
- **实际应用**：<a href="obsidian://open?file=响应式引擎与CompositionAPI">Vue3-响应式引擎与CompositionAPI</a> — Vue 3 组件可用 Options API（对象）或 Class API（装饰器写法）
- **易混淆概念**：`extends` vs `prototype` 链 — extends 语法糖底层仍创建原型链：`Dog.prototype.__proto__ === Animal.prototype`

> 📂 所属：[[MOC - JavaScript]]
