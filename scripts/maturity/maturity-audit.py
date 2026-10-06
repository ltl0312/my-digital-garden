#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
maturity-audit.py —— 「拾光」数字花园 · 成熟度重评与批量修正工具

用法：
    python maturity-audit.py                     # dry-run：只打印报表，不改任何文件
    python maturity-audit.py --json out.json     # 另存逐篇判定（JSON）
    python maturity-audit.py --list EVERGREEN    # 列出某一档的清单
    python maturity-audit.py --apply             # 把判定写入 frontmatter（先自动备份）
    python maturity-audit.py --apply --only GROWING
    python maturity-audit.py --stale 30          # 列出「复核后又被修改超过 N 天」的待复核笔记

判定标准（详见设计方案文档第 10 章）：
    maturity 回答的是读者的问题——「这篇我能依赖到什么程度」；
    status/* 标签回答的是作者的问题——「我写到哪了」。两者是不同维度，不可互替。

    判定全部基于**可观测的模板契约完成度**（这套笔记模板有固定五区块 + 关联上下文）：

      适用范围  排除 05_Templates / 06_Assets / .claude / skills / CLAUDE.md / *.excalidraw.md
      索引/MOC  文件名 MOC-* 或含 type/MOC → 不参与成熟度，按收录条数单列
      常青      五块齐全 + 关联≥4维无空缺 + 有跨学科溯源
                + 内容充实(≥800字 且 代码/表格≥2) + 被引用≥2 + 存在≥14天
      成长      结构已成形(≥3区块) + 关联填充率≥50% + 正文≥400字
      幼苗      其余（并给出具体缺什么）

安全机制：
    · 默认 dry-run，绝不写文件
    · --apply 前把原文件复制到 .maturity-backup/<时间戳>/
    · 只在 frontmatter 增改 `maturity:` 一行，其余内容零改动
    · 幂等：判定值与现值相同的不写
    · 人工优先：frontmatter 已显式写 maturity 的，跳过并提示（用 --force 覆盖）
"""
import os, re, io, json, shutil, argparse, datetime, statistics
from collections import Counter, defaultdict

VAULT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'content', 'vault')
VAULT = os.path.normpath(VAULT)
TODAY = datetime.datetime.now()

BLOCK_KEYS = ['知识体系定位', '概述', '设计初衷', '实现', '关联上下文']
NON_NOTE = [
    (r'(^|/)\.maturity-backup/', '备份文件'),
    (r'^KnowledgeBase/05_Templates/', '模板骨架'),
    (r'^KnowledgeBase/06_Assets/', '附件目录'),
    (r'^KnowledgeBase/(CLAUDE\.md|\.claude/)', '工具/规范文档'),
    (r'^KnowledgeBase/skills/', '技能文档'),
    (r'\.excalidraw\.md$', '绘图文件'),
]
TH = {
    'ev_chars': 800, 'ev_ev': 2, 'ev_ctx_min': 4, 'ev_indeg': 2, 'ev_days': 14,
    'gr_chars': 400, 'gr_ctx_fill': 0.5, 'gr_blocks': 3,
}
MOCK_TODAY = os.environ.get('AUDIT_TODAY')  # 测试钩子：YYYY-MM-DD
if MOCK_TODAY:
    TODAY = datetime.datetime.strptime(MOCK_TODAY, '%Y-%m-%d')


# ---------------------------------------------------------------- 指标采集
def parse_note(path):
    s = io.open(path, encoding='utf-8', errors='replace').read()
    fm, body = '', s
    if s.startswith('---'):
        end = s.find('\n---', 3)
        if end > 0:
            fm, body = s[3:end], s[end + 4:]
    tags = []
    mt = re.search(r'^tags\s*:\s*(.*)$', fm, re.M)
    if mt:
        inline = mt.group(1).strip()
        if inline and inline not in ('|', '>'):
            # 行内数组写法 tags: [a, b] —— 本库 34 篇 type/MOC 全是这种写法，
            # 旧版只解析列表式导致 audit 与 TS 对账时暴露（XD 系列误判）
            tags = [x.strip().strip('"\'') for x in inline.strip('[]').split(',') if x.strip()]
        else:
            seg = fm[mt.end():]
            tags = [m.strip().strip('"\'') for m in re.findall(r'^\s*-\s+(.+?)\s*$', seg, re.M)]
    fm_m = re.search(r'^maturity\s*:\s*(\S+)', fm, re.M)
    fm_lock = re.search(r'^maturity-locked\s*:\s*true', fm, re.M) is not None
    created = re.search(r'^created\s*:\s*(.+?)\s*$', fm, re.M)

    def section(key):
        m = re.search(r'^##\s*[^\n]*' + re.escape(key) + r'[^\n]*$', body, re.M)
        if not m:
            return None
        rest = body[m.end():]
        nxt = re.search(r'^##\s', rest, re.M)
        return rest[:nxt.start()] if nxt else rest

    blocks = {b: section(b) for b in BLOCK_KEYS}
    ctx = blocks.get('关联上下文') or ''
    rows = [l for l in ctx.split('\n') if l.strip().startswith('- **')]
    filled = [l for l in rows if '待补充' not in l]
    strip_code = re.sub(r'```[\s\S]*?```', '', body)
    plain = re.sub(r'`[^`]*`', '', strip_code)

    dt = None
    if created:
        for f in ('%Y-%m-%d %H:%M', '%Y-%m-%dT%H:%M:%S', '%Y-%m-%d'):
            try:
                dt = datetime.datetime.strptime(created.group(1).strip().strip('"\''), f)
                break
            except Exception:
                pass
    return {
        'tags': tags,
        'fm_maturity': fm_m.group(1).upper() if fm_m else None,
        'locked': fm_lock,
        'name': os.path.basename(path)[:-3],
        'blocks': {b: v is not None for b, v in blocks.items()},
        'blocks_n': sum(1 for v in blocks.values() if v is not None),
        'ctx_rows': len(rows),
        'ctx_filled': len(filled),
        'trace': section('跨学科溯源') is not None,
        'chars': len(re.sub(r'\s', '', plain)),
        'code': len(re.findall(r'```', body)) // 2,
        'tables': len(re.findall(r'^\|.*\|$', body, re.M)),
        'age_days': (TODAY - dt).days if dt else None,
    }


def build_index(vault):
    """引用图：正文 obsidian://open?file= 与 [[wikilink]] 都算，按 basename 唯一匹配。"""
    by_base = defaultdict(list)
    raw = {}
    for r, d, fs in os.walk(vault):
        d[:] = [x for x in d if x != '.maturity-backup' and not x.startswith('.')]
        for f in fs:
            if not f.endswith('.md'):
                continue
            p = os.path.join(r, f)
            rel = os.path.relpath(p, vault).replace('\\', '/')
            raw[rel] = io.open(p, encoding='utf-8', errors='replace').read()
            by_base[f[:-3]].append(rel)

    def resolve(t):
        t = re.sub(r'\.md$', '', str(t).strip().replace('\\', '/'))
        b = t.rsplit('/', 1)[-1]
        hit = by_base.get(b)
        return hit[0] if hit and len(hit) == 1 else None

    indeg = Counter()
    for rel, s in raw.items():
        targets = set(re.findall(r'obsidian://open\?file=([^"&\n]+)', s) +
                      re.findall(r'\[\[([^\]|]+)(?:\|[^\]]*)?\]\]', s))
        for t in targets:
            tgt = resolve(t)
            if tgt and tgt != rel:
                indeg[tgt] += 1
    return indeg


# ---------------------------------------------------------------- 判定
def scope(rel):
    for pat, why in NON_NOTE:
        if re.search(pat, rel):
            return (False, why)
    return (True, '')


def classify(rel, n, indeg):
    ok, why_ex = scope(rel)
    if not ok:
        return ('EXCLUDED', why_ex)
    is_moc = bool(re.match(r'^MOC\s*-\s*', n['name'])) or 'MOC' in [t.split('/', 1)[-1] for t in n['tags']]
    if is_moc:
        rows = n['tables']
        if rows >= 15: return ('INDEXED', '索引完整 · 收录 %d 条' % rows)
        if rows >= 4:  return ('INDEXED', '索引已建 · 收录 %d 条，仍可补充' % rows)
        return ('INDEXED', '索引仅 %d 条，尚未成形' % rows)

    chars, deg = n['chars'], indeg.get(rel, 0)
    ctx_rows, ctx_filled = n['ctx_rows'], n['ctx_filled']
    fill = (ctx_filled / ctx_rows) if ctx_rows else 0.0
    full5, trace = n['blocks_n'] == 5, n['trace']
    ev = n['code'] + n['tables']
    days = n['age_days'] if n['age_days'] is not None else 10 ** 6

    e = {
        '五块齐全': full5,
        '有跨学科溯源': trace,
        '关联≥4维且无空缺': ctx_rows >= TH['ev_ctx_min'] and ctx_filled == ctx_rows,
        '内容充实': chars >= TH['ev_chars'] and ev >= TH['ev_ev'],
        '被引用≥2': deg >= TH['ev_indeg'],
        '经过时间检验≥14天': days >= TH['ev_days'],
    }
    if all(e.values()):
        return ('EVERGREEN', '结构自洽 + 关联完整 + 有溯源 + 被引用')
    missing = [k for k, v in e.items() if not v]
    if len(missing) == 1:
        return ('GROWING', '仅差「%s」即可升常青' % missing[0])

    g = {
        '有关联区块': ctx_rows > 0,
        '关联填充≥50%': fill >= TH['gr_ctx_fill'],
        '结构已成形': full5 or n['blocks_n'] >= TH['gr_blocks'],
        '内容可读': chars >= TH['gr_chars'],
    }
    hard = sum(1 for k in ('有关联区块', '结构已成形', '内容可读') if g[k])
    if hard == 3 and g['关联填充≥50%']:
        return ('GROWING', '结构/关联已成，待补：' + '、'.join(missing[:2]))
    if hard == 3:
        return ('GROWING', '结构已成，关联上下文空缺（%d/%d）' % (ctx_filled, ctx_rows))
    if hard == 2 and chars >= 800 and ev >= 2:
        return ('GROWING', '内容充实但骨架不全（%d/5 区块）' % n['blocks_n'])

    why = []
    if not full5:
        miss = [b for b, v in n['blocks'].items() if not v]
        why.append('缺 ' + '、'.join(miss[:2]))
    if ctx_rows == 0:
        why.append('无关联上下文')
    elif fill < 0.5:
        why.append('关联仅 %d/%d' % (ctx_filled, ctx_rows))
    if chars < TH['gr_chars']:
        why.append('正文 %d 字' % chars)
    return ('SEEDLING', '；'.join(why) or '未达结构门槛')


# ---------------------------------------------------------------- 主流程
def main():
    ap = argparse.ArgumentParser(description='maturity 重评与批量修正')
    ap.add_argument('--apply', action='store_true', help='写入 frontmatter（默认 dry-run）')
    ap.add_argument('--only', choices=['SEEDLING', 'GROWING', 'EVERGREEN'], help='apply 时只写某一档')
    ap.add_argument('--force', action='store_true', help='覆盖 frontmatter 中已显式写的 maturity')
    ap.add_argument('--json', metavar='FILE', help='逐篇判定另存 JSON')
    ap.add_argument('--list', choices=['SEEDLING', 'GROWING', 'EVERGREEN', 'INDEXED', 'EXCLUDED'])
    ap.add_argument('--stale', type=int, metavar='DAYS', help='列出 updated 距今超过 N 天的笔记（复核候选）')
    args = ap.parse_args()

    vault = VAULT
    if not os.path.isdir(vault):
        raise SystemExit('vault 目录不存在: %s' % vault)

    indeg = build_index(vault)  # build_index 内部同样跳过隐藏/备份目录
    results = {}
    for rel in sorted(indeg and [k for k in []] or []):
        pass
    # 重新遍历保证顺序稳定
    all_md = []
    for r, d, fs in os.walk(vault):
        d[:] = [x for x in d if x != '.maturity-backup' and not x.startswith('.')]
        for f in fs:
            if f.endswith('.md'):
                all_md.append(os.path.relpath(os.path.join(r, f), vault).replace('\\', '/'))
    for rel in sorted(all_md):
        n = parse_note(os.path.join(vault, rel))
        m, why = classify(rel, n, indeg)
        results[rel] = {'maturity': m, 'why': why, 'manual': n['fm_maturity'], 'metrics': n}

    # ---------------- 报表 ----------------
    c = Counter(v['maturity'] for v in results.values())
    tot = len(results)
    print()
    print('════════ 成熟度重评报表（%d 篇 · %s） ════════' % (tot, 'APPLY' if args.apply else 'DRY-RUN'))
    labels = {'EVERGREEN': '常青', 'GROWING': '成长', 'SEEDLING': '幼苗',
              'INDEXED': '索引/MOC', 'EXCLUDED': '排除'}
    for k in ('EVERGREEN', 'GROWING', 'SEEDLING', 'INDEXED', 'EXCLUDED'):
        v = c[k]
        print('  %-9s %-8s %4d 篇  %5.1f%%  %s' % (k, labels[k], v, v * 100.0 / tot, '█' * int(v * 56.0 / tot)))
    print()
    in_scope = {k: v for k, v in results.items() if v['maturity'] in ('EVERGREEN', 'GROWING', 'SEEDLING')}
    for k in ('EVERGREEN', 'GROWING', 'SEEDLING'):
        xs = [v['metrics'] for v in in_scope.values() if v['maturity'] == k]
        if not xs:
            continue
        med = lambda f: statistics.median([x[f] for x in xs])
        print('  %-9s n=%-4d 字数中位=%-6.0f 区块=%.1f/5 关联=%.1f/%.1f'
              % (k, len(xs), med('chars'), med('blocks_n'),
                 statistics.median([x['ctx_filled'] for x in xs]),
                 statistics.median([x['ctx_rows'] for x in xs])))
    manual_n = sum(1 for v in results.values() if v['manual'])
    if manual_n:
        print()
        locked_n = sum(1 for v in results.values() if v['metrics'].get('locked'))
        print('  ★ %d 篇 frontmatter 已显式写 maturity（人工值优先，--force 可覆盖）' % manual_n)
        if locked_n:
            print('  ★ 其中 %d 篇带 maturity-locked: true（人工固定，--force 也不覆盖）' % locked_n)

    if args.list:
        print()
        print('── %s 清单 ──' % args.list)
        for rel, v in results.items():
            if v['maturity'] == args.list:
                print('  %-70s %s' % (rel.replace('KnowledgeBase/', ''), v['why']))
    if args.stale is not None:
        print()
        print('── 复核候选（updated 距今 > %d 天） ──' % args.stale)
        n = 0
        for rel, v in results.items():
            if v['maturity'] != 'EXCLUDED' and v['metrics']['age_days'] is not None:
                pass
        # updated 时间单独扫（parse_note 只取了 created）
        import re as _re
        for rel in sorted(results):
            p = os.path.join(vault, rel)
            s = io.open(p, encoding='utf-8', errors='replace').read()
            mu = _re.search(r'^updated\s*:\s*"?(.+?)"?\s*$', s, _re.M)
            if not mu:
                continue
            for f in ('%Y-%m-%d %H:%M', '%Y-%m-%dT%H:%M:%S', '%Y-%m-%d'):
                try:
                    d = datetime.datetime.strptime(mu.group(1).strip(), f)
                    break
                except Exception:
                    d = None
            if d and (TODAY - d).days > args.stale:
                n += 1
                if n <= 15:
                    print('  %4d 天  %s' % ((TODAY - d).days, rel.replace('KnowledgeBase/', '')))
        print('  …… 共 %d 篇' % n if n > 15 else '  共 %d 篇' % n)

    if args.json:
        io.open(args.json, 'w', encoding='utf-8').write(
            json.dumps(results, ensure_ascii=False, indent=1, default=str))
        print('\n逐篇判定已写入 %s' % args.json)

    # ---------------- apply ----------------
    if args.apply:
        ts = datetime.datetime.now().strftime('%Y%m%d-%H%M%S')
        backup = os.path.join(vault, '.maturity-backup', ts)
        os.makedirs(backup, exist_ok=True)
        written = skipped_same = skipped_manual = 0
        for rel, v in results.items():
            if v['maturity'] not in ('SEEDLING', 'GROWING', 'EVERGREEN'):
                continue
            if args.only and v['maturity'] != args.only:
                continue
            if v['metrics'].get('locked'):
                skipped_manual += 1
                continue
            if v['manual'] and not args.force:
                skipped_manual += 1
                continue
            p = os.path.join(vault, rel)
            s = io.open(p, encoding='utf-8').read()
            m = re.search(r'^maturity\s*:\s*(\S+)\s*$', s, re.M)
            if m:
                if m.group(1).upper() == v['maturity']:
                    skipped_same += 1
                    continue
                s2 = s[:m.start()] + 'maturity: ' + v['maturity'] + s[m.end():]
            else:
                ins = 'maturity: ' + v['maturity'] + '\n'
                m2 = re.search(r'^tags\s*:', s, re.M)
                anchor = m2.start() if m2 else (s.index('\n---', 3) if '\n---' in s else 0)
                s2 = s[:anchor] + ins + s[anchor:]
            shutil.copy2(p, os.path.join(backup, rel.replace('/', '__')))
            io.open(p, 'w', encoding='utf-8').write(s2)
            written += 1
        print()
        print('✅ 已写入 %d 篇（原值相同跳过 %d · 人工值跳过 %d）' % (written, skipped_same, skipped_manual))
        print('   备份目录: %s' % backup)
        print('   回滚: 把备份目录里的文件复制回去即可（文件名中的 __ 对应路径分隔符）')
    else:
        print()
        print('（dry-run：未改动任何文件。确认无误后加 --apply 执行批量修正）')


if __name__ == '__main__':
    main()
