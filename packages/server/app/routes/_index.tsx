import {
    ActionFunctionArgs,
    LoaderFunctionArgs,
    MetaFunction,
    Form,
    useActionData,
    useLoaderData,
    useNavigation,
    redirect,
} from "react-router";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { getUser, login, isAuthEnabled } from "~/lib/auth";
import { getMessages, resolveLocale, translate } from "~/i18n";
import { useLocale } from "~/i18n/LocaleContext";

export const meta: MetaFunction = () => {
    return [
        { title: "Counterscale: Web Analytics" },
        { name: "description", content: "Counterscale: Web Analytics" },
    ];
};

export async function loader({ request, context }: LoaderFunctionArgs) {
    const env = context.cloudflare.env;
    const user = await getUser(request, env);
    const authEnabled = isAuthEnabled(env);

    if (!authEnabled || user?.authenticated) {
        throw redirect("/console");
    }

    // Return auth status to conditionally render the login form
    return { user, authEnabled };
}

export async function action({ request, context }: ActionFunctionArgs) {
    const env = context.cloudflare.env;

    // If auth is disabled, this action shouldn't be called, but handle it gracefully
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

export default function Index() {
    const { user, authEnabled } = useLoaderData<typeof loader>();
    const actionData = useActionData<typeof action>();
    const navigation = useNavigation();
    const isSubmitting = ["submitting", "loading"].includes(navigation.state);
    const { t } = useLocale();

    const subtitle = !authEnabled
        ? t("login.subtitleNoAuth")
        : user?.authenticated
          ? t("login.subtitleAuthed")
          : t("login.subtitleGuest");

    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-8">
            <img
                src="/counterscale-logo.webp"
                alt="CounterScale Logo"
                className="w-72"
            />
            <Card className="w-full max-w-md p-8 text-center rounded-2xl shadow-sm">
                <div className="mb-6">
                    <h1 className="text-2xl font-bold text-foreground mb-2">
                        {t("login.title")}
                    </h1>
                    <p className="text-muted-foreground">{subtitle}</p>
                </div>

                {/* When auth is disabled or user is already authenticated, show dashboard button */}
                {!authEnabled || user?.authenticated ? (
                    <Button asChild className="w-full rounded-xl">
                        <a href="/console">{t("login.goDashboard")}</a>
                    </Button>
                ) : (
                    /* When auth is enabled and user is not authenticated, show login form */
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
                            {isSubmitting
                                ? t("login.signingIn")
                                : t("login.signIn")}
                        </Button>
                    </Form>
                )}
            </Card>
        </div>
    );
}
