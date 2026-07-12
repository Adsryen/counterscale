import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { redirect } from "react-router";

/**
 * Public front: analytics dashboard (PV/UV), same idea as upstream Counterscale.
 * Password only protects /console management.
 */
export async function loader({ request }: LoaderFunctionArgs) {
    const url = new URL(request.url);
    // Preserve any query (rare) when bouncing home → dashboard
    const qs = url.searchParams.toString();
    throw redirect(qs ? `/dashboard?${qs}` : "/dashboard");
}

export default function HomeRedirect() {
    return null;
}
