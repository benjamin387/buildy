import { QuotationInput } from "./validate-input";
import {
  calculateCarcassArea,
  calculateCountertopArea,
  calculateFrontageArea,
} from "./calculators/area";

export type QuoteLineItem = {
  label: string;
  formula: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  total: number;
};

const rates = {
  finish: {
    LAMINATE: 8.5,
    VENEER: 15.5,
  },
  surface: {
    QUARTZ: 32,
    SOLID_SURFACE: 24,
  },
  board: {
    PLYWOOD: 11,
  },
  hardware: {
    hinge: 7,
    drawerRail: 22,
    softClose: 58,
  },
} as const;

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

export function buildLineItems(input: QuotationInput): QuoteLineItem[] {
  const frontageArea = calculateFrontageArea(input.lengthFt, input.heightFt);
  const countertopArea = calculateCountertopArea(input.lengthFt, input.depthFt);
  const carcassArea = calculateCarcassArea(input.lengthFt, input.heightFt);

  return [
    {
      label: input.finishType === "LAMINATE" ? "Premium Laminate Finish" : "Natural Veneer Finish",
      formula: `${input.lengthFt} × ${input.heightFt} frontage`,
      quantity: frontageArea,
      unit: "sqft",
      unitPrice: rates.finish[input.finishType],
      total: round(frontageArea * rates.finish[input.finishType]),
    },
    {
      label: "Marine Plywood Carcass",
      formula: `${input.lengthFt} × ${input.heightFt} × 1.18 carcass factor`,
      quantity: carcassArea,
      unit: "sqft",
      unitPrice: rates.board[input.boardType],
      total: round(carcassArea * rates.board[input.boardType]),
    },
    {
      label: input.surfaceType === "QUARTZ" ? "Quartz Countertop" : "Solid Surface Top",
      formula: `${input.lengthFt} × ${input.depthFt} countertop`,
      quantity: countertopArea,
      unit: "sqft",
      unitPrice: rates.surface[input.surfaceType],
      total: round(countertopArea * rates.surface[input.surfaceType]),
    },
    {
      label: "Premium Hinges",
      formula: `${input.doorPanels} door panels × 2 hinges`,
      quantity: input.doorPanels * 2,
      unit: "pcs",
      unitPrice: rates.hardware.hinge,
      total: round(input.doorPanels * 2 * rates.hardware.hinge),
    },
    {
      label: "Drawer Rail",
      formula: `${input.drawerCount} drawers`,
      quantity: input.drawerCount,
      unit: "set",
      unitPrice: rates.hardware.drawerRail,
      total: round(input.drawerCount * rates.hardware.drawerRail),
    },
    {
      label: "Soft-Close Accessory Set",
      formula: `${input.cabinetUnits} cabinet units`,
      quantity: input.cabinetUnits,
      unit: "set",
      unitPrice: rates.hardware.softClose,
      total: round(input.cabinetUnits * rates.hardware.softClose),
    },
  ];
}