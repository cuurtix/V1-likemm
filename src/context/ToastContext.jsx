/* =============================================================================
   LIKEMM — messages ephemeres
   Un toast n'apparait QUE lorsqu'une operation reelle a reussi ou echoue
   (§26 : « Ne jamais afficher une fausse reussite »).
   ========================================================================== */

import { createContext, useContext, useState, useCallback, useMemo } from "react";
import { Toast } from "../components/atoms.jsx";

const ToastContext = createContext({ showToast: () => {} });

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);

  const showToast = useCallback((message, type = "success") => {
    if (!message) return;
    setToast({ message, type, id: Date.now() });
  }, []);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast && (
        <Toast
          key={toast.id}
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
