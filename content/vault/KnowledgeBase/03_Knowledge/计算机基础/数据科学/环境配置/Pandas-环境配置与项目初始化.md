---
aliases: [Pandas 安装, PyArrow 配置, Python 数据科学环境]
tags: [status/进行中, type/教程, 数据科学/Pandas]
created: "2026-06-16 22:00"
updated: "2026-06-16 22:00"
source: "https://pandas.pydata.org/docs/getting_started/install.html"
知识体系: "跨学科纵深 → XD-7 数据与智能"
技术版本: "Pandas 2.0+ + PyArrow"
---

# Pandas 2.0+ — 环境配置与项目初始化

## 前置条件
- Python 3.9+（推荐 3.11+）

## Step 1: 安装

```bash
pip install pandas pyarrow openpyxl
# pyarrow: 高性能后端引擎
# openpyxl: 读写 Excel 文件
```

验证：
```python
import pandas as pd
print(pd.__version__)  # ≥ 2.0.0
print(pd.options.mode.copy_on_write)  # 检查 CoW 状态
```

## Step 2: 启用 PyArrow + CoW

```python
pd.options.mode.copy_on_write = True  # 推荐立即开启
# 读取数据时指定后端
df = pd.read_csv("data.csv", dtype_backend="pyarrow")
```

## Step 3: 最小示例

```python
import pandas as pd
df = pd.DataFrame({'A': [1, 2, 3], 'B': [4, 5, 6]})
result = (df.assign(C=lambda x: x['A'] + x['B'])
           .query('C > 5'))
print(result)
#    A  B  C
# 1  2  5  7
# 2  3  6  9
```

## Step 4: 推荐 IDE

- **Jupyter Lab / VS Code + Jupyter 扩展**：单元格逐步执行，适合探索性分析
- **PyCharm Professional**：DataFrame 可视化调试

## 常见问题

1. **`dtype_backend="pyarrow"` 报错**：确认 PyArrow 已安装（`pip install pyarrow`），Pandas ≥ 1.5（推荐 2.0+）。
2. **旧代码 SettingWithCopyWarning 太多**：开启 `pd.options.mode.copy_on_write = True` 后大部分警告消失（CoW 模式下逻辑天然安全）。
3. **大文件读取内存不足**：用 `chunksize` 分块读取或直接用 PyArrow 后端减少内存占用。

> 📂 所属：[[MOC - 数据科学]]
