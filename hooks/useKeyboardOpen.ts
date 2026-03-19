import { useState, useEffect } from "react";

export function useKeyboardOpen() {
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const handler = () => setKeyboardOpen(viewport.height / window.innerHeight < 0.75);
    viewport.addEventListener("resize", handler);
    return () => viewport.removeEventListener("resize", handler);
  }, []);

  return keyboardOpen;
}
