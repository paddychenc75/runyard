import { useState } from "react";

export default function App() {
  const [count, setCount] = useState(0);
  return (
    <main>
      <h1>React 19 + Vite</h1>
      <p>Edit src/App.tsx and save: the page updates without a reload.</p>
      <button type="button" onClick={() => setCount((value) => value + 1)}>
        Clicked {count} times
      </button>
    </main>
  );
}
