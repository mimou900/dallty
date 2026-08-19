import * as React from "react";
import { Text } from "@react-email/components";

import { brandName, brandTag } from "./brand";

/**
 * Shared header for every branded Dallty email — text-only wordmark, deliberately no
 * `<Img>`. An image logo makes most inbox clients show a "images are not displayed" /
 * blocked-content banner by default, which is worse for a transactional email than no
 * logo at all, and also drags down the text-to-image ratio spam filters weigh. Colour and
 * weight alone carry the brand here.
 */
export function BrandHeader() {
  return (
    <>
      <Text style={brandName}>Dallty</Text>
      <Text style={brandTag}>Beauty booking, refined</Text>
    </>
  );
}
