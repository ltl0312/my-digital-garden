"""从线上花园抓取一份「真实数据快照」，供改版原型离线使用。

只做只读 GET，不修改任何线上数据，也不改动本地项目代码。
输出到 design-preview/src/data/*.json
"""
import json, os, re, urllib.parse, urllib.request

TOKEN = open(r'C:/Users/ZhuanZ/AppData/Local/Temp/garden-design/token.txt').read().strip()
BASE = 'https://liutianle.cn'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')
os.makedirs(OUT, exist_ok=True)
UA = {'Cookie': 'garden_token=' + TOKEN, 'User-Agent': 'garden-design-snapshot/1.0'}


def get(path, timeout=60):
    req = urllib.request.Request(BASE + path, headers=UA)
    return json.load(urllib.request.urlopen(req, timeout=timeout))


def enc(slug):
    return '/'.join(urllib.parse.quote(p) for p in slug.split('/'))


def dump(name, obj):
    p = os.path.join(OUT, name)
    with open(p, 'w', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False, separators=(',', ':'))
    print('  ->', name, len(json.dumps(obj, ensure_ascii=False)), 'chars')


def dump_raw(name, text):
    """写出未经 JSON 转义的原始片段（如 HTML 片段）。"""
    p = os.path.join(OUT, name)
    with open(p, 'w', encoding='utf-8') as f:
        f.write(text)
    print('  ->', name, len(text), 'chars')


# ---------------------------------------------------------------- 笔记列表
print('抓取笔记列表…')
notes_raw = get('/api/notes?pageSize=48')['notes']
notes = [{
    'slug': n['slug'], 'title': n['title'], 'maturity': n['maturity'],
    'readingTime': n['readingTime'], 'updatedAt': n['updatedAt'],
    'summary': n['summary'], 'tags': [t['tag']['name'] for t in n['tags']],
} for n in notes_raw]
dump('notes.json', notes)

# ---------------------------------------------------------------- 标签
print('抓取标签…')
dump('tags.json', get('/api/tags'))

# ---------------------------------------------------------------- 目录树
print('抓取目录树…')
raw_tree = get('/api/vault/tree', 90)['tree']


def prune(nodes, depth):
    """保留完整层级：vault 里最深有 6 段目录，截断会让「在结构树中定位」找不到笔记。"""
    out = []
    for n in nodes:
        if n['type'] == 'dir':
            kids = prune(n.get('children') or [], depth + 1)
            out.append({
                'name': n['name'], 'type': 'dir',
                'count': count_files(n.get('children') or []),
                'children': kids if depth < 8 else [],
            })
        else:
            out.append({'name': n['name'], 'type': 'file', 'slug': n.get('slug')})
    return out


def count_files(nodes):
    c = 0
    for n in nodes:
        if n['type'] == 'file':
            c += 1
        else:
            c += count_files(n.get('children') or [])
    return c


dump('tree.json', prune(raw_tree, 0))

# ---------------------------------------------------------------- 图谱（全量）
print('抓取图谱…')
g = get('/api/notes/graph', 120)
dump('graph.json', {
    'nodes': [{'id': n['id'], 'title': n['title'], 'slug': n['slug'], 'maturity': n['maturity']} for n in g['nodes']],
    'edges': g['edges'],
})

# ---------------------------------------------------------------- 详情样张
CANDIDATES = [
    'KnowledgeBase/03_Knowledge/MOC - 知识库总览',
    'KnowledgeBase/03_Knowledge/前端/TypeScript/MOC - TypeScript',
    'KnowledgeBase/03_Knowledge/计算机基础/操作系统/MOC - 操作系统',
    'KnowledgeBase/03_Knowledge/前端/Nuxt.js/框架概述与SSR原理',
]
best = None
for slug in CANDIDATES:
    try:
        n = get('/api/notes/' + enc(slug))
    except Exception as e:                                   # noqa: BLE001
        print('  跳过', slug, e)
        continue
    h = n['htmlContent']
    # 扣分项：正文里存着字面量 "\n"（应为换行）的笔记不适合做排版样张
    literal_nl = h.count('\\n')
    score = (h.count('<h2') * 2 + h.count('<h3') + h.count('<table') * 2 + h.count('<pre') * 3
             + len(n['incoming']) * 3 - literal_nl * 20)
    print('  候选 %-58s h2=%d h3=%d table=%d pre=%d back=%d 字面\\n=%d score=%d'
          % (slug.split("/")[-1], h.count('<h2'), h.count('<h3'), h.count('<table'),
             h.count('<pre'), len(n['incoming']), literal_nl, score))
    if best is None or score > best[0]:
        best = (score, slug, n)

score, slug, n = best
print('选用样张：', slug, '（score %d）' % score)

body = n['htmlContent']
body = re.sub(r'^\s*<h1[^>]*>.*?</h1>\s*', '', body, count=1, flags=re.S)      # 标题另行渲染
body = re.sub(r'\sclass="shiki[^"]*"', '', body)                                # 去高亮主题类
body = re.sub(r'\sstyle="[^"]*"', '', body)                                     # 去内联样式，交给设计系统
body = re.sub(r'\stabindex="\d+"', '', body)
dump_raw('note-body.html', body)
dump('note-detail.json', {
    'slug': n['slug'], 'title': n['title'], 'maturity': n['maturity'],
    'readingTime': n['readingTime'], 'updatedAt': n['updatedAt'],
    'tags': [t['tag']['name'] for t in n['tags']],
    'aliases': (n.get('metadata') or {}).get('aliases') or [],
    'backlinks': [{'slug': i['source']['slug'], 'title': i['source']['title'],
                   'summary': i['source']['summary']} for i in n['incoming']],
})
print('完成，输出目录：', OUT)
