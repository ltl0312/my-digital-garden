---
aliases: [Java IO流, InputStream, OutputStream, Reader, Writer, 流关闭, Flushable]
tags:
  - status/已完成
  - type/笔记
  - Java/IO
created: "2026-06-16 10:00"
updated: "2026-06-16 15:00"
source: "00_Inbox/Java.md"
知识体系: "Java 后端 → L2 核心工具"
技术版本: "Java 17"
---
# Java IO 流体系

## 📍 知识体系定位
（严格按 03_Knowledge/技术划分.md 填写）
- **所属技术栈**：Java 后端
- **所在层级**：Java 后端 → L2 核心工具
- **上游依赖**：（根据该技术在技术划分中的层级，列出上一层必须掌握的前置知识）
- **下游延伸**：（列出下一层可以学习的进阶技术）
- **同级技术**：集合框架（L2）、多线程（L2）、反射（L2）

## 核心概念
> IO 流是 Java 与外部数据（文件、网络等）交互的核心机制。四大抽象类统领 16 个具体流，分为字节流（万能）和字符流（专攻文本）。

---

## 一、IO 流基本概念

### 方向定义
- **输入流（Input）**：硬盘 → 内存（Read / 读入）
- **输出流（Output）**：内存 → 硬盘（Write / 写出）

### 分类方式
| 维度 | 分类 |
|------|------|
| 按流向 | 输入流 / 输出流 |
| 按数据类型 | 字节流（万能，读任何文件）/ 字符流（只能读普通文本文件） |

---

## 二、IO 流四大家族（全部是抽象类）

```
java.io.InputStream   → 字节输入流
java.io.OutputStream  → 字节输出流
java.io.Reader        → 字符输入流
java.io.Writer        → 字符输出流
```

### 共性规则
- 所有流都实现了 **Closeable** 接口 → 都是可关闭的
- 所有输出流都实现了 **Flushable** 接口 → 都是可刷新的
- **铁律**：流用完必须 close()，输出流写完必须 flush()

---

## 三、16 个需要掌握的流

### 文件专属（4 个）
| 类 | 方向 | 类型 | 关键方法 |
|----|------|------|----------|
| `FileInputStream` | 输入 | 字节 | `read()`, `read(byte[])`, `available()`, `skip(n)` |
| `FileOutputStream` | 输出 | 字节 | `write(int)`, `write(byte[])`, `write(byte[], off, len)`，构造方法有 `append` 参数 |
| `FileReader` | 输入 | 字符 | `read()`, `read(char[])` |
| `FileWriter` | 输出 | 字符 | `write(String)`（可直接写字符串） |

### 转换流（2 个）—— 字节 → 字符的桥梁
- `InputStreamReader`
- `OutputStreamWriter`

### 缓冲流（4 个）—— 自带缓冲区，高效
- `BufferedReader` — 有 `readLine()` 方法
- `BufferedWriter`
- `BufferedInputStream`
- `BufferedOutputStream`

### 数据流（2 个）—— 携带数据类型信息
- `DataInputStream` — `readByte()`, `readInt()`, `readChar()` 等
- `DataOutputStream` — `writeByte()`, `writeInt()`, `writeChar()` 等

### 标准流（2 个）
- `PrintWriter`
- `PrintStream`（System.out 就是这个类型）

### 对象流（2 个）
- `ObjectInputStream` — 反序列化
- `ObjectOutputStream` — 序列化

---

## 四、FileInputStream 标准读文件代码（架子）

```java
FileInputStream f = null;
try {
    f = new FileInputStream("tempFile");
    // 方式1：逐字节读取
    int readData = 0;
    while ((readData = f.read()) != -1) {
        System.out.println(readData);
    }

    // 方式2：批量读取（高效）
    byte[] b = new byte[4];
    int readCount = 0;
    while ((readCount = f.read(b)) != -1) {
        System.out.println(new String(b, 0, readCount));
    }

    // 方式3：一次读完（available() 返回未读字节数）
    byte[] all = new byte[f.available()];
    f.read(all);
    System.out.println(new String(all));

} catch (FileNotFoundException e) {
    e.printStackTrace();
} catch (IOException e) {
    e.printStackTrace();
} finally {
    if (f != null) {
        try { f.close(); } catch (IOException e) { e.printStackTrace(); }
    }
}
```

> IDEA 默认当前路径 = **工程 Project 的根目录**

### 文件拷贝标准代码
```java
FileInputStream fi = null;
FileOutputStream fo = null;
try {
    fi = new FileInputStream("源文件");
    fo = new FileOutputStream("目标文件");
    byte[] b = new byte[1024 * 1024];  // 1MB 缓冲区
    int readCount = 0;
    while ((readCount = fi.read(b)) != -1) {
        fo.write(b, 0, readCount);
    }
    fo.flush();  // 输出流必须刷新！
} catch (FileNotFoundException e) {
    e.printStackTrace();
} catch (IOException e) {
    e.printStackTrace();
} finally {
    if (fi != null) { try { fi.close(); } catch (IOException e) { e.printStackTrace(); } }
    if (fo != null) { try { fo.close(); } catch (IOException e) { e.printStackTrace(); } }
}
```

---

## 五、BufferedReader（缓冲字符流）

```java
// 节点流 + 包装流模式（装饰器模式）
FileReader reader = new FileReader("文件名");
BufferedReader br = new BufferedReader(reader);

String line = null;
while ((line = br.readLine()) != null) {   // readLine() 读取一行
    System.out.println(line);
}
br.close();  // 关闭包装流 = 关闭节点流

// 连写（字节流转字符流再缓冲）
BufferedReader br = new BufferedReader(
    new InputStreamReader(
        new FileInputStream("文件")
    )
);
```

> 包装流关闭后，被包装的节点流自动关闭，无须手动关闭内层流。

---

## 六、数据流（DataStream）

```java
DataOutputStream dos = new DataOutputStream(new FileOutputStream("data"));
dos.writeByte(100);    // 写入的不只是数据，还包括类型信息！
dos.writeInt(300);     // 所以用记事本打开会乱码
dos.writeChar('a');    // 必须用 DataInputStream 对应读取
dos.flush();
dos.close();

// 读取时顺序必须和写入时完全一致
DataInputStream dis = new DataInputStream(new FileInputStream("data"));
byte b = dis.readByte();
int i = dis.readInt();
char c = dis.readChar();
dis.close();
```

---

## 七、PrintStream（标准输出流）

```java
PrintStream ps = System.out;
ps.println("输出到控制台");  // 默认输出到控制台，不需要 flush 和 close

// 重定向输出到文件（日志功能）
PrintStream pr = new PrintStream(new FileOutputStream("log.txt", true));
System.setOut(pr);
System.out.println("这行输出到 log.txt 文件");

// 日志工具类示例
class Logger {
    public static void log(String msg) {
        try {
            PrintStream out = new PrintStream(new FileOutputStream("log.txt", true));
            System.setOut(out);
            Date date = new Date();
            SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss SSS");
            String time = sdf.format(date);
            System.out.println(msg + time);
        } catch (FileNotFoundException e) {
            e.printStackTrace();
        }
    }
}
```

---

## 关联上下文
- **前置知识**：📋 待补充：Java-异常处理 掌握 try-catch-finally 是安全操作流的前提
- **横向对比**：📋 待补充：Java-NIO Java NIO 提供非阻塞式 IO，适用于高并发场景；Apache Commons IO 提供工具类简化操作
- **实际应用**：📋 待补充：Java-Properties配置文件 使用 IO 流读写配置文件；📋 待补充：日志系统设计 日志输出依赖 PrintStream 重定向
- **进阶方向**：📋 待补充：Java-NIO、📋 待补充：Netty框架、📋 待补充：零拷贝技术
- **易混淆概念**：📋 待补充：字节流vs字符流 字节流操作所有二进制数据，字符流只操作文本
- **异常处理**：IO 操作的异常处理依赖 try-catch-finally 确保流关闭，详见 <a href="obsidian://open?file=异常处理">Java-异常处理</a>

> 📂 所属：[[MOC - IO流]]
