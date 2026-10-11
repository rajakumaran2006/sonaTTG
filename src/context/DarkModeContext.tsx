import { createContext, useContext, useEffect, ReactNode } from "react";

interface DarkModeContextType {
  isDark: boolean;
  toggleDark: () => void;
  toggleDarkMode?: () => void;
}

const DarkModeContext = createContext<DarkModeContextType>({
  isDark: false,
  toggleDark: () => {},
  toggleDarkMode: () => {},
});

export const useDarkMode = () => useContext(DarkModeContext);

export const DarkModeProvider = ({ children }: { children: ReactNode }) => {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("dark");
    try {
      localStorage.removeItem("darkMode");
    } catch {
      // ignore
    }
  }, []);

  return (
    <DarkModeContext.Provider value={{ isDark: false, toggleDark: () => {}, toggleDarkMode: () => {} }}>
      {children}
    </DarkModeContext.Provider>
  );
};
