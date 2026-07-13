import { ActivityManager } from "./activity";
import { IdentityManager } from "./identity";
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

    _cleanupAutoTrackPageviews?: () => void;

    constructor(opts: ClientOpts) {
        this.siteId = opts.siteId;
        this.reporterUrl = opts.reporterUrl;
        this.identity = new IdentityManager({ siteId: opts.siteId });
        this.activity = new ActivityManager({
            siteId: opts.siteId,
            getContext: () => this.identity.getContext(),
        });

        if (opts.reportOnLocalhost) {
            this.reportOnLocalhost = opts.reportOnLocalhost;
        }

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
    }
}
