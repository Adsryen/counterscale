import {
    Line,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    ComposedChart,
} from "recharts";

import { useMemo } from "react";

import { Card } from "./ui/card";
import { useLocale } from "~/i18n/LocaleContext";

interface TimeSeriesChartProps {
    data: Array<{
        date: string;
        views: number;
        visitors: number;
        bounceRate: number;
        previousViews?: number;
        previousVisitors?: number;
        previousBounceRate?: number;
    }>;
    intervalType?: string;
}

function dateStringToLocalDateObj(dateString: string): Date {
    const date = new Date(dateString);
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    return date;
}

type TooltipPayload = Array<{
    value?: number | string;
    dataKey?: string | number;
}>;

function payloadValue(payload: TooltipPayload | undefined, dataKey: string) {
    return payload?.find((entry) => entry.dataKey === dataKey)?.value;
}

function CustomTooltip({
    active,
    payload,
    label,
}: {
    active?: boolean;
    payload?: TooltipPayload;
    label?: string;
}) {
    const { t } = useLocale();
    if (!active || !payload?.length || !label) return null;

    const date = dateStringToLocalDateObj(label);

    const formattedDate = date.toLocaleString("en-us", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "numeric",
        timeZoneName: "short",
    });
    const previousViews = payloadValue(payload, "previousViews");
    const previousVisitors = payloadValue(payload, "previousVisitors");
    const previousBounceRate = payloadValue(payload, "previousBounceRate");

    return (
        <Card className="rounded-xl border-border/70 p-3 shadow-lg leading-normal">
            <div className="font-semibold">{formattedDate}</div>
            <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                <div className="before:content-['\2022'] before:text-chart-visitors before:font-bold before:mr-2">
                    {`${payloadValue(payload, "visitors") ?? "\u2014"} ${t("console.overview.chartVisitors")}`}
                </div>
                <div className="before:content-['\2022'] before:text-chart-views before:font-bold before:mr-2">
                    {`${payloadValue(payload, "views") ?? "\u2014"} ${t("console.overview.chartViews")}`}
                </div>
                <div className="before:content-['\2022'] before:text-chart-bounce before:font-bold before:mr-2">
                    {`${payloadValue(payload, "bounceRate") ?? "\u2014"}% ${t("console.overview.chartBounceRate")}`}
                </div>
                {previousViews !== undefined ||
                previousVisitors !== undefined ||
                previousBounceRate !== undefined ? (
                    <div className="border-t border-border/70 pt-2 text-xs">
                        <div>{`${previousVisitors ?? "\u2014"} ${t("console.overview.chartPreviousVisitors")}`}</div>
                        <div>{`${previousViews ?? "\u2014"} ${t("console.overview.chartPreviousViews")}`}</div>
                        <div>{`${previousBounceRate ?? "\u2014"}% ${t("console.overview.chartPreviousBounceRate")}`}</div>
                    </div>
                ) : null}
            </div>
        </Card>
    );
}

export default function TimeSeriesChart({
    data,
    intervalType,
}: TimeSeriesChartProps) {
    function xAxisDateFormatter(date: string): string {
        const dateObj = dateStringToLocalDateObj(date);

        switch (intervalType) {
            case "DAY":
                return dateObj.toLocaleDateString("en-us", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                });
            case "HOUR":
                return dateObj.toLocaleTimeString("en-us", {
                    hour: "numeric",
                    minute: "numeric",
                });
            default:
                throw new Error("Invalid interval type");
        }
    }

    const yAxisCountTicks = useMemo(() => {
        const MAX_TICKS_TO_SHOW = 4;

        // get the max integer value of current and comparison views
        const maxViews = Math.max(
            1,
            ...data.map((item) => Math.max(item.views, item.previousViews ?? 0)),
        );

        // determine the magnitude of maxViews to set rounding
        const magnitude = Math.floor(Math.log10(maxViews));
        const roundTo = Math.pow(10, Math.max(0, magnitude - 1));

        const numTicks = Math.min(MAX_TICKS_TO_SHOW, maxViews);
        const ticks = [];

        // calculate increment and round it up to the nearest roundTo
        let increment = Math.floor(maxViews / numTicks);
        increment = Math.ceil(increment / roundTo) * roundTo;

        // skip 0 and go 1 further
        for (let i = 1; i <= numTicks + 1; i++) {
            const tick = i * increment;

            ticks.push(tick);
        }

        return ticks;
    }, [data]);

    // omit first and last
    const xAxisTicks = useMemo(
        () => data.slice(1, -1).map((entry) => entry.date),
        [data],
    );

    // chart doesn't really work no data points, so just bail out
    if (data.length === 0) {
        return null;
    }

    return (
        <ResponsiveContainer width="100%" height="100%" minWidth={100}>
            <ComposedChart
                width={500}
                height={400}
                data={data}
                margin={{
                    top: 10,
                    right: 30,
                    left: 0,
                    bottom: 0,
                }}
            >
                <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="hsl(var(--border))"
                    strokeOpacity={0.72}
                />
                <XAxis
                    dataKey="date"
                    // tickLine={false}
                    tickMargin={8}
                    ticks={xAxisTicks}
                    tickFormatter={xAxisDateFormatter}
                    tick={{
                        fill: "hsl(var(--muted-foreground))",
                        fontSize: 12,
                    }}
                />

                {/* manually setting maxViews vs using recharts "dataMax" key cause it doesnt seem to work */}
                <YAxis
                    yAxisId="count"
                    dataKey="views"
                    domain={[0, Math.max(...yAxisCountTicks)]} // set max Y value a little higher than what was recorded
                    tickLine={false}
                    tickMargin={5}
                    ticks={yAxisCountTicks}
                    tick={{
                        fill: "hsl(var(--muted-foreground))",
                        fontSize: 12,
                    }}
                />
                <YAxis
                    yAxisId="bounceRate"
                    dataKey="bounceRate"
                    domain={[0, 120]}
                    hide={true}
                />

                <Tooltip content={<CustomTooltip />} />

                {/* NOTE: colors defined in globals.css/tailwind.config.js */}
                <Area
                    yAxisId="count"
                    dataKey="previousViews"
                    stroke="hsl(var(--chart-views))"
                    strokeWidth="1.5"
                    strokeDasharray="5 5"
                    fill="transparent"
                    fillOpacity={0}
                    dot={false}
                    opacity={0.45}
                />
                <Area
                    yAxisId="count"
                    dataKey="previousVisitors"
                    stroke="hsl(var(--chart-visitors))"
                    strokeWidth="1.5"
                    strokeDasharray="5 5"
                    fill="transparent"
                    fillOpacity={0}
                    dot={false}
                    opacity={0.45}
                />
                <Area
                    yAxisId="count"
                    dataKey="views"
                    stroke="hsl(var(--chart-views))"
                    strokeWidth="2"
                    fill="hsl(var(--chart-views))"
                    fillOpacity={0.16}
                />
                <Area
                    yAxisId="count"
                    dataKey="visitors"
                    stroke="hsl(var(--chart-visitors))"
                    strokeWidth="2"
                    fill="hsl(var(--chart-visitors))"
                    fillOpacity={0.12}
                />
                <Line
                    yAxisId="bounceRate"
                    dataKey="previousBounceRate"
                    stroke="hsl(var(--chart-bounce))"
                    strokeWidth="1.5"
                    strokeDasharray="5 5"
                    dot={false}
                    opacity={0.45}
                />
                <Line
                    yAxisId="bounceRate"
                    dataKey="bounceRate"
                    stroke="hsl(var(--chart-bounce))"
                    strokeWidth="2"
                    dot={false}
                />
            </ComposedChart>
        </ResponsiveContainer>
    );
}
