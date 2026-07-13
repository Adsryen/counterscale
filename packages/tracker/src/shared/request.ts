import type {
    CollectRequestParams,
    IdentityRequestParams,
    UtmParams,
} from "./types";
import { queryParamStringify } from "./utils";

export function buildCollectRequestParams(
    siteId: string,
    hostname: string,
    path: string,
    referrer: string,
    utmParams: UtmParams = {},
    hitType?: string,
    identity?: IdentityRequestParams,
): CollectRequestParams {
    const params: CollectRequestParams = {
        p: path,
        h: hostname,
        r: referrer,
        sid: siteId,
    };

    if (hitType) {
        params.ht = hitType;
    }

    if (identity) {
        params.cid = identity.visitorId;
        params.vid = identity.visitId;
        params.tid = identity.tabId;
        params.isc = identity.identityScope;
        params.ct = identity.clientTime.toString();
    }

    Object.assign(params, utmParams);

    return params;
}

export function buildCollectUrl(
    baseUrl: string,
    params: CollectRequestParams,
    filterEmpty = false,
): string {
    return baseUrl + queryParamStringify(params, filterEmpty);
}
