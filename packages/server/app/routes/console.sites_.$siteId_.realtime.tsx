import { useEffect } from "react";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { useFetcher, useLoaderData } from "react-router";

import { buttonVariants } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { requireAuth } from "~/lib/auth";
import { getRealtimeDashboardData, type RealtimeDashboardData } from "~/lib/realtime";
import { getSite } from "~/lib/sites";
import { cn } from "~/lib/utils";

export const meta: MetaFunction<typeof loader> = ({ data }) => [
    { title: `Counterscale: ${data?.site?.name || data?.siteId || "Site"} realtime` },
];

export async function loader({ request, context, params }: LoaderFunctionArgs) {
    await requireAuth(request, context.cloudflare.env);
    const siteId = (params.siteId || "").trim();
    if (!siteId) throw new Response("Not Found", { status: 404 });
    const db = context.cloudflare.env.DB;
    const site = db ? await getSite(db, siteId) : null;
    const realtime = await getRealtimeDashboardData(context.cloudflare.env, siteId);
    return { siteId, site, realtime };
}

function formatTime(value: string | null | undefined) {
    if (!value) return "—";
    return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function ipLabel(visit: RealtimeDashboardData["currentOnline"]["visits"][number]) {
    if (visit.ip) return visit.ip;
    switch (visit.ipStatus) {
        case "disabled":
            return "该站点未记录";
        case "unavailable":
            return "密钥不可用";
        case "not-recorded":
            return "未记录";
        default:
            return "—";
    }
}

function metricText(value: number | null) {
    return value == null ? "—" : value.toLocaleString("zh-CN");
}

function RealtimeBody({ data }: { data: RealtimeDashboardData }) {
    return (
        <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-3">
                <Card className="rounded-2xl shadow-sm border-primary/20 bg-primary/5">
                    <CardHeader className="pb-2">
                        <CardDescription>当前在线</CardDescription>
                        <CardTitle className="text-3xl">{data.currentOnline.available ? data.currentOnline.count : "—"}</CardTitle>
                    </CardHeader>
                    <CardContent className="text-xs text-muted-foreground">
                        WebSocket 仍连接，或最后心跳在 60 秒宽限期内。
                    </CardContent>
                </Card>
                <Card className="rounded-2xl shadow-sm">
                    <CardHeader className="pb-2">
                        <CardDescription>近 5 分钟活跃</CardDescription>
                        <CardTitle className="text-3xl">{metricText(data.recentActive.visits5m)}</CardTitle>
                    </CardHeader>
                    <CardContent className="text-xs text-muted-foreground">
                        D1 visit 最近 PV/事件窗口，不等同当前在线。
                    </CardContent>
                </Card>
                <Card className="rounded-2xl shadow-sm">
                    <CardHeader className="pb-2">
                        <CardDescription>近 30 分钟活跃</CardDescription>
                        <CardTitle className="text-3xl">{metricText(data.recentActive.visits30m)}</CardTitle>
                    </CardHeader>
                    <CardContent className="text-xs text-muted-foreground">
                        用于观察近期访问热度，不伪造成在线人数。
                    </CardContent>
                </Card>
            </div>

            {!data.currentOnline.available ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100 px-4 py-3 text-sm">
                    在线状态暂不可用：{data.currentOnline.error}
                </div>
            ) : null}
            {!data.recentActive.available ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100 px-4 py-3 text-sm">
                    近 5/30 分钟活跃窗口暂不可用：{data.recentActive.error}
                </div>
            ) : null}

            <Card className="rounded-2xl shadow-sm">
                <CardHeader>
                    <CardTitle className="text-base">在线访客</CardTitle>
                    <CardDescription>
                        展示完整 IP、行政区、来源、页面数和当前打开页面；每 5 秒刷新，可见性隐藏时浏览器会降频。
                    </CardDescription>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                    {data.currentOnline.available && data.currentOnline.visits.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-3">当前没有在线访客。</p>
                    ) : null}
                    {data.currentOnline.visits.length > 0 ? (
                        <table className="w-full text-sm text-left min-w-[980px]">
                            <thead>
                                <tr className="border-b text-muted-foreground">
                                    <th className="py-2 pr-3 font-medium">最后活动</th>
                                    <th className="py-2 px-3 font-medium">IP</th>
                                    <th className="py-2 px-3 font-medium">行政区</th>
                                    <th className="py-2 px-3 font-medium">来源</th>
                                    <th className="py-2 px-3 font-medium">页面数</th>
                                    <th className="py-2 px-3 font-medium">当前页面</th>
                                    <th className="py-2 pl-3 font-medium" />
                                </tr>
                            </thead>
                            <tbody>
                                {data.currentOnline.visits.map((visit) => (
                                    <tr key={visit.visitId} className="border-b last:border-0 align-top">
                                        <td className="py-3 pr-3 whitespace-nowrap">{formatTime(visit.lastSeenAt)}</td>
                                        <td className="py-3 px-3 font-mono">{ipLabel(visit)}</td>
                                        <td className="py-3 px-3">{[visit.country, visit.region, visit.city].filter(Boolean).join(" / ") || "—"}</td>
                                        <td className="py-3 px-3 break-all">{visit.referrer || "—"}</td>
                                        <td className="py-3 px-3">{visit.pageCount ?? "—"}</td>
                                        <td className="py-3 px-3">
                                            <div className="space-y-1">
                                                {visit.tabs.map((tab) => (
                                                    <div key={tab.tabId} className="rounded-xl bg-muted px-2 py-1">
                                                        <span className="break-all">{tab.path}</span>
                                                        <span className="ml-2 text-xs text-muted-foreground">{tab.visibility === "hidden" ? "后台" : "可见"}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </td>
                                        <td className="py-3 pl-3 text-right">
                                            {visit.trailHref ? <a href={visit.trailHref} className="text-primary underline">轨迹</a> : "—"}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : null}
                </CardContent>
            </Card>
        </div>
    );
}

export default function RealtimePage() {
    const { siteId, site, realtime } = useLoaderData<typeof loader>();
    const fetcher = useFetcher<RealtimeDashboardData>();
    const data = fetcher.data ?? realtime;
    const name = site?.name || siteId;

    useEffect(() => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        let stopped = false;
        const load = () => {
            if (stopped) return;
            fetcher.load(`/resources/realtime?site=${encodeURIComponent(siteId)}`);
            const delay = document.hidden ? 30_000 : 5_000;
            timer = setTimeout(load, delay);
        };
        timer = setTimeout(load, 5_000);
        const onVisibility = () => {
            if (!document.hidden) {
                if (timer) clearTimeout(timer);
                load();
            }
        };
        document.addEventListener("visibilitychange", onVisibility);
        return () => {
            stopped = true;
            if (timer) clearTimeout(timer);
            document.removeEventListener("visibilitychange", onVisibility);
        };
    }, [fetcher, siteId]);

    return (
        <div className="space-y-6">
            <div>
                <p className="text-sm text-muted-foreground mb-1">
                    <a href={`/console/sites/${encodeURIComponent(siteId)}`} className="underline hover:text-foreground">{name}</a>
                    {" / 实时访客"}
                </p>
                <h1 className="text-2xl font-bold tracking-tight">实时在线访客</h1>
                <p className="text-muted-foreground mt-1">
                    当前在线来自 Presence Durable Object；近 5/30 分钟活跃来自 D1 明细，两者不会互相替代。
                </p>
            </div>
            <RealtimeBody data={data} />
            <div className="flex flex-wrap gap-2">
                <a className={cn(buttonVariants({ variant: "outline" }), "rounded-xl")} href={`/console/sites/${encodeURIComponent(siteId)}`}>返回站点</a>
                <span className="text-xs text-muted-foreground self-center">最后刷新：{formatTime(data.generatedAt)}</span>
            </div>
        </div>
    );
}
