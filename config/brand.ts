// config/brand.ts
//
// Product and contact details, in ONE place.
//
// These are hardcoded on purpose. The obvious alternative - NEXT_PUBLIC_* env
// vars - is wrong here: Next inlines those at BUILD time, so introducing one
// would re-tie the compiled artifact to a particular configuration and destroy
// the property that makes this shippable, namely that a single installer works
// unmodified at every site.
//
// TODO(XenithPulse): the support details below are placeholders. The same four
// values also appear in installer/setup.iss and installer/scripts/provision.ps1.
// Replace all three before shipping to a paying customer.

export const BRAND = {
  /** The product. */
  productName: "XP POS",
  /** The company that makes it. */
  companyName: "XenithPulse",
  tagline: "Point of Sale",

  supportEmail: "support@xenithpulse.com",
  supportUrl: "https://xenithpulse.com/support",
  homeUrl: "https://xenithpulse.com",
} as const;
