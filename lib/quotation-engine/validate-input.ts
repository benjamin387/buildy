import { z } from "zod";

export const quotationInputSchema = z.object({
  clientName: z.string().min(1),
  projectName: z.string().min(1),
  roomType: z.enum([
    "KITCHEN",
    "WARDROBE",
    "LIVING_ROOM",
    "BEDROOM",
    "STUDY",
    "BATHROOM",
  ]),
  lengthFt: z.number().positive(),
  heightFt: z.number().positive(),
  depthFt: z.number().positive(),
  cabinetUnits: z.number().int().nonnegative(),
  drawerCount: z.number().int().nonnegative(),
  doorPanels: z.number().int().nonnegative(),
  finishType: z.enum(["LAMINATE", "VENEER"]),
  surfaceType: z.enum(["QUARTZ", "SOLID_SURFACE"]),
  boardType: z.enum(["PLYWOOD"]),
});

export type QuotationInput = z.infer<typeof quotationInputSchema>;

export function validateQuotationInput(input: unknown): QuotationInput {
  return quotationInputSchema.parse(input);
}