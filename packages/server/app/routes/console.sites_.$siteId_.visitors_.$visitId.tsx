import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import { requireAuth } from "~/lib/auth";
import { getSite } from "~/lib/sites";
import { decryptIpAddress } from "~/lib/ip-crypto";
import { getVisitSummary, listVisitPageviews } from "~/lib/visit-details";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";

export const meta: MetaFunction<typeof loader> = ({ data }) => [
    { title: `Counterscale: ${data?.site?.name || data?.siteId || "Site"} visit trail` },
];

function ipConfig(env: Env) {
    if (!env.CF_IP_ENCRYPTION_KEY || !env.CF_IP_HMAC_KEY) return null;
    return {
        encryptionKey: env.CF_IP_ENCRYPTION_KEY,
        hmacKey: env.CF_IP_HMAC_KEY,
        keyVersion: Number(env.CF_IP_KEY_VERSION || "1") || 1,
    };
}

export async function loader({ request, context, params }: LoaderFunctionArgs) {
    await requireAuth(request, context.cloudflare.env);
    const siteId = (params.siteId || "").trim();
    const visitId = (params.visitId || "").trim();
    if (!siteId || !visitId) throw new Response("Not Found", { status: 404 });
    const db = context.cloudflare.env.DB;
    if (!db) throw new Response("D1 DB is not configured", { status: 501 });

    const site = await getSite(db, siteId);
    const visit = await getVisitSummary(db, siteId, visitId);
    if (!visit) throw new Response("Not Found", { status: 404 });
    const pageviews = await listVisitPageviews(db, siteId, visitId);

    let rawIp: string | null = null;
    const config = ipConfig(context.cloudflare.env);
    if (config && visit.ipCiphertext && visit.ipNonce && visit.ipKeyVersion) {
        try {
            rawIp = await decryptIpAddress(
                {
                    ciphertext: visit.ipCiphertext,
                    nonce: visit.ipNonce,
                    keyVersion: visit.ipKeyVersion,
                },
                { ...config, keyVersion: visit.ipKeyVersion },
            );
        } catch {
            rawIp = null;
        }
    }

    return { siteId, site, visit, rawIp, pageviews };
}

function formatTime(value: string) {
    return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

export default function VisitTrailPage() {
    const { siteId, site, visit, rawIp, pageviews } = useLoaderData<typeof loader>();
    const name = site?.name || siteId;

    return (
        <div className="space-y-6">
            <div>
                <p className="text-sm text-muted-foreground mb-1">
                    <a href={`/console/sites/${encodeURIComponent(siteId)}/visitors`} className="underline hover:text-foreground">{name} / 访客明细</a>
                </p>
                <h1 className="text-2xl font-bold tracking-tight">访问轨迹</h1>
                <p className="text-muted-foreground mt-1"><code className="text-xs bg-muted px-1 rounded">{visit.visitId}</code></p>
            </div>

            <Card className="rounded-2xl shadow-sm">
                <CardHeader>
                    <CardTitle className="text-base">访问摘要</CardTitle>
                    <CardDescription>{formatTime(visit.firstSeenAt)} - {formatTime(visit.lastSeenAt)}</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-2 text-sm">
                    <div><span className="text-muted-foreground">IP：</span><span className="font-mono">{rawIp ?? (visit.ipHmac ? "密钥不可用" : "未记录")}</span></div>
                    <div><span className="text-muted-foreground">行政区：</span>{[visit.country, visit.region, visit.city].filter(Boolean).join(" / ") || "—"}</div>
                    <div><span className="text-muted-foreground">入口页：</span>{visit.entryPath || "—"}</div>
                    <div><span className="text-muted-foreground">来源：</span>{visit.entryReferrer || "—"}</div>
                </CardContent>
            </Card>

            <Card className="rounded-2xl shadow-sm">
                <CardHeader>
                    <CardTitle className="text-base">页面轨迹</CardTitle>
                    <CardDescription>按时间升序展示，同一 tab_id 可用于后续分组。</CardDescription>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                    <table className="w-full text-sm text-left min-w-[720px]">
                        <thead>
                            <tr className="border-b text-muted-foreground">
                                <th className="py-2 pr-3 font-medium">时间</th>
                                <th className="py-2 px-3 font-medium">Tab</th>
                                <th className="py-2 px-3 font-medium">页面</th>
                                <th className="py-2 pl-3 font-medium">来源</th>
                            </tr>
                        </thead>
                        <tbody>
                            {pageviews.map((pv) => (
                                <tr key={pv.pageviewId} className="border-b last:border-0">
                                    <td className="py-3 pr-3 whitespace-nowrap">{formatTime(pv.occurredAt)}</td>
                                    <td className="py-3 px-3"><code className="text-xs bg-muted px-1 rounded">{pv.tabId || "—"}</code></td>
                                    <td className="py-3 px-3 break-all">{pv.path || pv.host || "—"}</td>
                                    <td className="py-3 pl-3 break-all">{pv.referrer || "—"}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </CardContent>
            </Card>
        </div>
    );
}