"""把 spec.css + spec-body.html + 截图内联成单文件设计方案文档 design-spec.html。

截图（before 取自线上快照、after 取自本原型截图）会先缩放为 JPEG 存入 src/shots/，
再以 base64 data-URI 内联，保证文档可离线独立打开。
"""
import base64
import io
import json
import os
import shutil

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'src')
SHOTS = os.path.join(SRC, 'shots')
OUT = os.path.join(HERE, 'design-spec.html')

TMP = r'C:/Users/ZhuanZ/AppData/Local/Temp/garden-design'
BEFORE = os.path.join(TMP, 'shots')
AFTER = os.path.join(TMP, 'after')
PERM = os.path.join(TMP, 'perm')
MAT = os.path.join(TMP, 'mat-shots')
IMP = os.path.join(TMP, 'imp')
CTX = os.path.join(TMP, 'ctx')

# key -> (来源文件, 是否裁切顶部像素数)
IMAGES = {
    'before-home': (os.path.join(BEFORE, '02-home.png'), None, 1160),
    'before-notes': (os.path.join(BEFORE, '03-notes-list.png'), None, 1160),
    'before-detail': (os.path.join(BEFORE, '06-note-detail.png'), 1300, 1000),
    'before-login': (os.path.join(BEFORE, '01-login.png'), 760, 1000),
    'before-graph': (os.path.join(BEFORE, '04-graph.png'), None, 1160),
    'before-admin': (os.path.join(BEFORE, '05-admin.png'), None, 1160),
    'before-mobile': (os.path.join(BEFORE, '12-mobile-home.png'), None, 420),
    'after-home': (os.path.join(AFTER, '01-home-dark.png'), None, 1160),
    'after-home-light': (os.path.join(AFTER, '07-home-light.png'), None, 1160),
    'after-notes': (os.path.join(AFTER, '02-notes-dark.png'), None, 1160),
    'after-detail': (os.path.join(AFTER, '03-note-dark.png'), None, 1160),
    'after-graph': (os.path.join(AFTER, '04-graph-dark.png'), None, 1160),
    'after-admin': (os.path.join(AFTER, '05-admin-dark.png'), None, 1160),
    'after-login': (os.path.join(AFTER, '12-login-light.png'), None, 1160),
    'after-mobile': (os.path.join(AFTER, '20-mobile-home.png'), None, 480),
    'after-mobile-drawer': (os.path.join(AFTER, '22-mobile-drawer.png'), None, 480),
    'after-facet-domain': (os.path.join(AFTER, '18-facet-domain.png'), None, 1160),
    'after-facet-tag': (os.path.join(AFTER, '19-facet-tag.png'), None, 1160),
    'after-palette': (os.path.join(AFTER, '13-palette.png'), None, 1160),
    'after-modal': (os.path.join(AFTER, '14-modal-new.png'), None, 1160),
    # 分级权限与文件夹（第三轮新增）
    'after-admin-root': (os.path.join(PERM, '03-admin-root.png'), None, 1160),
    'after-admin-admin': (os.path.join(PERM, '04-admin-admin.png'), None, 1160),
    'after-admin-denied': (os.path.join(PERM, '05-admin-denied.png'), None, 1160),
    'after-keys-user': (os.path.join(PERM, '06-keys-user.png'), None, 1160),
    'after-new-folder': (os.path.join(PERM, '01-new-folder-dialog.png'), 560, 900),
    'after-folder-created': (os.path.join(PERM, '02-folder-created.png'), None, 1160),
    # 批量导入（第四轮新增）
    'imp-menu': (os.path.join(IMP, '00-new-menu.png'), None, 1160),
    'imp-empty': (os.path.join(IMP, '01-empty.png'), None, 820),
    'imp-pass': (os.path.join(IMP, '02-pass-4.9mb.png'), None, 820),
    'imp-block-single': (os.path.join(IMP, '03-block-single.png'), None, 820),
    'imp-block-total': (os.path.join(IMP, '04-block-total.png'), None, 820),
    'imp-result': (os.path.join(IMP, '07-result.png'), None, 820),
    'imp-dup': (os.path.join(IMP, '08-dup-blocked.png'), None, 820),
    'imp-folder': (os.path.join(IMP, '10-folder-keep.png'), None, 820),
    # 成熟度治理（第六轮新增）
    'mat-list': (os.path.join(MAT, '01-list-all.png'), None, 1000),
    'mat-evergreen': (os.path.join(MAT, '02-list-evergreen.png'), None, 1000),
    'mat-graph': (os.path.join(MAT, '04-graph-maturity.png'), None, 900),
    'mat-note': (os.path.join(MAT, '05-note-evergreen.png'), None, 900),
    'mat-sucai': (os.path.join(MAT, '06-sucai-4.png'), None, 1000),
    'mat-moc': (os.path.join(MAT, '07-moc-46.png'), None, 1000),
    # 第四轮：右键文件操作 + 界面细节修正
    'ctx-login-dark': (os.path.join(CTX, '01-login-dark.png'), None, 1160),
    'ctx-login-light': (os.path.join(CTX, '02-login-light.png'), None, 1160),
    'ctx-sidebar-open': (os.path.join(CTX, '03-sidebar-open.png'), None, 720, (0, 56, 430, 640)),
    'ctx-sidebar-collapsed': (os.path.join(CTX, '04-sidebar-collapsed.png'), None, 720, (0, 56, 640, 300)),
    'ctx-folder': (os.path.join(CTX, '05-ctx-folder.png'), None, 720, (0, 56, 620, 560)),
    'ctx-file': (os.path.join(CTX, '06-ctx-file.png'), None, 720, (0, 56, 620, 520)),
    'ctx-blank': (os.path.join(CTX, '07-ctx-blank.png'), None, 720, (0, 56, 620, 470)),
    'ctx-rename': (os.path.join(CTX, '08-rename-inline.png'), None, 720, (0, 56, 620, 450)),
    'ctx-rename-err': (os.path.join(CTX, '09-rename-dup-error.png'), None, 720, (0, 56, 620, 520)),
    'ctx-paste': (os.path.join(CTX, '10-ctx-paste-ready.png'), None, 720, (0, 56, 660, 610)),
    'ctx-readonly': (os.path.join(CTX, '13-ctx-readonly.png'), None, 720, (0, 56, 700, 620)),
    'ctx-node-del': (os.path.join(CTX, '12-node-del-confirm.png'), None, 900, (450, 220, 620, 460)),
    'imp-rule': (os.path.join(CTX, '14-import-rule.png'), None, 900),
}

# 裁掉右侧多余的空白（before-detail 是整页长图，只保留顶部一段）
QUALITY = 74

# 裁切框由 reference 截图脚本实测写入（ctx/boxes.json），
# 优先于 IMAGES 里手写的 box —— 菜单的位置取决于右键点，手写很容易裁掉半截。
BOX_FILE = os.path.join(CTX, 'boxes.json')
BOXES = {}
if os.path.exists(BOX_FILE):
    with open(BOX_FILE, 'r', encoding='utf-8') as f:
        BOXES = json.load(f)


def prepare(key, path, crop_h, width, box=None):
    """读取 → 裁切 → 缩放 → 存 JPEG，返回 base64。

    box: 可选的 (x, y, w, h) 局部裁切。原型截图一律拍全屏
    （puppeteer 的 clip 截图在页面布局变化后会返回上一帧的陈旧位图），
    需要局部特写时在这里裁。
    """
    if not os.path.exists(path):
        raise FileNotFoundError(path)
    im = Image.open(path).convert('RGB')
    if box:
        bx, by, bw, bh = box
        im = im.crop((bx, by, min(bx + bw, im.width), min(by + bh, im.height)))
    if crop_h:
        im = im.crop((0, 0, im.width, min(crop_h, im.height)))
    if im.width > width:
        im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    os.makedirs(SHOTS, exist_ok=True)
    dst = os.path.join(SHOTS, key + '.jpg')
    im.save(dst, 'JPEG', quality=QUALITY, optimize=True, progressive=True)
    with open(dst, 'rb') as f:
        return base64.b64encode(f.read()).decode('ascii'), os.path.getsize(dst)


def read(p):
    with open(p, 'r', encoding='utf-8') as f:
        return f.read()


body = read(os.path.join(SRC, 'spec-body.html'))
css = read(os.path.join(SRC, 'spec.css'))

total = 0
for key, spec in IMAGES.items():
    path, crop_h, width = spec[0], spec[1], spec[2]
    box = spec[3] if len(spec) > 3 else None
    if key in BOXES:
        box = tuple(BOXES[key])
    b64, size = prepare(key, path, crop_h, width, box)
    ph = '{{IMG:%s}}' % key
    assert ph in body, '模板里没有用到 %s' % key
    body = body.replace(ph, 'data:image/jpeg;base64,' + b64)
    total += size
    print('  %-22s %6.1f KB' % (key, size / 1024))

assert '{{IMG:' not in body, '仍有未替换的图片占位符'

html = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>拾光 · 界面改版设计方案（DAWN v2）</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Newsreader:ital,opsz,wght@0,6..72,400;1,6..72,400&family=JetBrains+Mono:wght@400;500&display=swap">
<style>
{css}
</style>
</head>
<body>
<!--
  拾光 · 数字花园 界面改版设计方案
  由 design-preview/build-spec.py 生成，请勿直接编辑本文件。
  正文源：src/spec-body.html ；样式源：src/spec.css ；插图源：src/shots/
-->
{body}
</body>
</html>
"""

with open(OUT, 'w', encoding='utf-8') as f:
    f.write(html)

print('生成 %s（%.1f KB，插图合计 %.1f KB）' % (OUT, len(html.encode('utf-8')) / 1024, total / 1024))
