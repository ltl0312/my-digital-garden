"""把 src/ 下的分散源码内联成单文件原型稿 preview.html。

产物自包含（无外部依赖，除 Google Fonts 字体），双击即可用浏览器打开，
也可直接拖进任何静态托管。
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'src')
DATA = os.path.join(SRC, 'data')
OUT = os.path.join(HERE, 'preview.html')

FONT_LINK = ('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800'
             '&family=Newsreader:ital,opsz,wght@0,6..72,400;1,6..72,400'
             '&family=JetBrains+Mono:wght@400;500;600&display=swap')


def read(path):
    with open(path, 'r', encoding='utf-8') as f:
        return f.read()


def data(name, fallback='null'):
    p = os.path.join(DATA, name)
    return read(p).strip() if os.path.exists(p) else fallback


body = read(os.path.join(SRC, 'body.html'))
css = read(os.path.join(SRC, 'styles.css'))
js = read(os.path.join(SRC, 'app.js'))

# 数据注入（JSON 内不含 </script>，可安全内联）
body = body.replace('<!--DATA_NOTES-->', data('notes.json', '[]'))
body = body.replace('<!--DATA_TAGS-->', data('tags.json', '[]'))
body = body.replace('<!--DATA_TREE-->', data('tree.json', '[]'))
body = body.replace('<!--DATA_GRAPH-->', data('graph.json', '{"nodes":[],"edges":[]}'))
body = body.replace('<!--DATA_NOTE-->', data('note-detail.json', '{}'))
body = body.replace('<!--NOTE_BODY-->', data('note-body.html', ''))

assert '<!--DATA_' not in body and '<!--NOTE_BODY-->' not in body, '仍有未注入的数据占位符'

html = f"""<!DOCTYPE html>
<html lang="zh-CN" data-theme="dark">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>拾光 · 界面改版预览（DAWN v2）</title>
<meta name="description" content="拾光数字花园界面改版方案 · 可交互原型">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="{FONT_LINK}">
<style>
{css}
</style>
</head>
<body>
<!--
  拾光 · DAWN 设计语言 v2 —— 界面改版可交互原型
  单文件自包含产物，由 design-preview/build.py 生成，请勿直接编辑本文件。
  源文件位于 design-preview/src/。
-->
{body}
<script>
{js}
</script>
</body>
</html>
"""

with open(OUT, 'w', encoding='utf-8') as f:
    f.write(html)

print('生成 %s（%.1f KB）' % (OUT, len(html.encode('utf-8')) / 1024))
