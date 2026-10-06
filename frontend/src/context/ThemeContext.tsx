import { createContext, useContext, useState, useEffect } from "react";

export type Theme = "default" | "dark" | "neon" | "protanopia" | "deuteranopia" | "tritanopia" | "high-contrast";

type ThemeContextType = { 
    theme: Theme; setTheme: (theme: Theme) => void;
};

const ThemeContext = createContext< ThemeContextType | undefined >(undefined);

export function ThemeProvider({ children, }: { children: React.ReactNode; }) {
    const [theme, setTheme] = useState<Theme>(() => { return (localStorage.getItem("theme") as Theme) ?? "dark"; });

    useEffect(() => {
        document.documentElement.dataset.theme = theme;
        localStorage.setItem("theme", theme);
    }, [theme]);

    return (
        <ThemeContext.Provider value={{ theme, setTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    const context = useContext(ThemeContext);

    if (!context) {
        throw new Error(
            "useTheme must be used inside a ThemeProvider"
        );
    }

    return context;
}