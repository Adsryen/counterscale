import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from "react";
import {
    DEFAULT_THEME,
    applyThemeClass,
    resolveTheme,
    themeCookieHeader,
    type ResolvedTheme,
    type ThemePreference,
} from "./index";

type ThemeContextValue = {
    preference: ThemePreference;
    resolved: ResolvedTheme;
    setPreference: (theme: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({
    initialPreference = DEFAULT_THEME,
    children,
}: {
    initialPreference?: ThemePreference;
    children: ReactNode;
}) {
    const [preference, setPreferenceState] =
        useState<ThemePreference>(initialPreference);
    const [resolved, setResolved] = useState<ResolvedTheme>(() =>
        resolveTheme(initialPreference),
    );

    const setPreference = useCallback((next: ThemePreference) => {
        setPreferenceState(next);
        if (typeof document !== "undefined") {
            document.cookie = themeCookieHeader(next);
        }
        const r = resolveTheme(next);
        setResolved(r);
        applyThemeClass(r);
    }, []);

    // Sync on mount + when system preference changes
    useEffect(() => {
        const apply = () => {
            const r = resolveTheme(preference);
            setResolved(r);
            applyThemeClass(r);
        };
        apply();

        if (preference !== "system" || typeof window === "undefined") {
            return;
        }
        const mq = window.matchMedia("(prefers-color-scheme: dark)");
        const onChange = () => apply();
        mq.addEventListener("change", onChange);
        return () => mq.removeEventListener("change", onChange);
    }, [preference]);

    const value = useMemo(
        () => ({ preference, resolved, setPreference }),
        [preference, resolved, setPreference],
    );

    return (
        <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
    );
}

export function useTheme(): ThemeContextValue {
    const ctx = useContext(ThemeContext);
    if (!ctx) {
        return {
            preference: DEFAULT_THEME,
            resolved: "light",
            setPreference: () => undefined,
        };
    }
    return ctx;
}
