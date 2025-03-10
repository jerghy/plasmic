// This is a skeleton starter React component generated by Plasmic.
// This file is owned by you, feel free to edit as you see fit.
import { HTMLElementRefOf } from "@plasmicapp/react-web";
import * as React from "react";
import {
  DefaultPriceTierFeatureItemProps,
  PlasmicPriceTierFeatureItem,
} from "../../plasmic/plasmic_kit_pricing/PlasmicPriceTierFeatureItem";

export interface PriceTierFeatureItemProps
  extends DefaultPriceTierFeatureItemProps {}

function PriceTierFeatureItem_(
  props: PriceTierFeatureItemProps,
  ref: HTMLElementRefOf<"div">
) {
  return <PlasmicPriceTierFeatureItem root={{ ref }} {...props} />;
}

const PriceTierFeatureItem = React.forwardRef(PriceTierFeatureItem_);
export default PriceTierFeatureItem;
