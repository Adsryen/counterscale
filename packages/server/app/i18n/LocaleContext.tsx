import {
    createContext,
    useCallback,
    useContext,
    useMemo,
    useState,
    type ReactNode,
} from "react";
import {
    DEFAULT_LOCALE,
    getMessages,
    localeCookieHeader,
    translate,
    type Locale,
    type Messages,
} from "./index";

type LocaleContextValue = {
    locale: Locale;
    messages: Messages;
    setLocale: (locale: Locale) => void;
    t: (key: string, vars?: Record<string, string | number>) => string;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({
    initialLocale = DEFAULT_LOCALE,
    children,
}: {
    initialLocale?: Locale;
    children: ReactNode;
}) {
    const [locale, setLocaleState] = useState<Locale>(initialLocale);
    const messages = useMemo(() => getMessages(locale), [locale]);

    const setLocale = useCallback((next: Locale) => {
        setLocaleState(next);
        if (typeof document !== "undefined") {
            document.cookie = localeCookieHeader(next);
            document.documentElement.lang = next === "zh" ? "zh-CN" : "en";
        }
    }, []);

    const t = useCallback(
        (key: string, vars?: Record<string, string | number>) =>
            translate(messages, key, vars),
        [messages],
    );

    const value = useMemo(
        () => ({ locale, messages, setLocale, t }),
        [locale, messages, setLocale, t],
    );

    return (
        <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
    );
}

export function useLocale(): LocaleContextValue {
    const ctx = useContext(LocaleContext);
    if (!ctx) {
        // Safe fallback for tests that forget the provider — English
        // so existing English assertions keep working.
        const messages = getMessages("en");
        return {
            locale: "en",
            messages,
            setLocale: () => undefined,
            t: (key, vars) => translate(messages, key, vars),
        };
    }
    return ctx;
}
