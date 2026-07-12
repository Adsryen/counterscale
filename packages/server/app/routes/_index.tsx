import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { getUser, isAuthEnabled } from "~/lib/auth";
import { useLocale } from "~/i18n/LocaleContext";

export const meta: MetaFunction = () => {
    return [
        { title: "Counterscale" },
        {
            name: "description",
            content: "Self-hosted web analytics on Cloudflare",
        },
    ];
};

/** Public front page — no password. Console is gated at /login. */
export async function loader({ request, context }: LoaderFunctionArgs) {
    const env = context.cloudflare.env;
    const user = await getUser(request, env);
    const authEnabled = isAuthEnabled(env);

    return {
        user,
        authEnabled,
    };
}

export default function Home() {
    const { user, authEnabled } = useLoaderData<typeof loader>();
    const { t } = useLocale();
    const signedIn = !authEnabled || user?.authenticated;

    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-8 pb-12">
            <img
                src="/counterscale-logo.webp"
                alt="CounterScale Logo"
                className="w-56 sm:w-72"
            />

            <div className="text-center max-w-xl space-y-3 px-2">
                <h1 className="text-3xl font-bold tracking-tight text-foreground">
                    {t("home.title")}
                </h1>
                <p className="text-muted-foreground text-base leading-relaxed">
                    {t("home.subtitle")}
                </p>
            </div>

            <Card className="w-full max-w-md p-8 rounded-2xl shadow-sm space-y-4">
                <div className="text-sm text-muted-foreground space-y-2 text-left">
                    <p>1. {t("home.step1")}</p>
                    <p>2. {t("home.step2")}</p>
                    <p>3. {t("home.step3")}</p>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                    {signedIn ? (
                        <Button asChild className="w-full rounded-xl">
                            <a href="/console">{t("home.openConsole")}</a>
                        </Button>
                    ) : (
                        <Button asChild className="w-full rounded-xl">
                            <a href="/login">{t("home.gotoLogin")}</a>
                        </Button>
                    )}
                </div>

                <p className="text-xs text-muted-foreground text-center pt-1">
                    {t("home.note")}
                </p>
            </Card>
        </div>
    );
}
