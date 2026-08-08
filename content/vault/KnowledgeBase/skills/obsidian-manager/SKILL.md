---
name: obsidian-manager
description: Automatically triage, link, and tag raw notes in the Obsidian vault.
version: 1.0.0
---

# Instructions
When the user invokes `/triage` or asks to organize the vault, perform these sequential steps:
1. **Scan**: Read all markdown files inside the `_inbox/` folder.
2. **Process**: For each fleeting note, break down its core concepts into atomic cards inside the `cards/` directory.
3. **Link**: Search existing files in `cards/` and `atlas/` to find semantic relationships, then inject appropriate `[[Wikilinks]]`.
4. **Clean**: Archive or delete the successfully triaged notes from `_inbox/`.