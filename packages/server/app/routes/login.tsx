import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import {
    Form,
    useActionData,
    useLoaderData,
    useNavigation,
    redirect,
} from "react-router";
import type { ActionFunctionArgs } from "react-router";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { getUser, login, isAuthEnabled } from "~/lib/auth";
import { getMessages, resolveLocale, translate } from "~/i18n";
import { useLocale } from "~/i18n/LocaleContext";

export const meta: MetaFunction = () => {
    return [
        { title: "Counterscale: Login" },
        { name: "description", content: "Sign in to Counterscale console" },
    ];
};

export async function loader({ request, context }: LoaderFunctionArgs) {
    const env = context.cloudflare.env;
    const user = await getUser(request, env);
    const authEnabled = isAuthEnabled(env);

    // Already signed in → console
    if (!authEnabled || user?.authenticated) {
        throw redirect("/console");
    }

    return { authEnabled: true as const };
}

export async function action({ request, context }: ActionFunctionArgs) {
    const env = context.cloudflare.env;

    if (!isAuthEnabled(env)) {
        return redirect("/console");
    }

    const formData = await request.formData();
    const password = formData.get("password");

    const locale = resolveLocale({
        cookieHeader: request.headers?.get?.("Cookie") ?? null,
        acceptLanguage: request.headers?.get?.("Accept-Language") ?? null,
    });
    const messages = getMessages(locale);

    if (typeof password !== "string" || !password) {
        return { error: translate(messages, "login.passwordRequired") };
    }

    try {
        return await login(request, password, env);
    } catch {
        return { error: translate(messages, "login.invalidPassword") };
    }
}

export default function LoginPage() {
    const actionData = useActionData<typeof action>();
    const navigation = useNavigation();
    const isSubmitting = ["submitting", "loading"].includes(navigation.state);
    const { t } = useLocale();

    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-8">
            <img
                src="/counterscale-logo.webp"
                alt="CounterScale Logo"
                className="w-56 sm:w-72"
            />
            <Card className="w-full max-w-md p-8 text-center rounded-2xl shadow-sm">
                <div className="mb-6">
                    <h1 className="text-2xl font-bold text-foreground mb-2">
                        {t("login.consoleTitle")}
                    </h1>
                    <p className="text-muted-foreground">
                        {t("login.subtitleGuest")}
                    </p>
                </div>

                <Form method="post" className="space-y-4">
                    <div>
                        <label htmlFor="password" className="sr-only">
                            {t("login.passwordLabel")}
                        </label>
                        <input
                            type="password"
                            id="password"
                            name="password"
                            required
                            disabled={isSubmitting}
                            className="w-full px-3 py-2 border border-input rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-ring bg-background"
                            placeholder={t("login.passwordPlaceholder")}
                            autoComplete="current-password"
                        />
                    </div>
                    {actionData?.error && (
                        <div className="text-destructive text-sm">
                            {actionData.error}
                        </div>
                    )}
                    <Button
                        type="submit"
                        className="w-full rounded-xl"
                        disabled={isSubmitting}
                    >
                        {isSubmitting ? t("login.signingIn") : t("login.signIn")}
                    </Button>
                </Form>

                <p className="text-sm text-muted-foreground mt-6">
                    <a href="/" className="underline hover:text-foreground">
                        {t("login.backHome")}
                    </a>
                </p>
            </Card>
        </div>
    );
}
