import { useEffect, useState, useCallback } from "react";

interface ToastMsg {
  id: number;
  text: string;
  type: "error" | "info" | "success";
}

let toastId = 0;
let addToastFn: ((msg: Omit<ToastMsg, "id">) => void) | null = null;

export function toast(text: string, type: ToastMsg["type"] = "info") {
  addToastFn?.({ text, type });
}

export function ToastContainer() {
  const [messages, setMessages] = useState<ToastMsg[]>([]);

  const add = useCallback((msg: Omit<ToastMsg, "id">) => {
    const id = ++toastId;
    setMessages((prev) => [...prev, { ...msg, id }]);
    setTimeout(() => setMessages((prev) => prev.filter((m) => m.id !== id)), 4000);
  }, []);

  useEffect(() => {
    addToastFn = add;
    return () => { addToastFn = null; };
  }, [add]);

  if (messages.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2" style={{ maxWidth: 360 }}>
      {messages.map((m) => {
        const bgMap: Record<string, string> = {
          error: "var(--destructive)",
          success: "var(--green)",
          info: "var(--blue)",
        };
        return (
          <div
            key={m.id}
            className="animate-slide-up rounded-2xl px-4 py-3 text-[15px] font-medium text-white shadow-xl"
            style={{
              background: bgMap[m.type] || "var(--blue)",
              backdropFilter: "blur(20px)",
              lineHeight: 1.4,
            }}
          >
            {m.text}
          </div>
        );
      })}
    </div>
  );
}
