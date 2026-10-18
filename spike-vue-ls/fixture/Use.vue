<script setup lang="ts">
import { computed, ref } from "vue";
import Child from "./components/Child.vue";

const n = ref(1);
const doubled = computed(() => n.value * 2);
const wrong: string = 1;
function onSelect(id: number) {
  n.value = id;
}
</script>

<template>
  <main>
    <Child title="a" :count="doubled" @select="onSelect" />
    <Child :count="'x'" />
    <p>{{ missingVar }}</p>
    <Child  />
  </main>
</template>
