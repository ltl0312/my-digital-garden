<script setup lang="ts">
// 列表行长按操作面板的宿主：挂在布局根部，任意页面触发后都能弹出。
// 内容与动作全部来自 useNoteActions（单一实现），此处只做状态搬运。
const { noteSheet, noteSheetItems, runNoteAction, closeNoteSheet } = useNoteActions()

const note = computed(() => noteSheet.value.note)
const subtitle = computed(() => (note.value ? `${note.value.slug}.md` : ''))
</script>

<template>
  <ActionSheet
    :open="noteSheet.open"
    :items="noteSheetItems"
    :title="note?.title || ''"
    :subtitle="subtitle"
    @update:open="(v: boolean) => { if (!v) closeNoteSheet() }"
    @select="runNoteAction"
  />
</template>
