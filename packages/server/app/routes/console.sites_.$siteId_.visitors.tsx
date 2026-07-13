import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import { requireAuth } from "~/lib/auth";
import { getSite } from "~/lib/sites";
import { listVisitSummaries } from "~/lib/visit-details";
import { decryptIpAddress } from "~/lib/ip-crypto";
import { buttonVariants } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { cn } from "~/lib/utils";

export const meta: MetaFunction<typeof loader> = ({ data }) => [
    { title: `Counterscale: ${data?.site?.name || data?.siteId || "Site"} visitors` },
];

function ipConfig(env: Env) {
    if (!env.CF_IP_ENCRYPTION_KEY || !env.CF_IP_HMAC_KEY) return null;
    return {
        encryptionKey: env.CF_IP_ENCRYPTION_KEY,
        hmacKey: env.CF_IP_HMAC_KEY,
        keyVersion: Number(env.CF_IP_KEY_VERSION || "1") || 1,
    };
}

async function revealIp(row: Awaited<ReturnType<typeof listVisitSummaries>>[number], env: Env) {
    const config = ipConfig(env);
    if (!config || !row.ipCiphertext || !row.ipNonce || !row.ipKeyVersion) {
        return null;
    }
    try {
        return await decryptIpAddress(
            {
                ciphertext: row.ipCiphertext,
                nonce: row.ipNonce,
                keyVersion: row.ipKeyVersion,
            },
            { ...config, keyVersion: row.ipKeyVersion },
        );
    } catch {
        return null;
    }
}

export async function loader({ request, context, params }: LoaderFunctionArgs) {
    await requireAuth(request, context.cloudflare.env);
    const siteId = (params.siteId || "").trim();
    if (!siteId) throw new Response("Not Found", { status: 404 });
    const db = context.cloudflare.env.DB;
    if (!db) throw new Response("D1 DB is not configured", { status: 501 });

    const url = new URL(request.url);
    const page = Math.max(1, Number(url.searchParams.get("page") || "1") || 1);
    const limit = 50;
    const offset = (page - 1) * limit;
    const site = await getSite(db, siteId);
    const rows = await listVisitSummaries(db, siteId, limit, offset);
    const visits = await Promise.all(
        rows.map(async (row) => ({ ...row, rawIp: await revealIp(row, context.cloudflare.env) })),
    );

    return { siteId, site, visits, page, hasNext: rows.length === limit };
}

function formatTime(value: string) {
    return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

export default function VisitorsPage() {
    const { siteId, site, visits, page, hasNext } = useLoaderData<typeof loader>();
    const name = site?.name || siteId;
    const prevHref = `/console/sites/${encodeURIComponent(siteId)}/visitors?page=${page - 1}`;
    const nextHref = `/console/sites/${encodeURIComponent(siteId)}/visitors?page=${page + 1}`;

    return (
        <div className="space-y-6">
            <div>
                <p className="text-sm text-muted-foreground mb-1">
                    <a href={`/console/sites/${encodeURIComponent(siteId)}`} className="underline hover:text-foreground">{name}</a>
                    {" / 访客明细"}
                </p>
                <h1 className="text-2xl font-bold tracking-tight">访客明细</h1>
                <p className="text-muted-foreground mt-1">
                    按访问展示完整 IP、行政区、入口页与访问时间；关闭原始 IP 后仍会展示访问轨迹和 Cloudflare 行政区。
                </p>
            </div>

            <Card className="rounded-2xl shadow-sm">
                <CardHeader>
                    <CardTitle className="text-base">最近访问</CardTitle>
                    <CardDescription>默认每页 50 条，完整 IP 仅管理员后台展示。</CardDescription>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                    {visits.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-3">暂无访问明细。</p>
                    ) : (
                        <table className="w-full text-sm text-left min-w-[860px]">
                            <thead>
                                <tr className="border-b text-muted-foreground">
                                    <th className="py-2 pr-3 font-medium">最后访问</th>
                                    <th className="py-2 px-3 font-medium">IP</th>
                                    <th className="py-2 px-3 font-medium">行政区</th>
                                    <th className="py-2 px-3 font-medium">入口页</th>
                                    <th className="py-2 px-3 font-medium">访客</th>
                                    <th className="py-2 pl-3 font-medium" />
                                </tr>
                            </thead>
                            <tbody>
                                {visits.map((visit) => (
                                    <tr key={visit.visitId} className="border-b last:border-0">
                                        <td className="py-3 pr-3 whitespace-nowrap">{formatTime(visit.lastSeenAt)}</td>
                                        <td className="py-3 px-3 font-mono">{visit.rawIp ?? (visit.ipHmac ? "密钥不可用" : "未记录")}</td>
                                        <td className="py-3 px-3">{[visit.country, visit.region, visit.city].filter(Boolean).join(" / ") || "—"}</td>
                                        <td className="py-3 px-3 break-all">{visit.entryPath || visit.entryHost || "—"}</td>
                                        <td className="py-3 px-3"><code className="text-xs bg-muted px-1 rounded">{visit.visitorId || visit.visitId}</code></td>
                                        <td className="py-3 pl-3 text-right">
                                            <a href={`/console/sites/${encodeURIComponent(siteId)}/visitors/${encodeURIComponent(visit.visitId)}`} className="text-primary underline">轨迹</a>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </CardContent>
            </Card>

            <div className="flex gap-2">
                {page > 1 ? <a className={cn(buttonVariants({ variant: "outline" }), "rounded-xl")} href={prevHref}>上一页</a> : null}
                {hasNext ? <a className={cn(buttonVariants({ variant: "outline" }), "rounded-xl")} href={nextHref}>下一页</a> : null}
            </div>
        </div>
    );
}