import { ActivityManager } from "./activity";
import { EngagementManager } from "./engagement";
import { IdentityManager } from "./identity";
import { PresenceManager } from "./presence";
import { autoTrackPageviews } from "./track";
import type { BaseClientConfig } from "../shared/types";

export type ClientOpts = BaseClientConfig & {
    autoTrackPageviews?: boolean;
};

export class Client {
    siteId: string;
    reporterUrl: string;
    reportOnLocalhost = false;
    identity: IdentityManager;
    activity: ActivityManager;
    engagement: EngagementManager;
    presence?: PresenceManager;

    _cleanupAutoTrackPageviews?: () => void;

    constructor(opts: ClientOpts) {
        this.siteId = opts.siteId;
        this.reporterUrl = opts.reporterUrl;
        this.identity = new IdentityManager({ siteId: opts.siteId });

        if (opts.reportOnLocalhost) {
            this.reportOnLocalhost = opts.reportOnLocalhost;
        }

        this.activity = new ActivityManager({
            siteId: opts.siteId,
            getContext: () => this.identity.getContext(),
        });
        this.engagement = new EngagementManager({
            siteId: opts.siteId,
            reporterUrl: opts.reporterUrl,
            reportOnLocalhost: this.reportOnLocalhost,
            getContext: () => this.identity.getContext(),
            getPageviewId: () => null,
        });

        this.presence = new PresenceManager({
            siteId: opts.siteId,
            reporterUrl: opts.reporterUrl,
            reportOnLocalhost: this.reportOnLocalhost,
            getContext: () => this.identity.getContext(),
        });

        // default to true
        if (opts.autoTrackPageviews === undefined || opts.autoTrackPageviews) {
            // Use setTimeout to ensure this runs after the constructor
            // This helps with testing and avoids issues with async trackPageview
            setTimeout(() => {
                this._cleanupAutoTrackPageviews = autoTrackPageviews(this);
            }, 0);
        }
    }

    cleanup() {
        if (this._cleanupAutoTrackPageviews) {
            this._cleanupAutoTrackPageviews();
        }
        this.activity.cleanup();
        this.engagement.cleanup();
        this.presence?.cleanup();
    }
}
