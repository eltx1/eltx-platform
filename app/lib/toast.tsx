'use client';

import { createContext, useContext, useState } from 'react';

type ToastVariant = 'info' | 'success' | 'error';

export interface Toast {
  id: number;
  message: string;
  variant: ToastVariant;
}

type ToastInput = string | { message: string; variant?: ToastVariant };

const ToastContext = createContext<(msg: ToastInput) => void>(() => {});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const remove = (id: number) => setToasts((t) => t.filter((x) => x.id !== id));
  const show = (input: ToastInput) => {
    const message = typeof input === 'string' ? input : input.message;
    const variant = typeof input === 'string' ? 'info' : input.variant ?? 'info';
    const id = Date.now();
    setToasts((t) => [...t, { id, message, variant }]);
    setTimeout(() => remove(id), 3000);
  };

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="fixed top-4 right-4 space-y-2 z-50">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`px-4 py-2 rounded shadow hover:opacity-80 flex items-center gap-2 transition ${
              t.variant === 'success'
                ? 'bg-green-600 text-white'
                : t.variant === 'error'
                ? 'bg-red-600 text-white'
                : 'bg-black text-white'
            }`}
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
