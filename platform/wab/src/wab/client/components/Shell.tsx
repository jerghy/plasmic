import { AppCtx, hideStarters } from "@/wab/client/app-ctx";
import { isTopFrame, UU } from "@/wab/client/cli-routes";
import { initClientFlags } from "@/wab/client/client-dev-flags";
import {
  handleError,
  shouldIgnoreError,
} from "@/wab/client/ErrorNotifications";
import {
  HostFrameCtxProvider,
  useHostFrameCtxIfHostFrame,
} from "@/wab/client/frame-ctx/host-frame-ctx";
import type { StudioCtx } from "@/wab/client/studio-ctx/StudioCtx";
import { useTracking } from "@/wab/client/tracking";
import {
  CustomError,
  hackyCast,
  mkUuid,
  stampObjectUuid,
  tuple,
  withoutFalsy,
} from "@/wab/common";
import DeploymentFlags from "@/wab/DeploymentFlags";
import { applyDevFlagOverrides, DEVFLAGS } from "@/wab/devflags";
import { isCoreTeamEmail } from "@/wab/shared/devflag-utils";
import { getMaximumTier } from "@/wab/shared/pricing/pricing-utils";
import { UserError } from "@/wab/shared/UserError";
import * as Sentry from "@sentry/browser";
import * as Integrations from "@sentry/integrations";
import { createBrowserHistory } from "history";
import LogRocket from "logrocket";
import { onReactionError } from "mobx";
import posthog from "posthog-js";
import * as React from "react";
import { OverlayProvider } from "react-aria";
import * as ReactDOM from "react-dom";
import { Router } from "react-router-dom";
import { Root } from "./root-view";

declare const COMMITHASH: string;

const sentryOrgId = "plasmicapp";
const sentryProjId = "1840236";

const localStoragePrefixesThatAreSafeToRemove = ["__mpq_"];

function getStudioPlaceholderElement() {
  return document.querySelector(".StudioPlaceholder") as HTMLDivElement;
}

/**
 * Watch for any entries over 500KB in size - we found that mixpanel was introducing __mpq_* keys that were exhausting the 10MB limit!
 */
function reportAndFixOversizedLocalStorage() {
  let keys: string[];
  try {
    keys = Object.keys(localStorage);
  } catch (err) {
    return;
  }
  const report = keys
    .map((key) => tuple(key, localStorage[key].length))
    .filter(([_key, len]) => len > 500000);
  if (report.length > 0) {
    Sentry.captureMessage(
      `Found oversized localStorage: ${JSON.stringify(report)}`
    );
    for (const [key, _len] of report) {
      if (
        localStoragePrefixesThatAreSafeToRemove.some((prefix) =>
          key.startsWith(prefix)
        )
      ) {
        localStorage.removeItem(key);
      }
    }
  }
}

/**
 * main needs to go in Shell rather than main.tsx since Shell is the root of
 * hot-reload, so this way hot reload works more fully.  Need to ensure that as
 * many application modules as possible are imported via this hot module and
 * there's no import path to them from the root main.tsx.
 */
export function main() {
  if (!DEVFLAGS.uncatchErrors) {
    window.onunhandledrejection = (e: PromiseRejectionEvent) => {
      const reason = e.reason;
      const err =
        reason instanceof Error
          ? reason
          : reason
          ? new Error(reason)
          : new Error(`Unknown error`);
      handleError(err);
    };
    window.onerror = (
      event: Event | string,
      source?: string,
      lineno?: number,
      colno?: number,
      error?: Error
    ) => {
      // We check `source` to weed out errors that come from
      // the console.
      if (source && error) {
        handleError(error, source);
      }
    };
  }

  applyDevFlagOverrides(DEVFLAGS, initClientFlags(DEVFLAGS));

  // Monkey patch console.log to not log anything to console unless
  // logToConsole devflag is on.
  if (!DEVFLAGS.logToConsole) {
    // console.log = function () {};
  }

  if (DEVFLAGS.useLogrocket) {
    hackyCast(window).useLogrocket = true;
    type Payload = { body?: string };
    const sanitizer = function <T extends Payload>(payload: T): T {
      if (payload.body && payload.body.length > 999) {
        payload.body = JSON.stringify({
          length: payload.body.length,
          snip: `${payload.body.slice(0, 500)}..${payload.body.slice(-400)}`,
        });
      }
      return payload;
    };
    LogRocket.init("dl8waw/plasmic", {
      mergeIframes: true,
      network: {
        requestSanitizer: sanitizer,
        responseSanitizer: sanitizer,
      },
    });
  }

  if (DeploymentFlags.DEPLOYENV === "production") {
    if (DEVFLAGS.posthog) {
      posthog.init("phc_eaI1hFsPRIZkmwrXaSGRNDh4H9J3xdh1j9rgNy27NgP");
    }

    Sentry.init({
      dsn: `https://dd4fc160e1a548609dc8db7e6c9f7a08@sentry.io/${sentryProjId}`,
      release: COMMITHASH,
      integrations: [
        new Integrations.Dedupe(),
        new posthog.SentryIntegration(posthog, sentryOrgId, +sentryProjId),
      ],
      beforeSend(event, hint) {
        if (
          hint &&
          hint.originalException instanceof Error &&
          shouldIgnoreError(hint.originalException)
        ) {
          return null;
        }

        if (hint && hint.originalException instanceof UserError) {
          return null;
        }

        if (
          hint?.originalException instanceof Error &&
          hint.originalException.message.includes("XHRStatus0Error")
        ) {
          // Do not log `xhr.status === 0` AJAX failures to Sentry, because
          // that means the client stopped the request before it was fulfilled.
          return null;
        }

        // Ignore errors loading corrupted projects for certain users.
        const appCtx = hackyCast<AppCtx | undefined>(hackyCast(window).gAppCtx);
        if (
          hint &&
          hint.originalException &&
          appCtx &&
          hideStarters(appCtx) &&
          hint.originalException instanceof Error &&
          hint.originalException.message.includes("__bundleInfo")
        ) {
          return null;
        }

        event.extra = event.extra || {};
        event.tags = event.tags || {};

        if (appCtx) {
          const location = appCtx.history.location;
          event.extra.location =
            location.pathname + location.search + location.hash;
        }

        const studioCtx = hackyCast<StudioCtx | undefined>(
          hackyCast(window).studioCtx
        );
        const maybeProjectId = studioCtx?.siteInfo.id;
        if (maybeProjectId) {
          event.tags.projectId = maybeProjectId;
        }

        // Differentiate errors generated/known by Plasmic.
        if (hint && hint.originalException instanceof CustomError) {
          event.tags.errorOrigin = "plasmic";
        } else {
          event.tags.errorOrigin = "unknown";
        }

        // Tag errors with affected user tier(s).
        if (
          appCtx &&
          isCoreTeamEmail(appCtx.selfInfo?.email, appCtx.appConfig)
        ) {
          event.tags.tier = "plasmic";
        } else {
          const userTiers = withoutFalsy(
            appCtx?.teams.map((t) => t.featureTier?.name) ?? []
          );
          event.tags.tier = getMaximumTier(userTiers);
        }

        //
        // Record FullStory session ID.
        // Adapted from https://gist.github.com/patrick-fs/8066c2a0c97aec6cca6d355a55a52506
        // via https://github.com/getsentry/sentry-fullstory/issues/30
        //

        const _fs = hackyCast(window[hackyCast(window)._fs_namespace]);
        // getCurrentSessionURL isn't available until after the FullStory script is fully bootstrapped.
        // If an error occurs before getCurrentSessionURL is ready, make a note in Sentry and move on.
        // More on getCurrentSessionURL here: https://help.fullstory.com/develop-js/getcurrentsessionurl
        event.extra.fullstory =
          typeof _fs !== "function"
            ? "FullStory is not installed"
            : typeof _fs.getCurrentSessionURL === "function"
            ? _fs.getCurrentSessionURL(true)
            : "current session URL API not ready";

        //
        // Record LogRocket session ID (including timestamp).
        //

        const logRocketSession = LogRocket.sessionURL;
        if (logRocketSession) {
          event.extra.LogRocket = logRocketSession;
        }

        if (hint) {
          //
          // Tag the error with a UUID. This is usually read later by
          // handleError which reports it in analytics.track().
          //

          const uuid = hint.originalException
            ? stampObjectUuid(hint.originalException)
            : mkUuid();
          if (!event.tags) {
            event.tags = {};
          }
          event.tags.plasmicErrorUuid = uuid;

          // This originally tracks the Sentry ID to FS, but we are already
          // calling analytics.track() in handleError(). But that doesn't
          // have the Sentry event_id, which we have only here in
          // beforeSend. We might want to merge the two somehow and ensure
          // analytics.track() has the Sentry event_id (or even some
          // kind of unique Segment event ID?).
          const error = hint.originalException;
          if (
            0 / 1 &&
            typeof _fs === "function" &&
            error &&
            error instanceof Error
          ) {
            // FS.event is immediately ready even if FullStory isn't fully bootstrapped
            _fs.event("Application error", {
              name: error.name,
              message: error.message,
              fileName: hackyCast(error).fileName,
              sentryEventId: hint.event_id,
              sentryUrl: `https://sentry.io/organizations/${sentryOrgId}/issues/?project=${sentryProjId}&query=${hint.event_id}`,
            });
          }
        }

        return event;
      },
    });

    onReactionError((error) => {
      Sentry.captureException(error);
    });
  }

  (window as any).commithash = COMMITHASH;

  const appContainerElement = document.querySelector(".app-container");

  if (isTopFrame()) {
    const studioPlaceholder = getStudioPlaceholderElement();

    window.addEventListener("message", ({ data }) => {
      // Studio is ready to be shown
      // if any of these messages is triggered
      if (
        [
          "addStorageListener",
          "exposeHostFrameApi",
          "setLatestPublishedVersionData",
        ].includes(data?.path?.[0])
      ) {
        studioPlaceholder.classList.add("fadeOut");
      }
    });

    ReactDOM.render(<Shell />, appContainerElement);
  } else {
    ReactDOM.render(
      <HostFrameCtxProvider>
        <Shell />
      </HostFrameCtxProvider>,
      appContainerElement
    );
  }

  reportAndFixOversizedLocalStorage();
}

function isProjectPath(pathname) {
  return !!(
    UU.project.parse(pathname) ||
    UU.projectSlug.parse(pathname) ||
    UU.projectBranchArena.parse(pathname)
  );
}

export function Shell() {
  useTracking();

  const hostFrameCtx = useHostFrameCtxIfHostFrame();
  const history = hostFrameCtx ? hostFrameCtx.history : createBrowserHistory();

  const isProjectPathRef = React.useRef(
    isProjectPath(history.location.pathname)
  );

  React.useEffect(() => {
    if (hostFrameCtx) {
      return;
    }

    const onHistoryChange = ({ pathname }) => {
      const studioPlaceholder = getStudioPlaceholderElement();
      const _isProjectPath = isProjectPath(pathname);

      if (_isProjectPath && !isProjectPathRef.current) {
        isProjectPathRef.current = true;
        studioPlaceholder.classList.add("visible");
        studioPlaceholder.classList.remove("fadeOut");
      } else if (!_isProjectPath && isProjectPathRef.current) {
        isProjectPathRef.current = false;
        studioPlaceholder.classList.remove("visible");
        studioPlaceholder.classList.remove("fadeOut");
      }
    };

    history.listen(onHistoryChange);
  }, []);

  return (
    // @ts-ignore
    <Router history={history}>
      <OverlayProvider style={{ width: "100%", height: "100%" }}>
        <Root />
      </OverlayProvider>
    </Router>
  );
}
