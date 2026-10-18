<script setup lang="ts">
const props = defineProps<{ title: string; count: number; tone?: "info" | "warn" }>();
const emit = defineEmits<{ select: [id: number]; close: [] }>();
function pick() {
  emit("select", props.count);
}
</script>

<template>
  <button type="button" @click="pick">{{ title }} {{ count }}</button>
</template>
