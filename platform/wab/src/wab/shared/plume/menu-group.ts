import { omit, pick } from "lodash";
import { Component, Param, TplComponent } from "../../classes";
import { internalCanvasElementProps } from "../../shared/canvas-constants";
import {
  getExternalParams,
  serializeParamType,
  SerializerBaseContext,
} from "../codegen/react-p";
import {
  getExportedComponentName,
  makeDefaultExternalPropsName,
  makePlasmicComponentName,
} from "../codegen/react-p/utils";
import { jsLiteral, paramToVarName, toVarName } from "../codegen/util";
import { typeFactory } from "../core/model-util";
import { PlumePlugin } from "./plume-registry";
import { makeComponentImportPath } from "./plume-utils";

const RESERVED_PROPS = ["isFirst", "children"];

const menuGroupConfig = {
  noTitleVariant: { group: "noTitle", variant: "noTitle" },
  isFirstVariant: { group: "isFirst", variant: "isFirst" },
  itemsSlot: "children",
  titleSlot: "title",

  root: "root",
  separator: "separator",
  titleContainer: "titleContainer",
  itemsContainer: "itemsContainer",
} as const;

export const MenuGroupPlugin: PlumePlugin = {
  // PlumeCanvasPlugin
  genCanvasWrapperComponent: (sub, comp, observer, getCompMeta) => {
    return (allProps) =>
      observer(() => {
        const internalProps = pick(allProps, internalCanvasElementProps);
        const { plasmicProps } = sub.reactWeb.useMenuGroup(
          Object.assign(comp, getCompMeta()),
          omit(allProps, internalCanvasElementProps),
          menuGroupConfig as any
        );
        return sub.React.createElement(comp, {
          ...plasmicProps,
          ...internalProps,
        });
      });
  },

  // PlumeCodegenPlugin

  genHook(ctx: SerializerBaseContext) {
    const { component } = ctx;

    return `
      function useBehavior<P extends pp.BaseMenuGroupProps>(props: P) {
        return pp.useMenuGroup(
          ${makePlasmicComponentName(component)},
          props,
          ${jsLiteral(menuGroupConfig)}
        );
      }
    `;
  },
  genDefaultExternalProps(ctx: SerializerBaseContext, opts) {
    const { component } = ctx;
    const params = getExternalParams(ctx).filter(
      (p) => !RESERVED_PROPS.includes(toVarName(p.variable.name))
    );
    return `
      export interface ${
        opts?.typeName ?? makeDefaultExternalPropsName(component)
      } extends pp.BaseMenuGroupProps {
        ${params
          .map(
            (param) =>
              `"${paramToVarName(ctx.component, param)}"?: ${serializeParamType(
                component,
                param,
                ctx.projectFlags
              )}`
          )
          .join(";\n")}
      }
    `;
  },
  genSkeleton(ctx: SerializerBaseContext) {
    const { component } = ctx;
    const plasmicComponentName = makePlasmicComponentName(component);
    const componentName = getExportedComponentName(component);
    const defaultPropsName = makeDefaultExternalPropsName(component);
    const propsName = `${componentName}Props`;
    const componentSubstitutionApi = ctx.exportOpts.useComponentSubstitutionApi
      ? `import { components } from "@plasmicapp/loader-runtime-registry";

    export function getPlasmicComponent() {
      return components["${component.uuid}"] ?? ${componentName};
    }`
      : "";
    return `
      import * as React from "react";
      import {${plasmicComponentName}, ${defaultPropsName}} from "${
      ctx.exportOpts.relPathFromImplToManagedDir
    }/${makeComponentImportPath(
      component,
      ctx,
      "render"
    )}";  // plasmic-import: ${component.uuid}/render
    ${this.genSkeletonImports(ctx).imports}

    ${componentSubstitutionApi}

      export interface ${propsName} extends ${defaultPropsName} {
        // Feel free to add any additional props that this component should receive
      }

      function ${componentName}(props: ${propsName}) {
        const { plasmicProps } = ${plasmicComponentName}.useBehavior(props);
        return <${plasmicComponentName} {...plasmicProps} />;
      }

      export default Object.assign(
        ${componentName},
        ${this.genSerializedSkeletonFields(ctx)}
      );
    `;
  },
  genSkeletonImports(ctx) {
    return {
      imports: "",
    };
  },
  genSerializedSkeletonFields(ctx) {
    return `{__plumeType: "menu-group"}`;
  },

  // Plume editor plugin
  shouldShowInstanceProp(tpl: TplComponent | null, prop: Param) {
    return !["isFirst"].includes(toVarName(prop.variable.name));
  },

  getSlotType(component: Component, param: Param) {
    if (param.variable.name === "children" && component.superComp) {
      const option = component.superComp.subComps.find(
        (c) => c.plumeInfo?.type === "menu-item"
      );
      if (option) {
        return typeFactory.renderable(typeFactory.instance(option));
      }
    }
    return undefined;
  },

  componentMeta: {
    name: "Menu.Group",
    description: "A sub-group of Menu items.",
    variantDefs: [
      {
        group: "noTitle",
        variant: "noTitle",
        info: `Shows the Group without a visible title heading.`,
        required: true,
      },
      {
        group: "isFirst",
        variant: "isFirst",
        info: `Shows the Group when it is the first Group in a Menu. Typically, you would want to hide the separator in this case.`,
        required: true,
      },
    ],
    slotDefs: [
      {
        name: "children",
        info: `Slot for Options that belong in this Group.`,
        required: true,
      },
      {
        name: "title",
        info: `Slot for the title header of this Group.`,
        required: true,
      },
    ],
    elementDefs: [
      {
        name: "root",
        info: `Root element of the Group.`,
        required: true,
      },
      {
        name: "separator",
        info: `A visual separator (often a line) at the beginning of the Group, separating it from other Groups.  Should be hidden for the "isFirst" variant.`,
        required: true,
      },
      {
        name: "titleContainer",
        info: `Container immediately wrapping the "title" slot.`,
        required: true,
      },
      {
        name: "itemsContainer",
        info: `Container immediately wrapping the "children" slot.`,
        required: true,
      },
    ],
  },
  tagToAttachEventHandlers: "div",
};
