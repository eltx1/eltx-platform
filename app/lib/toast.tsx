'use client';

import { createContext, useContext, useState } from 'react';

export interface Toast { id: number; message: string; }

const ToastContext = createContext<(msg: string) => void>(() => {});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const remove = (id: number) => setToasts((t) => t.filter((x) => x.id !== id));
  const show = (message: string) => {
    const id = Date.now();
    setToasts((t) => [...t, { id, message }]);
    setTimeout(() => remove(id), 4000);
  };

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="fixed top-4 right-4 space-y-2 z-50">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="bg-black text-white px-4 py-2 rounded shadow hover:opacity-80 flex items-center gap-2"
          >
            <span>{t.message}</span>
            <button onClick={() => remove(t.id)} className="text-xl leading-none">&times;</button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
