<script setup lang="ts">
// 只需要组件的属性和事件类型，不需要运行逻辑
defineProps<{ title: string; count: number; tone?: "info" | "warn" }>();
defineEmits<{ select: [id: number]; close: [] }>();
</script>

<template>
  <button type="button">{{ title }} {{ count }}</button>
</template>
