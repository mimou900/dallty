import { z } from "zod";

import { passwordSchema, rulesFor } from "@/lib/password-policy";
import { isValidE164 } from "@/lib/phone";

/** Business accounts always use the privileged (strong) policy. */
export const PASSWORD_RULES = rulesFor("privileged");

export const strongPassword = passwordSchema("privileged");


export const phoneSchema = z
  .string()
  .trim()
  .refine(isValidE164, "Use international format, e.g. +9715xxxxxxx");

export const BUSINESS_TYPES = [
  "Beauty salon",
  "Barbershop",
  "Nail studio",
  "Spa & wellness",
  "Skin clinic",
  "Makeup studio",
  "Hair studio",
  "Other",
] as const;

export const PLANS = [
  {
    id: "starter" as const,
    name: "Starter",
    price: "Free",
    tagline: "For a single chair getting started",
    features: ["1 location", "Up to 3 staff", "Online bookings", "Basic dashboard"],
  },
  {
    id: "professional" as const,
    name: "Professional",
    price: "AED 199 / mo",
    tagline: "For growing salons with a full team",
    features: [
      "Up to 3 locations",
      "Unlimited staff",
      "Marketing & campaigns",
      "Advanced analytics",
      "Waitlist & auto-booking",
    ],
  },
  {
    id: "enterprise" as const,
    name: "Enterprise",
    price: "Talk to us",
    tagline: "Multi-branch groups and franchises",
    features: [
      "Unlimited locations",
      "Custom roles & permissions",
      "API access",
      "Dedicated success manager",
      "Priority support",
    ],
  },
];

export const businessDetailsSchema = z.object({
  name: z.string().trim().min(2, "Business name is required").max(120),
  businessType: z.string().trim().max(80).optional().default(""),
  categories: z
    .array(z.string().trim().min(2).max(60))
    .min(1, "Pick at least one category")
    .max(13),
  description: z.string().trim().max(2000).optional().default(""),
  businessEmail: z.string().trim().email("Enter a valid business email").max(255),
  businessPhone: phoneSchema,
  website: z.string().trim().max(255).optional().default(""),
  instagram: z.string().trim().max(255).optional().default(""),
  facebook: z.string().trim().max(255).optional().default(""),
  tiktok: z.string().trim().max(255).optional().default(""),
  country: z.string().trim().min(2, "Country is required").max(80),
  countryCode: z.string().trim().length(2).default("DZ"),
  city: z.string().trim().min(2, "City is required").max(80),
  district: z.string().trim().max(80).optional().default(""),
  address: z.string().trim().min(4, "Address is required").max(255),
  postalCode: z.string().trim().max(20).optional().default(""),
  mapsUrl: z.string().trim().max(500).optional().default(""),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  opensAt: z.string().regex(/^\d{2}:\d{2}$/),
  closesAt: z.string().regex(/^\d{2}:\d{2}$/),
  employeeCount: z.number().int().min(1).max(2000).optional().default(1),
  branchCount: z.number().int().min(1).max(500).optional().default(1),
  services: z.array(z.string().trim().min(1).max(80)).max(20).optional().default([]),
  // Signed storage URLs carry a long JWT token, so allow generous lengths.
  logoUrl: z.string().trim().max(4000).optional().default(""),
  coverUrl: z.string().trim().max(4000).optional().default(""),
  galleryUrls: z.array(z.string().trim().max(4000)).max(12).optional().default([]),
  plan: z.enum(["starter", "professional", "enterprise"]).optional().default("starter"),
});


export const businessRegistrationSchema = z.object({
  userId: z.string().uuid(),
  business: businessDetailsSchema,
});

export type BusinessDetails = z.infer<typeof businessDetailsSchema>;
export type BusinessRegistration = z.infer<typeof businessRegistrationSchema>;
