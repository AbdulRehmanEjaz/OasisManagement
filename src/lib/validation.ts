import { z } from "zod";
export const structureTypes = ["Concrete/Blocks Building", "Animal Shelters", "Metal Structures"] as const;
export const submissionWasteTypes = ["Mixed domestic wastes (Rubber – Plastics – carton - old barrel - old pipes - wood)"] as const;
export const wasteTypes = [
  "Palm Waste",
  "Tree Branches",
  "Pruning Waste",
  "Dry Leaves",
  "Grass and Weeds",
  "Mixed Agricultural Waste",
  "Other",
];
export const units = [
  "Kilograms (kg)",
  "Tonnes",
  "Cubic Meters (m³)",
  "Bags",
  "Piles",
];
export const facilityCategories = [
  "Office / Site Cabin",
  "Worker Accommodation",
  "Toilets / Washrooms",
  "Storage",
  "Water Supply Facility",
  "Electrical / Generator Facility",
  "Waste Collection Facility",
  "Other",
];
export const statuses = [
  "Operational",
  "Needs Attention",
  "Under Maintenance",
  "Out of Service",
];
export const reportSchema = z
  .object({
    kind: z.enum(["waste", "inspection"]),
    idempotency_key: z.uuid(),
    location_id: z.uuid(),
    photo_ids: z
      .array(z.uuid())
      .min(2)
      .max(3)
      .refine(
        (a) => new Set(a).size === a.length,
        "Photographs must be distinct",
      ),
    category: z.string().max(100).optional(),
    site: z.string().trim().max(200).optional(),
    structure_type: z.enum(structureTypes).optional(),
    quantity: z.number().positive().max(100000000).optional(),
    unit: z.string().max(50).optional(),
    description: z.string().max(4000).default(""),
    facility_id: z.uuid().optional(),
    condition: z.string().max(100).optional(),
    inspection_date: z.iso.date().optional(),
  })
  .superRefine((v, c) => {
    const error = (message: string) => c.addIssue({ code: "custom", message });
    if (v.kind === "waste") {
      if (!v.category || !v.quantity || !v.unit)
        error("Waste type, quantity and unit are required.");
      if (v.category === "Other" && !v.description.trim())
        error("Describe the other waste type.");
    } else if (
      !v.site ||
      !v.structure_type ||
      !v.description.trim()
    )
      error("Site name, structure type and observations are required.");
  });
export const locationSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy: z.number().positive(),
  captured_at: z.iso.datetime({ offset: true }),
});
export function validateGPS(
  v: z.infer<typeof locationSchema>,
  threshold = 20,
  now = Date.now(),
) {
  const parsed = locationSchema.parse(v);
  const age = now - Date.parse(parsed.captured_at);
  if (age < -10000 || age > 300000)
    throw new Error("GPS reading expired. Capture your location again.");
  if (parsed.accuracy > threshold)
    throw new Error(
      `GPS accuracy must be within ${threshold} meters. Please recapture outdoors.`,
    );
  return parsed;
}
export const facilitySchema = z.object({
  name: z.string().trim().min(2).max(200),
  category: z.string().min(1).max(100),
  site: z.string().trim().min(1).max(200),
  structure_type: z.enum(structureTypes).optional(),
  description: z.string().max(4000).default(""),
  status: z.string().min(1).max(100),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  assigned_supervisor: z.uuid().nullable().default(null),
  remarks: z.string().max(4000).default(""),
  photo_ids: z.array(z.uuid()).max(3).default([]),
});
export function canManage(role: string) {
  return role === "admin";
}
