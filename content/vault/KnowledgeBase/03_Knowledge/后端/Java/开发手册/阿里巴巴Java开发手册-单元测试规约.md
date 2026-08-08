---
aliases: [Java 单元测试规约, JUnit 规范, 阿里巴巴测试规范]
tags: [status/进行中, type/笔记, 后端/Java]
created: "2026-06-16 20:17"
updated: "2026-06-16 20:17"
source: "阿里巴巴Java开发手册-母体笔记（已归档）"
知识体系: "Java 后端 → L3 框架层"
技术版本: "JUnit 5 / 阿里巴巴 Java 开发手册 1.4.0"
---

# 单元测试规约

## 📍 知识体系定位
- **所属技术栈**：Java 后端
- **所在层级**：L3 框架层 → 测试
- **上游依赖**：JUnit 框架基础
- **下游延伸**：TDD 测试驱动开发、CI/CD 自动化测试流水线

## 实现（Implementation）

### 核心规约

```java
@SpringBootTest
class UserServiceTest {

    @Test
    @DisplayName("创建用户 - 正常流程")
    void shouldCreateUser_whenValidInput() {
        // AAA 模式：Arrange → Act → Assert
        // Arrange：准备数据
        UserDTO dto = new UserDTO("Alice", "alice@test.com");

        // Act：执行被测方法
        User user = userService.create(dto);

        // Assert：验证结果
        assertNotNull(user.getId());
        assertEquals("Alice", user.getName());
        assertTrue(user.getCreatedAt().isAfter(LocalDateTime.now().minusMinutes(1)));
    }
}
```

| 规则 | 说明 |
|------|------|
| 【强制】好的测试遵守 AIR 原则 | Automatic（自动）、Independent（独立）、Repeatable（可重复） |
| 【强制】单元测试必须全自动/非交互 | 不能依赖人工检查（如 `System.out` 需要人眼看） |
| 【强制】保持测试独立性 | 测试之间不能有依赖关系，执行顺序无关 |
| 【推荐】BCDE 原则 | Border（边界值）、Correct（正确输入）、Design（结合设计文档）、Error（错误输入） |
| 【强制】目标：增量代码覆盖率高 | 核心业务 ≥ 90%，新增代码 ≥ 80% |

### 测试命名与结构

```java
// 命名：should_ExpectedBehavior_when_Condition
should_throwException_when_userIdIsNull()
should_returnEmptyList_when_noDataFound()
should_createOrder_when_validInput()

// 反对：testMethod1、testMethod2 等无意义命名
```

### 反例清单

```java
// ❌ 错误1：测试依赖数据库状态
@Test void test() {
    // 假设数据库中有 id=1 的用户——测试不可重复
}

// ❌ 错误2：测试没有断言（空壳测试）
@Test void testCreate() {
    userService.create(dto);  // 没有 assert！
}

// ❌ 错误3：for 循环中加断言（一个失败全终止）
for (case : cases) {
    assertEquals(case.expected, actual);  // 应逐个作为独立测试
}
```

> **💡 补充**：阿里巴巴推荐用 **Mockito** 隔离外部依赖。单元测试不等于集成测试——不需要真的连数据库、连 Redis、发 HTTP 请求。Mock 掉一切外部依赖，只测当前单元的纯逻辑。

## 关联上下文（全量覆盖）
- **前置知识**：<a href="obsidian://open?file=阿里巴巴Java开发手册-OOP与格式规约">阿里巴巴Java开发手册-OOP与格式规约</a> — 好的代码设计是可测试的前提
- **横向对比**：📋 待补充：Spring Boot 测试最佳实践 — `@SpringBootTest` vs `@WebMvcTest` vs `@DataJpaTest`
- **实际应用**：CI 流水线中的 `mvn test` 阶段、SonarQube 覆盖率门禁

> 📂 所属：[[MOC - 开发手册]]