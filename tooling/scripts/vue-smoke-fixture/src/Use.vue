<script setup lang="ts">
import Child from "./Child.vue";

// Biome 看不到模板里的用法，显式用一次免得报“未使用的导入”
defineExpose({ Child });
</script>

<template>
  <main>
    <Child  />
  </main>
</template>
