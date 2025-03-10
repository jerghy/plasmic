import copy from "copy-to-clipboard";
import { observer } from "mobx-react-lite";
import React from "react";
import { ensure } from "../../../common";
import { ApiTrustedHost } from "../../../shared/ApiSchema";
import { AppCtx } from "../../app-ctx";
import { useAppCtx } from "../../contexts/AppContexts";
import { useAsyncStrict } from "../../hooks/useAsyncStrict";
import { AddTrustedHostModal } from "../AddTrustedHostModal";
import { documentTitle } from "../dashboard/page-utils";
import { NormalLayout } from "../normal-layout";
import SettingsContainer from "./plasmic/SettingsContainer";

function _UserSettingsPage(props: { appCtx: AppCtx }) {
  const { appCtx } = props;
  const user = ensure(appCtx.selfInfo, "Unexpected null selfInfo");
  const tokensState = usePersonalApiTokens();
  const ops = ensure(appCtx.ops, "Unexpected null AppOps");
  const [copiedToken, setCopiedToken] = React.useState("");
  const [hostsState, setHostsState] = React.useState<
    "loading" | "error" | ApiTrustedHost[]
  >();
  const [showHostModal, setShowHostModal] = React.useState(false);

  const updateHostList = React.useCallback(() => {
    setHostsState("loading");
    appCtx.api
      .getTrustedHostsList()
      .then((data) => setHostsState(data.trustedHosts))
      .catch(() => setHostsState("error"));
  }, [appCtx, setHostsState]);

  React.useEffect(() => {
    updateHostList();
  }, [updateHostList]);

  return (
    <NormalLayout appCtx={appCtx}>
      {documentTitle("Settings")}
      {showHostModal && (
        <AddTrustedHostModal
          appCtx={appCtx}
          onCancel={() => setShowHostModal(false)}
          onUpdate={updateHostList}
        />
      )}
      <SettingsContainer
        name={`${user.firstName} ${user.lastName}`}
        email={user.email}
        avatarImgUrl={user.avatarUrl || undefined}
        tokensState={tokensState}
        hostsState={hostsState}
        hideChangePassword={appCtx.selfInfo?.usesOauth}
        onNewToken={() => ops.createPersonalApiToken()}
        onDeleteToken={(token: string) => ops.revokePersonalApiToken(token)}
        onCopyToken={(e: React.MouseEvent, token: string) => {
          setCopiedToken(token);
          copy(token);
        }}
        copiedToken={copiedToken}
        onDeleteTrustedHost={(host) =>
          appCtx.api.deleteTrustedHost(host.id).then(() => updateHostList())
        }
        onNewTrustedHost={() => setShowHostModal(true)}
      ></SettingsContainer>
    </NormalLayout>
  );
}

export const UserSettingsPage = observer(_UserSettingsPage);

export function usePersonalApiTokens() {
  const appCtx = useAppCtx();
  const tokens = appCtx.personalApiTokens;
  const api = appCtx.api;

  return useAsyncStrict(async () => {
    if (tokens === null) {
      const fetched = await api.listPersonalApiTokens();
      appCtx.personalApiTokens = fetched;
      return fetched;
    } else {
      return tokens;
    }
  }, [api, tokens, appCtx]);
}
