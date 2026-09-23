---
aliases: [GraalVM配置, Launch4j打包, SpringBoot exe 配置]
tags:
  - status/进行中
  - type/教程
  - Java/SpringBoot
created: "2026-06-16 17:40"
updated: "2026-06-16 17:40"
source: "https://docs.spring.io/spring-boot/docs/current/reference/html/native-image.html"
知识体系: "Java 后端 → L3 框架层"
技术版本: "Spring Boot 3.x / GraalVM 22.3+ / Java 17"
---

# SpringBoot 桌面应用打包 — 环境配置与项目初始化

## 信息来源
- **官方文档**：https://docs.spring.io/spring-boot/docs/current/reference/html/native-image.html（✅ 可访问）
- **参考文章**：
  - GraalVM Native Image 入门：https://www.graalvm.org/latest/reference-manual/native-image/

## 前置条件
- JDK 17+（GraalVM 发行版，非 OpenJDK）
- Maven 3.8+
- Windows：Visual Studio 2022 Build Tools（C++ 桌面开发组件）
- macOS：Xcode Command Line Tools
- Linux：gcc、glibc、zlib1g-dev

## Step 1: 安装 GraalVM

### Windows
```bash
# 方式一：SDKMAN（推荐）
sdk install java 22.3.r17-grl

# 方式二：手动下载
# 访问 https://github.com/graalvm/graalvm-ce-builds/releases
# 下载 graalvm-ce-java17-windows-amd64-22.3.x.zip
# 解压后配置 JAVA_HOME 和 PATH
```

### macOS / Linux
```bash
sdk install java 22.3.r17-grl
```

## Step 2: 验证安装

```bash
java -version
# 预期输出：openjdk version "17.0.x" ... GraalVM CE 22.3.x

native-image --version
# 预期输出：GraalVM 22.3.x Java 17 CE
```

## Step 3: 初始化 Spring Boot 3.x 项目

```bash
# 用 Spring Initializr 创建项目（选 Java 17 + Spring Boot 3.x）
# 或手动创建 pom.xml，关键依赖：
```

```xml
<parent>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-parent</artifactId>
    <version>3.2.0</version>
</parent>

<dependencies>
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-web</artifactId>
    </dependency>
</dependencies>

<build>
    <plugins>
        <plugin>
            <groupId>org.graalvm.buildtools</groupId>
            <artifactId>native-maven-plugin</artifactId>
        </plugin>
    </plugins>
</build>
```

## Step 4: 配置 application.yml（离线优化）

```yaml
server:
  port: 0  # 随机端口，避免 8080 冲突

spring:
  main:
    web-application-type: servlet  # 保留 Web 能力（本地 localhost）
  datasource:
    url: jdbc:sqlite:./data.db     # SQLite 文件型数据库，零安装
    driver-class-name: org.sqlite.JDBC
```

## Step 5: 编译 Native Image

```bash
# 生成原生 .exe（Windows）
mvn -Pnative native:compile

# 输出：./target/app.exe
# 双击即可运行，无需 JRE！
```

### 常见反射/代理问题配置

如果使用了 MyBatis/Jackson 等依赖反射的库，需要额外配置：

```java
// 在任意 @Configuration 类中添加
@Configuration
@ImportRuntimeHints(MyRuntimeHints.class)
public class NativeConfig {}

class MyRuntimeHints implements RuntimeHintsRegistrar {
    @Override
    public void registerHints(RuntimeHints hints, ClassLoader classLoader) {
        hints.reflection().registerType(MyEntity.class, MemberCategory.INTROSPECT_PUBLIC_METHODS);
    }
}
```

## Step 5: 替代方案 — Launch4j（零代码改动）

```xml
<!-- pom.xml -->
<plugin>
    <groupId>com.akathist.maven.plugins.launch4j</groupId>
    <artifactId>launch4j-maven-plugin</artifactId>
    <version>2.5.3</version>
    <executions>
        <execution>
            <phase>package</phase>
            <goals><goal>launch4j</goal></goals>
            <configuration>
                <headerType>gui</headerType>
                <outfile>target/MyApp.exe</outfile>
                <jar>target/app.jar</jar>
                <jre>
                    <path>./jre</path>
                    <minVersion>17</minVersion>
                </jre>
            </configuration>
        </execution>
    </executions>
</plugin>
```

## 常见安装/配置问题

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| `native-image` 编译超慢（10+ 分钟） | AOT 需要静态分析所有代码路径 | 正常现象，首次编译后增量编译会加速 |
| 编译报 `ClassNotFoundException` | 反射/动态代理类未注册 | 添加 `@ImportRuntimeHints` 注册反射类 |
| Launch4j 打包的 exe 双击闪退 | 端口冲突或数据库连接失败 | 配置 `server.port=0` + 检查 SQLite 驱动 |
| exe 体积过大（200MB+） | Launch4j 自带完整 JRE | 用 `jlink` 裁剪 JRE 只保留必要模块 |

> 📂 所属：[[MOC - SpringBoot]]
