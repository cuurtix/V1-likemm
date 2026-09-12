/* =============================================================================
   LIKEMM — theme clair / sombre
   Comportement repris a l'identique du prototype : le choix est memorise et
   applique sur <html> avant le premier rendu (script inline dans index.html).
   ========================================================================== */

import { createContext, useContext, useState, useLayoutEffect, useCallback, useMemo } from "react";

const ThemeContext = createContext({ theme: "light", setTheme: () => {} });

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    try {
      return localStorage.getItem("likemm_theme") || "light";
    } catch {
      return "light";
    }
  });

  useLayoutEffect(() => {
    const cl = document.documentElement.classList;
    if (theme === "dark") cl.add("lm-dark");
    else cl.remove("lm-dark");
    try {
      localStorage.setItem("likemm_theme", theme);
    } catch {
      /* stockage indisponible : le theme vaut pour la session en cours */
    }
  }, [theme]);

  const setTheme = useCallback((t) => setThemeState(t === "dark" ? "dark" : "light"), []);
  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
