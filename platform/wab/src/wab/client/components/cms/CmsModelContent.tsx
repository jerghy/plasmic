// This is a skeleton starter React component generated by Plasmic.
// This file is owned by you, feel free to edit as you see fit.
import { UU } from "@/wab/client/cli-routes";
import {
  DefaultCmsModelContentProps,
  PlasmicCmsModelContent,
} from "@/wab/client/plasmic/plasmic_kit_cms/PlasmicCmsModelContent";
import { CmsDatabaseId, CmsTableId } from "@/wab/shared/ApiSchema";
import { HTMLElementRefOf } from "@plasmicapp/react-web";
import * as React from "react";
import { Redirect, Route, Switch, useRouteMatch } from "react-router";
import { useCmsRows } from "./cms-contexts";

export type CmsModelContentProps = DefaultCmsModelContentProps;

function CmsModelContent_(
  props: CmsModelContentProps,
  ref: HTMLElementRefOf<"div">
) {
  const match_ = useRouteMatch<{
    databaseId: CmsDatabaseId;
    tableId: CmsTableId;
  }>();
  const { rows } = useCmsRows(
    match_.params.databaseId,
    match_.params.tableId as CmsTableId
  );

  return (
    <Switch>
      <Route
        path={UU.cmsEntry.pattern}
        render={({ match }) => {
          if (rows && !rows.find((r) => r.id === match.params.rowId)) {
            return (
              <Redirect
                to={UU.cmsModelContent.fill({
                  databaseId: match.params.databaseId,
                  tableId: match.params.tableId,
                })}
              />
            );
          } else {
            return (
              <PlasmicCmsModelContent
                root={{ ref }}
                {...props}
                entriesList={{
                  rows,
                }}
                entryDetail={{
                  key: match.params.rowId,
                }}
              />
            );
          }
        }}
      />
      <Route
        path={UU.cmsModelContent.pattern}
        render={({ match }) => {
          if (rows && rows.length > 0) {
            return (
              <Redirect
                to={UU.cmsEntry.fill({
                  databaseId: match.params.databaseId,
                  tableId: match.params.tableId,
                  rowId: rows[0].id,
                })}
              />
            );
          } else {
            return (
              <PlasmicCmsModelContent
                root={{ ref }}
                {...props}
                noEntries={true}
                entriesList={{
                  rows,
                }}
              />
            );
          }
        }}
      />
    </Switch>
  );
}

const CmsModelContent = React.forwardRef(CmsModelContent_);
export default CmsModelContent;