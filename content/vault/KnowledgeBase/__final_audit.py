# -*- coding: utf-8 -*-
import re, os, json
from collections import defaultdict, Counter

DATA_FILE = r"D:\Claude\ClaudeConfig\projects\E--KnowledgeBase\02d7e987-f2ac-4107-a552-7e16051c91a4\tool-results\call_00_9K0JBemsrj5iQMEJHWL14984.txt"

links_raw = defaultdict(set)
all_files = set()

with open(DATA_FILE, "r", encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if not line:
            continue
        m = re.match(r"^(.+\.md):\d+:(.+)$", line)
        if not m:
            continue
        filepath = m.group(1).replace("\\", "/")
        raw = m.group(2)
        match2 = re.match(r"\[\[(.+?)\]\]", raw)
        if not match2:
            continue
        target = match2.group(1).split("#")[0].split("|")[0].strip()
        links_raw[filepath].add(target)
        all_files.add(filepath)

def note_name(path):
    return path.rsplit("/", 1)[-1].replace(".md", "")

name_to_paths = defaultdict(list)
for p in all_files:
    name_to_paths[note_name(p)].append(p)

def resolve(target, src_path):
    if target not in name_to_paths:
        return None
    candidates = name_to_paths[target]
    if len(candidates) == 1:
        return candidates[0]
    src_dir = os.path.dirname(src_path)
    for c in candidates:
        if os.path.dirname(c) == src_dir:
            return c
    for c in candidates:
        if "03_Knowledge" in c:
            return c
    return candidates[0]

graph = defaultdict(list)
for src in sorted(all_files):
    for tgt_name in links_raw[src]:
        r = resolve(tgt_name, src)
        if r:
            graph[src].append(r)

in_deg = Counter()
for src in graph:
    for tgt in graph[src]:
        in_deg[tgt] += 1
    in_deg[src] += 0

def is_moc(path):
    return note_name(path).startswith("MOC - ")

moc_files = set(p for p in all_files if is_moc(p))

def find_leaf_moc(leaf_path):
    d = os.path.dirname(leaf_path).replace("\\", "/")
    for m in moc_files:
        md = os.path.dirname(m).replace("\\", "/")
        if md == d:
            return m
    parent = os.path.dirname(d).replace("\\", "/") if "/" in d else ""
    if parent:
        for m in moc_files:
            md = os.path.dirname(m).replace("\\", "/")
            if md == parent:
                return m
    grandparent = os.path.dirname(parent).replace("\\", "/") if parent and "/" in parent else ""
    if grandparent:
        for m in moc_files:
            md = os.path.dirname(m).replace("\\", "/")
            if md == grandparent:
                return m
    return None

leaf_to_moc = {}
for p in all_files:
    if not is_moc(p):
        leaf_to_moc[p] = find_leaf_moc(p)

bidir = []
sibling_edges = []
cross_moc_edges = []
moc_to_child = 0
child_to_moc = 0

for src in sorted(graph):
    src_is_moc = is_moc(src)
    src_moc = leaf_to_moc.get(src)
    for tgt in sorted(graph[src]):
        tgt_is_moc = is_moc(tgt)
        tgt_moc = leaf_to_moc.get(tgt)

        if src_is_moc and not tgt_is_moc:
            moc_to_child += 1
        elif not src_is_moc and tgt_is_moc:
            child_to_moc += 1
        elif not src_is_moc and not tgt_is_moc:
            if src_moc and tgt_moc and src_moc == tgt_moc:
                sibling_edges.append((note_name(src), note_name(tgt), note_name(src_moc)))
            else:
                cross_moc_edges.append((note_name(src), note_name(tgt)))

    for tgt in graph[src]:
        if src < tgt and tgt in graph and src in graph[tgt]:
            bidir.append((note_name(src), note_name(tgt)))

total_edges = sum(len(v) for v in graph.values())

# Leaf outdegree stats
leaf_outdegree = Counter()
leaf_out_to_leaf = Counter()
leaf_out_to_moc = Counter()
for src in graph:
    if not is_moc(src):
        leaf_outdegree[src] = len(graph[src])
        for tgt in graph[src]:
            if is_moc(tgt):
                leaf_out_to_moc[src] += 1
            else:
                leaf_out_to_leaf[src] += 1

multi_out_leaves = [(n, c) for n, c in leaf_out_to_leaf.items() if c > 0]

print("=" * 60)
print("FINAL AUDIT: After converting leaf links to obsidian:// protocol")
print("=" * 60)
print(f"Total notes with wikilinks: {len(graph)}")
print(f"Total wikilink edges:       {total_edges}")
print(f"Bidirectional pairs:        {len(bidir)}")
print(f"MOC -> child:               {moc_to_child}")
print(f"child -> MOC:               {child_to_moc}")
print(f"Sibling (same leaf MOC):    {len(sibling_edges)}")
print(f"Cross-MOC bridge:           {len(cross_moc_edges)}")
print(f"Leaves with >0 leaf out:    {len(multi_out_leaves)}")
print()
print("PROGRESSION:")
print(f"  Original:  961 wikilink edges, 247 sibling, 284 bidir")
print(f"  Round 1:   872 wikilink edges, 158 sibling, 246 bidir (-89)")
print(f"  Round 2:   863 wikilink edges, 149 sibling, 241 bidir (-9)")
print(f"  Final:     {total_edges} wikilink edges, {len(sibling_edges)} sibling, {len(bidir)} bidir")

if multi_out_leaves:
    print(f"\nLeaves still with wikilinks to other leaves (should be near 0):")
    for n, c in sorted(multi_out_leaves, key=lambda x: -x[1]):
        short = n.replace("03_Knowledge/", "")
        print(f"  {c} leaf-out  {short}")
