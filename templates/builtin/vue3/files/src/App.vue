<script lang="ts">
import { defineComponent, ref } from "vue";

export default defineComponent({
  setup() {
    const count = ref(0);
    return { count };
  },
});
</script>

<template>
  <main>
    <h1>Vue 3 + Vite</h1>
    <p>Edit src/App.vue and save: the page updates without a reload.</p>
    <button type="button" @click="count++">Clicked {{ count }} times</button>
  </main>
</template>
