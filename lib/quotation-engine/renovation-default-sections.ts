export type ScopeCategory =
  | "HACKING_DEMOLITION"
  | "MASONRY_WORKS"
  | "CARPENTRY"
  | "ELECTRICAL_WORKS"
  | "PLUMBING_WORKS"
  | "CEILING_PARTITION"
  | "FLOORING"
  | "PAINTING_WORKS"
  | "GLASS_ALUMINIUM"
  | "CLEANING_DISPOSAL"
  | "OTHER";

export type LineItemType =
  | "SUPPLY"
  | "INSTALL"
  | "SUPPLY_AND_INSTALL"
  | "LABOR"
  | "MATERIAL"
  | "SERVICE"
  | "CREDIT"
  | "OTHER";

export type BuilderLineItemInput = {
  sku: string;
  description: string;
  specification?: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  costPrice: number;
  remarks?: string;
  itemType: LineItemType;
  isIncluded: boolean;
  isOptional: boolean;
};

export type BuilderSectionInput = {
  category: ScopeCategory;
  title: string;
  description?: string;
  isIncluded: boolean;
  isOptional: boolean;
  remarks?: string;
  lineItems: BuilderLineItemInput[];
};

export const defaultRenovationSections: BuilderSectionInput[] = [
  {
    category: "HACKING_DEMOLITION",
    title: "Hacking & Demolition",
    description: "Removal of existing finishes, fixtures, and unwanted built-ins.",
    isIncluded: true,
    isOptional: false,
    lineItems: [
      {
        sku: "",
        description: "Hack and dispose existing floor finishes",
        unit: "sqft",
        quantity: 0,
        unitPrice: 6,
        costPrice: 0,
        itemType: "SERVICE",
        isIncluded: true,
        isOptional: false,
      },
    ],
  },
  {
    category: "MASONRY_WORKS",
    title: "Masonry Works",
    description: "Brickwork, screeding, tiling base preparation, and wet works.",
    isIncluded: true,
    isOptional: false,
    lineItems: [
      {
        sku: "",
        description: "Floor screeding and leveling",
        unit: "sqft",
        quantity: 0,
        unitPrice: 4.5,
        costPrice: 0,
        itemType: "SUPPLY_AND_INSTALL",
        isIncluded: true,
        isOptional: false,
      },
    ],
  },
  {
    category: "CARPENTRY",
    title: "Carpentry",
    description: "Custom-built carpentry, cabinetry, wardrobes, and storage.",
    isIncluded: true,
    isOptional: false,
    lineItems: [
      {
        sku: "",
        description: "Supply and install custom carpentry",
        unit: "ft run",
        quantity: 0,
        unitPrice: 180,
        costPrice: 0,
        itemType: "SUPPLY_AND_INSTALL",
        isIncluded: true,
        isOptional: false,
      },
    ],
  },
  {
    category: "ELECTRICAL_WORKS",
    title: "Electrical Works",
    description: "New lighting points, rewiring, switches, sockets, and accessories.",
    isIncluded: true,
    isOptional: false,
    lineItems: [
      {
        sku: "",
        description: "Supply and install lighting point",
        unit: "point",
        quantity: 0,
        unitPrice: 85,
        costPrice: 0,
        itemType: "SUPPLY_AND_INSTALL",
        isIncluded: true,
        isOptional: false,
      },
    ],
  },
  {
    category: "PLUMBING_WORKS",
    title: "Plumbing Works",
    description: "Water points, sanitary fixtures, rerouting, and installation.",
    isIncluded: true,
    isOptional: false,
    lineItems: [
      {
        sku: "",
        description: "Supply and install plumbing point",
        unit: "point",
        quantity: 0,
        unitPrice: 120,
        costPrice: 0,
        itemType: "SUPPLY_AND_INSTALL",
        isIncluded: true,
        isOptional: false,
      },
    ],
  },
  {
    category: "CEILING_PARTITION",
    title: "Ceiling & Partition",
    description: "False ceiling, partitions, bulkheads, and concealed features.",
    isIncluded: true,
    isOptional: false,
    lineItems: [
      {
        sku: "",
        description: "Supply and install gypsum board ceiling",
        unit: "sqft",
        quantity: 0,
        unitPrice: 8.5,
        costPrice: 0,
        itemType: "SUPPLY_AND_INSTALL",
        isIncluded: true,
        isOptional: false,
      },
    ],
  },
  {
    category: "FLOORING",
    title: "Flooring",
    description: "Vinyl, tile, timber, stone, and surface finishing works.",
    isIncluded: true,
    isOptional: false,
    lineItems: [
      {
        sku: "",
        description: "Supply and install vinyl flooring",
        unit: "sqft",
        quantity: 0,
        unitPrice: 7.5,
        costPrice: 0,
        itemType: "SUPPLY_AND_INSTALL",
        isIncluded: true,
        isOptional: false,
      },
    ],
  },
  {
    category: "PAINTING_WORKS",
    title: "Painting Works",
    description: "Painting preparation, skim coat, undercoat, and finishing.",
    isIncluded: true,
    isOptional: false,
    lineItems: [
      {
        sku: "",
        description: "Paint wall and ceiling surfaces",
        unit: "sqft",
        quantity: 0,
        unitPrice: 2.8,
        costPrice: 0,
        itemType: "SUPPLY_AND_INSTALL",
        isIncluded: true,
        isOptional: false,
      },
    ],
  },
  {
    category: "GLASS_ALUMINIUM",
    title: "Glass & Aluminium",
    description: "Shower screens, mirrors, windows, and aluminium framing.",
    isIncluded: true,
    isOptional: false,
    lineItems: [
      {
        sku: "",
        description: "Supply and install tempered glass panel",
        unit: "sqft",
        quantity: 0,
        unitPrice: 28,
        costPrice: 0,
        itemType: "SUPPLY_AND_INSTALL",
        isIncluded: true,
        isOptional: false,
      },
    ],
  },
  {
    category: "CLEANING_DISPOSAL",
    title: "Cleaning & Debris Disposal",
    description: "Final cleaning, haulage, debris removal, and handover prep.",
    isIncluded: true,
    isOptional: false,
    lineItems: [
      {
        sku: "",
        description: "Final cleaning and debris disposal",
        unit: "lot",
        quantity: 1,
        unitPrice: 450,
        costPrice: 0,
        itemType: "SERVICE",
        isIncluded: true,
        isOptional: false,
      },
    ],
  },
];
