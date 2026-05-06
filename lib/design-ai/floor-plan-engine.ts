import "server-only";

export type FloorPlanStatus = "AI_READY" | "REVIEW_PENDING" | "LAYOUT_CAPTURED";

export type FloorPlanRoomDetection = {
  name: string;
  type: string;
  areaLabel: string;
  confidence: "High" | "Medium";
  designIntent: string;
  keyObservations: string[];
};

export type FloorPlanFurnitureLegendItem = {
  code: string;
  room: string;
  item: string;
  placement: string;
};

export type FloorPlanFurnitureLayoutSectionKey =
  | "living-dining"
  | "kitchen"
  | "bedrooms"
  | "bathrooms"
  | "balcony-yard";

export type FloorPlanFurnitureLayoutItem = {
  legendNumber: number;
  roomName: string;
  furnitureItem: string;
  placementReason: string;
  clearanceNote: string;
  dimensionsEstimate: string;
};

export type FloorPlanFurnitureLayoutSection = {
  key: FloorPlanFurnitureLayoutSectionKey;
  title: string;
  items: FloorPlanFurnitureLayoutItem[];
};

export type FloorPlanFurnitureLayoutResult = {
  designRules: string[];
  sections: FloorPlanFurnitureLayoutSection[];
  designerNotes: string[];
  qsNotes: string[];
};

export type FloorPlanPaletteItem = {
  label: string;
  material: string;
  finish: string;
  application: string;
  hex: string;
};

export type FloorPlanPerspectivePrompt = {
  title: string;
  prompt: string;
};

export const FLOOR_PLAN_PERSPECTIVE_STYLES = [
  "Modern Luxe",
  "Japandi",
  "Minimalist",
  "Warm Wood",
  "Hotel-Inspired",
  "Contemporary",
] as const;

export type FloorPlanPerspectiveStyle =
  (typeof FLOOR_PLAN_PERSPECTIVE_STYLES)[number];

export type FloorPlanPerspectiveConcept = {
  viewTitle: string;
  cameraAngleDescription: string;
  designStyle: FloorPlanPerspectiveStyle;
  colorPalette: string[];
  materialPalette: string[];
  lightingDirection: string;
  furnitureCarpentryDetails: string[];
  imageGenerationPrompt: string;
};

export type FloorPlanPerspectiveConceptPackage = {
  style: FloorPlanPerspectiveStyle;
  artistIllustrationPrompt: string;
  perspectives: FloorPlanPerspectiveConcept[];
  designerNotes: string[];
};

export type FloorPlanCarpentryNote = {
  zone: string;
  title: string;
  note: string;
};

export type FloorPlanWorkflowStep = {
  phase: string;
  owner: string;
  duration: string;
  deliverable: string;
};

export type FloorPlanRecord = {
  id: string;
  projectName: string;
  clientName: string;
  propertyType: string;
  siteLabel: string;
  sourceFileName: string;
  floorArea: string;
  status: FloorPlanStatus;
  summary: string;
  readinessNote: string;
  lastAnalyzedAt: string;
  roomDetections: FloorPlanRoomDetection[];
  furnitureLegend: FloorPlanFurnitureLegendItem[];
  palette: FloorPlanPaletteItem[];
  perspectivePrompts: FloorPlanPerspectivePrompt[];
  carpentryNotes: FloorPlanCarpentryNote[];
  workflowSteps: FloorPlanWorkflowStep[];
};

const MOCK_FLOOR_PLANS: FloorPlanRecord[] = [
  {
    id: "fp-marina-bay-residence",
    projectName: "Marina Bay Residence",
    clientName: "Tan Family",
    propertyType: "Condominium",
    siteLabel: "Tower B, Level 18",
    sourceFileName: "marina-bay-level18-plan.pdf",
    floorArea: "1,420 sqft",
    status: "AI_READY",
    summary:
      "Three-bedroom plan interpreted with strong entertaining zones, concealed family storage, and a hospitality-led master suite sequence.",
    readinessNote: "Room zoning is stable enough for concept briefing and carpentry budgeting.",
    lastAnalyzedAt: "2026-05-05T10:30:00.000Z",
    roomDetections: [
      {
        name: "Arrival Foyer",
        type: "Entry",
        areaLabel: "65 sqft",
        confidence: "High",
        designIntent: "Frame arrival with an integrated bench and concealed shoe storage.",
        keyObservations: ["Direct sightline into living space", "Service yard entry kept outside guest view"],
      },
      {
        name: "Living and Dining",
        type: "Social Zone",
        areaLabel: "340 sqft",
        confidence: "High",
        designIntent: "Create a lounge-first layout with an eight-seater dining axis.",
        keyObservations: ["Long facade supports layered lighting", "TV wall can anchor circulation without narrowing walkway"],
      },
      {
        name: "Dry Kitchen",
        type: "Kitchen",
        areaLabel: "118 sqft",
        confidence: "High",
        designIntent: "Position prep and hosting functions as a semi-open show kitchen.",
        keyObservations: ["Strong adjacency to dining", "Island length can be increased without blocking service access"],
      },
      {
        name: "Master Suite",
        type: "Bedroom",
        areaLabel: "228 sqft",
        confidence: "High",
        designIntent: "Blend sleeping, vanity, and wardrobe functions into one calm suite.",
        keyObservations: ["Good wall length for wardrobe run", "Bed orientation aligns with window symmetry"],
      },
      {
        name: "Study Lounge",
        type: "Flexible Room",
        areaLabel: "106 sqft",
        confidence: "Medium",
        designIntent: "Operate as guest room, study, and media spillover zone.",
        keyObservations: ["Pocket door can preserve openness", "Storage depth needs tight coordination with sofa bed clearance"],
      },
    ],
    furnitureLegend: [
      { code: "A1", room: "Living and Dining", item: "4-seat sofa", placement: "Float centrally to define lounge zone facing feature wall." },
      { code: "A2", room: "Living and Dining", item: "8-seat dining table", placement: "Align with facade to keep clear path from foyer to balcony." },
      { code: "K1", room: "Dry Kitchen", item: "Quartz island", placement: "Center on kitchen axis with bar seating facing dining." },
      { code: "M1", room: "Master Suite", item: "King bed", placement: "Place against solid internal wall to preserve full-height glazing." },
      { code: "S1", room: "Study Lounge", item: "Sofa bed", placement: "Set along window wall with fold-out clearance toward center." },
    ],
    palette: [
      { label: "Gallery White", material: "Low-sheen paint", finish: "Eggshell", application: "Main wall field", hex: "#EDE9E2" },
      { label: "Travertine Sand", material: "Sintered stone", finish: "Honed", application: "Feature wall and island", hex: "#D8C9B3" },
      { label: "Walnut Ember", material: "Timber veneer", finish: "Open grain matte", application: "Carpentry fronts and fluted panels", hex: "#6B4A34" },
      { label: "Champagne Bronze", material: "Metal trim", finish: "Brushed", application: "Handles, frames, and accent rails", hex: "#B48A64" },
    ],
    perspectivePrompts: [
      {
        title: "Living room hero perspective",
        prompt:
          "Luxury condominium living room, warm walnut fluted TV wall, travertine feature slab, low modular sofa, sheer curtain glow, champagne bronze details, editorial wide-angle interior render.",
      },
      {
        title: "Kitchen and dining perspective",
        prompt:
          "Premium dry kitchen with stone island, sculptural pendant lights, eight-seater dining table, layered indirect lighting, soft beige palette, hospitality-inspired condominium interior render.",
      },
      {
        title: "Master suite perspective",
        prompt:
          "Calm master bedroom with hotel-style upholstered headboard, concealed wardrobe wall, vanity niche lighting, walnut and stone mix, refined luxury condo interior render.",
      },
    ],
    carpentryNotes: [
      {
        zone: "Foyer",
        title: "Full-height utility wall",
        note: "Combine shoe storage, umbrella pocket, and concealed DB access behind one flush veneer elevation.",
      },
      {
        zone: "Living and Dining",
        title: "Feature wall coordination",
        note: "Reserve service cavity for TV points, soundbar recess, and linear ambient lighting before stone cladding lock-in.",
      },
      {
        zone: "Dry Kitchen",
        title: "Display cabinetry",
        note: "Use smoked glass overhead units with concealed warm strip lighting to elevate entertaining function without visual clutter.",
      },
      {
        zone: "Master Suite",
        title: "Wardrobe and vanity merge",
        note: "Treat wardrobe return and vanity as one composition to avoid a fragmented bedroom elevation.",
      },
    ],
    workflowSteps: [
      { phase: "01. Layout intake", owner: "Design AI", duration: "Same day", deliverable: "Detected zoning and room labels" },
      { phase: "02. Designer validation", owner: "Interior Designer", duration: "1 day", deliverable: "Confirmed circulation and furniture assumptions" },
      { phase: "03. Mood and palette lock", owner: "Design Lead", duration: "2 days", deliverable: "Approved color and material direction" },
      { phase: "04. Carpentry detailing", owner: "Technical Designer", duration: "3 days", deliverable: "Built-in scope and workshop notes" },
      { phase: "05. 3D prompt generation", owner: "Visualization Team", duration: "1 day", deliverable: "Prompt pack for perspective production" },
      { phase: "06. Renovation handoff", owner: "Project Manager", duration: "1 day", deliverable: "Execution sequence for costing and scheduling" },
    ],
  },
  {
    id: "fp-orchard-sky-villa",
    projectName: "Orchard Sky Villa",
    clientName: "Lim Household",
    propertyType: "Penthouse",
    siteLabel: "Sky Villa, Level 32",
    sourceFileName: "orchard-sky-villa-rev2.png",
    floorArea: "2,080 sqft",
    status: "REVIEW_PENDING",
    summary:
      "Large-format penthouse layout with strong perimeter glazing and a high-value opportunity to stage entertainment, family lounge, and dressing functions more clearly.",
    readinessNote: "Material and 3D direction are ready; wet area planning still needs a designer review.",
    lastAnalyzedAt: "2026-05-04T15:00:00.000Z",
    roomDetections: [
      {
        name: "Private Lift Lobby",
        type: "Entry",
        areaLabel: "84 sqft",
        confidence: "High",
        designIntent: "Convert arrival zone into a gallery-like reception threshold.",
        keyObservations: ["Lift arrival is fully private", "Enough wall length for sculptural console and art lighting"],
      },
      {
        name: "Grand Salon",
        type: "Social Zone",
        areaLabel: "470 sqft",
        confidence: "High",
        designIntent: "Create dual seating clusters for hosting and family movie use.",
        keyObservations: ["Facade length supports two functional zones", "Column position can be absorbed into joinery composition"],
      },
      {
        name: "Formal Dining",
        type: "Dining",
        areaLabel: "210 sqft",
        confidence: "High",
        designIntent: "Anchor dining as a dedicated entertaining room with statement lighting.",
        keyObservations: ["Straight adjacency to kitchen suite", "Views justify a more ceremonial furniture arrangement"],
      },
      {
        name: "Primary Suite",
        type: "Bedroom",
        areaLabel: "360 sqft",
        confidence: "High",
        designIntent: "Sequence sleep, dressing, and lounge functions into a hotel-grade retreat.",
        keyObservations: ["Strong proportions for island wardrobe", "Vanity zone can be shielded from bed view"],
      },
      {
        name: "Children Wing",
        type: "Bedroom Cluster",
        areaLabel: "315 sqft",
        confidence: "Medium",
        designIntent: "Balance study, sleeping, and high-density storage across paired rooms.",
        keyObservations: ["Shared passage can absorb linen joinery", "Bed and desk placement depends on power point confirmation"],
      },
    ],
    furnitureLegend: [
      { code: "G1", room: "Grand Salon", item: "Main lounge sofa cluster", placement: "Center on skyline view with rug defining primary conversation zone." },
      { code: "G2", room: "Grand Salon", item: "Secondary lounge chairs", placement: "Place near glazing for a reading and cocktails pocket." },
      { code: "D1", room: "Formal Dining", item: "10-seat dining table", placement: "Run parallel to glazing to preserve ceremonial entry sightline." },
      { code: "P1", room: "Primary Suite", item: "Bedroom lounge bench", placement: "Position at bed foot to soften transition into dressing area." },
      { code: "C1", room: "Children Wing", item: "Integrated study desks", placement: "Install below window where natural light benefits homework use." },
    ],
    palette: [
      { label: "Pearl Limestone", material: "Large-format porcelain", finish: "Soft matte", application: "Main floor finish", hex: "#DCD6CC" },
      { label: "Taupe Mist", material: "Wall paint", finish: "Ultra matte", application: "Perimeter walls", hex: "#C8B8A6" },
      { label: "Fumed Oak", material: "Timber veneer", finish: "Wire brushed", application: "Feature joinery and bedroom carpentry", hex: "#745A47" },
      { label: "Onyx Graphite", material: "Metal and stone accent", finish: "Satin", application: "Trim, loose furniture accents, and wet vanity detailing", hex: "#454240" },
    ],
    perspectivePrompts: [
      {
        title: "Grand salon perspective",
        prompt:
          "Ultra-luxury penthouse salon, dual seating clusters, panoramic city glazing, fumed oak cabinetry, taupe limestone floor, sculptural chandelier, sophisticated editorial interior render.",
      },
      {
        title: "Formal dining perspective",
        prompt:
          "Formal penthouse dining room with ten-seat table, statement chandelier, floor-to-ceiling windows, tailored taupe and graphite palette, high-end hospitality interior render.",
      },
      {
        title: "Primary suite perspective",
        prompt:
          "Luxury primary suite with integrated dressing zone, custom headboard wall, lounge corner, muted taupe palette, fumed oak joinery, premium penthouse render.",
      },
    ],
    carpentryNotes: [
      {
        zone: "Lift Lobby",
        title: "Gallery storage spine",
        note: "Hide household storage behind flush wall panels so the private arrival sequence reads as curated rather than utilitarian.",
      },
      {
        zone: "Grand Salon",
        title: "Column integration",
        note: "Wrap the structural column into a full composition with shelving, mirror, and concealed bar storage.",
      },
      {
        zone: "Primary Suite",
        title: "Dressing island feasibility",
        note: "Confirm circulation width before committing to a center island wardrobe with jewelry and watch drawers.",
      },
      {
        zone: "Children Wing",
        title: "Modular study joinery",
        note: "Keep desk carcasses modular so each room can shift between child, teen, or guest use over time.",
      },
    ],
    workflowSteps: [
      { phase: "01. Layout capture", owner: "Design AI", duration: "Same day", deliverable: "Spatial labels and key dimensions assumptions" },
      { phase: "02. Wet area review", owner: "Technical Designer", duration: "1 day", deliverable: "Kitchen and bathroom constraints clarified" },
      { phase: "03. Furniture test fit", owner: "Interior Designer", duration: "2 days", deliverable: "Entertaining and family zoning approved" },
      { phase: "04. Material direction", owner: "Design Lead", duration: "2 days", deliverable: "Penthouse palette board and finishes hierarchy" },
      { phase: "05. Joinery package", owner: "Carpentry Team", duration: "3 days", deliverable: "Custom carpentry notes for costing" },
      { phase: "06. Visualization and costing", owner: "Visualization and QS", duration: "2 days", deliverable: "Prompt pack and preliminary budget alignment" },
    ],
  },
  {
    id: "fp-bukit-timah-family-home",
    projectName: "Bukit Timah Family Home",
    clientName: "Ng Family",
    propertyType: "Landed",
    siteLabel: "Ground and Level 2",
    sourceFileName: "bukit-timah-family-home-scan.jpg",
    floorArea: "2,760 sqft",
    status: "LAYOUT_CAPTURED",
    summary:
      "Multi-storey landed home layout captured successfully, with family-centric zoning opportunities and a strong custom carpentry scope across common areas and bedrooms.",
    readinessNote: "Room detection is complete, but prompt generation should wait for staircase and bathroom validation.",
    lastAnalyzedAt: "2026-05-03T08:20:00.000Z",
    roomDetections: [
      {
        name: "Family Lounge",
        type: "Social Zone",
        areaLabel: "390 sqft",
        confidence: "High",
        designIntent: "Keep the main family lounge relaxed and storage-rich for daily use.",
        keyObservations: ["Central staircase shapes the room sequence", "Deep wall length supports mixed closed and open joinery"],
      },
      {
        name: "Wet and Dry Kitchen",
        type: "Kitchen Cluster",
        areaLabel: "260 sqft",
        confidence: "Medium",
        designIntent: "Separate heavy cooking from hosting and breakfast routines.",
        keyObservations: ["Two-zone kitchen logic is viable", "Service circulation needs clearer appliance and plumbing verification"],
      },
      {
        name: "Primary Bedroom",
        type: "Bedroom",
        areaLabel: "285 sqft",
        confidence: "High",
        designIntent: "Turn the bedroom into a calm suite with integrated vanity and wardrobe storage.",
        keyObservations: ["Window placements support symmetrical bed wall options", "Long side wall can absorb a full wardrobe run"],
      },
      {
        name: "Children Bedrooms",
        type: "Bedroom Cluster",
        areaLabel: "410 sqft",
        confidence: "Medium",
        designIntent: "Prioritize adaptive study, display, and wardrobe systems for growing children.",
        keyObservations: ["Storage density should vary room by room", "Desk placement depends on natural light priorities"],
      },
      {
        name: "Attic Flex Room",
        type: "Multi-use Room",
        areaLabel: "190 sqft",
        confidence: "Medium",
        designIntent: "Stage attic as a hybrid hobby, guest, and storage room.",
        keyObservations: ["Sloped ceiling impacts wardrobe height", "Loose furniture should stay low-profile near eaves"],
      },
    ],
    furnitureLegend: [
      { code: "F1", room: "Family Lounge", item: "Sectional sofa", placement: "Face staircase feature wall while keeping circulation to dining open." },
      { code: "F2", room: "Family Lounge", item: "Reading armchair pair", placement: "Nest beside window bay to create a quiet corner." },
      { code: "K1", room: "Wet and Dry Kitchen", item: "Breakfast counter", placement: "Set at dry kitchen edge to bridge family use and hosting." },
      { code: "P1", room: "Primary Bedroom", item: "King bed and side tables", placement: "Center against longest uninterrupted wall for balanced elevation." },
      { code: "A1", room: "Attic Flex Room", item: "Low daybed", placement: "Place below sloped ceiling zone to preserve head height through room center." },
    ],
    palette: [
      { label: "Warm Plaster", material: "Mineral paint", finish: "Soft matte", application: "Shared spaces and stair hall", hex: "#E4DDD0" },
      { label: "Natural Oak", material: "Timber veneer", finish: "Clear matte", application: "Family joinery and wardrobes", hex: "#9A7A58" },
      { label: "Olive Stone", material: "Porcelain slab", finish: "Leathered", application: "Kitchen and vanity counters", hex: "#86806F" },
      { label: "Soft Black", material: "Metal trim", finish: "Powder-coated matte", application: "Frames, handles, and stair detailing", hex: "#2F2C2A" },
    ],
    perspectivePrompts: [
      {
        title: "Family lounge perspective",
        prompt:
          "Elegant landed home family lounge, warm plaster walls, natural oak cabinetry, soft black accents, sectional sofa, layered ambient lighting, upscale family interior render.",
      },
      {
        title: "Kitchen cluster perspective",
        prompt:
          "Refined landed home wet and dry kitchen, olive stone counters, natural oak joinery, breakfast counter, layered task lighting, practical luxury interior render.",
      },
      {
        title: "Attic flex room perspective",
        prompt:
          "Cozy attic flex room with low-profile daybed, custom storage under eaves, soft neutral palette, study and hobby corner, boutique residential render.",
      },
    ],
    carpentryNotes: [
      {
        zone: "Family Lounge",
        title: "Storage-led feature wall",
        note: "Use alternating closed panels and display niches so the lounge can absorb toys, media, and family keepsakes without visual noise.",
      },
      {
        zone: "Kitchen Cluster",
        title: "Appliance zoning",
        note: "Dry pantry, tall oven stack, and breakfast storage should be grouped to keep the wet kitchen free for heavy prep.",
      },
      {
        zone: "Primary Bedroom",
        title: "Wardrobe segmentation",
        note: "Break wardrobes into daily, seasonal, and accessory zones to keep long elevations feeling intentional instead of repetitive.",
      },
      {
        zone: "Attic Flex Room",
        title: "Low-height detailing",
        note: "Specify drawer modules and open ledges below the eaves rather than forcing full-height cabinetry into compromised headroom.",
      },
    ],
    workflowSteps: [
      { phase: "01. Multi-level parsing", owner: "Design AI", duration: "Same day", deliverable: "Per-floor zoning and room grouping" },
      { phase: "02. Stair and wet area validation", owner: "Technical Designer", duration: "1 day", deliverable: "Critical circulation constraints confirmed" },
      { phase: "03. Family storage strategy", owner: "Interior Designer", duration: "2 days", deliverable: "Room-by-room storage priorities" },
      { phase: "04. Carpentry briefing", owner: "Design Lead", duration: "2 days", deliverable: "Built-in scope for bedrooms and lounge" },
      { phase: "05. Prompt generation", owner: "Visualization Team", duration: "1 day", deliverable: "3D prompt pack once geometry is signed off" },
      { phase: "06. Renovation sequencing", owner: "Project Manager", duration: "2 days", deliverable: "Site workflow aligned to family occupancy needs" },
    ],
  },
];

export function listMockFloorPlans(): FloorPlanRecord[] {
  return MOCK_FLOOR_PLANS;
}

export function getMockFloorPlanById(id: string): FloorPlanRecord | null {
  return MOCK_FLOOR_PLANS.find((plan) => plan.id === id) ?? null;
}

export function getDefaultMockFloorPlanId(): string {
  return MOCK_FLOOR_PLANS[0]?.id ?? "";
}

export function getMockFloorPlanMetrics() {
  return {
    totalPlans: MOCK_FLOOR_PLANS.length,
    readyPlans: MOCK_FLOOR_PLANS.filter((plan) => plan.status === "AI_READY").length,
    totalDetectedRooms: MOCK_FLOOR_PLANS.reduce((total, plan) => total + plan.roomDetections.length, 0),
    totalPerspectivePrompts: MOCK_FLOOR_PLANS.reduce((total, plan) => total + plan.perspectivePrompts.length, 0),
  };
}

const FURNITURE_LAYOUT_SECTION_ORDER: Array<{
  key: FloorPlanFurnitureLayoutSectionKey;
  title: string;
  optional?: boolean;
}> = [
  { key: "living-dining", title: "Living / Dining" },
  { key: "kitchen", title: "Kitchen" },
  { key: "bedrooms", title: "Bedrooms" },
  { key: "bathrooms", title: "Bathrooms" },
  { key: "balcony-yard", title: "Balcony / Yard", optional: true },
];

const FURNITURE_LAYOUT_RULES = [
  "Maintain walking clearance through primary circulation routes.",
  "Align TV wall with sofa wherever a lounge layout is proposed.",
  "Avoid blocking doors and windows with loose furniture or built-ins.",
  "Keep wet works near existing plumbing lines before technical sign-off.",
  "Separate storage elements from high-traffic zones to reduce pinch points.",
] as const;

type DraftFurnitureLayoutItem = Omit<FloorPlanFurnitureLayoutItem, "legendNumber">;

type PerspectiveStyleProfile = {
  overview: string;
  paletteAccents: string[];
  materialAccents: string[];
  lightingMood: string;
  promptKeywords: string[];
  designerNote: string;
};

type PerspectiveViewKey =
  | "entrance"
  | "living-dining"
  | "kitchen"
  | "master-bedroom"
  | "bathroom"
  | "balcony-landscape";

type PerspectiveViewDefinition = {
  key: PerspectiveViewKey;
  defaultRoomName: string;
  matcher: RegExp;
  getCameraAngleDescription: (roomName: string) => string;
  getLightingDirection: (profile: PerspectiveStyleProfile) => string;
  fallbackFurnitureCarpentryDetails: string[];
};

const PERSPECTIVE_STYLE_PROFILES: Record<
  FloorPlanPerspectiveStyle,
  PerspectiveStyleProfile
> = {
  "Modern Luxe": {
    overview:
      "Layer calm neutrals with sculptural stone, warm metal trims, and clean-lined luxury detailing.",
    paletteAccents: ["Soft greige", "Champagne highlight"],
    materialAccents: ["Fluted timber joinery", "Book-matched stone slab"],
    lightingMood: "warm cove lighting with quiet hospitality contrast",
    promptKeywords: [
      "modern luxe interior",
      "editorial realism",
      "tailored detailing",
    ],
    designerNote:
      "Keep the metal, stone, and timber hierarchy disciplined so the package reads premium rather than busy.",
  },
  Japandi: {
    overview:
      "Balance warm timber, tactile plaster, and reduced visual noise with soft Japanese-Scandinavian restraint.",
    paletteAccents: ["Bone white", "Muted taupe"],
    materialAccents: ["Natural oak grain", "Textured plaster wall"],
    lightingMood: "diffused daylight with low-glare concealed ambient lighting",
    promptKeywords: [
      "japandi interior",
      "serene composition",
      "natural textures",
    ],
    designerNote:
      "Simplify lines and let timber rhythm and negative space carry the composition.",
  },
  Minimalist: {
    overview:
      "Reduce ornament, sharpen geometry, and let proportion, texture, and shadow define the interior.",
    paletteAccents: ["Warm white", "Soft stone grey"],
    materialAccents: ["Matte lacquer planes", "Seamless stone surfaces"],
    lightingMood: "directional daylight with crisp concealed ceiling washes",
    promptKeywords: [
      "minimalist interior",
      "clean geometry",
      "quiet luxury",
    ],
    designerNote:
      "Keep joinery lines continuous and avoid introducing accent materials that break the calm envelope.",
  },
  "Warm Wood": {
    overview:
      "Push timber warmth forward with comfortable layering, soft contrasts, and family-friendly tactility.",
    paletteAccents: ["Honey beige", "Soft caramel"],
    materialAccents: ["Open-grain timber panels", "Textile-rich upholstery"],
    lightingMood: "golden ambient lighting with warm reflected light off timber surfaces",
    promptKeywords: [
      "warm wood interior",
      "inviting atmosphere",
      "residential comfort",
    ],
    designerNote:
      "Use the darker timber moments selectively so the scheme stays warm and open instead of heavy.",
  },
  "Hotel-Inspired": {
    overview:
      "Stage the interior like a refined hospitality suite with layered lighting, tailored upholstery, and composed focal walls.",
    paletteAccents: ["Mushroom beige", "Deep mocha"],
    materialAccents: ["Upholstered wall panels", "Bronzed metal detailing"],
    lightingMood: "soft feature lighting with flattering wall wash and bedside glow",
    promptKeywords: [
      "hotel-inspired interior",
      "hospitality styling",
      "premium suite mood",
    ],
    designerNote:
      "Focus on arrival sequence, bed wall composition, and lighting layers so the package feels intentionally choreographed.",
  },
  Contemporary: {
    overview:
      "Mix precise contemporary lines with a relaxed material palette and a lighter visual hand.",
    paletteAccents: ["Pale limestone", "Charcoal accent"],
    materialAccents: ["Slim-profile metal trim", "Matte veneer panels"],
    lightingMood: "balanced natural light with restrained linear ambient lighting",
    promptKeywords: [
      "contemporary interior",
      "refined residential styling",
      "clean material contrast",
    ],
    designerNote:
      "Let contrast come from proportion and a few crisp accents instead of high-contrast patterning.",
  },
};

const PERSPECTIVE_VIEW_DEFINITIONS: PerspectiveViewDefinition[] = [
  {
    key: "entrance",
    defaultRoomName: "Entrance Foyer",
    matcher: /(entry|foyer|lobby|arrival)/i,
    getCameraAngleDescription: (roomName) =>
      `Wide-angle arrival view from the ${roomName.toLowerCase()} threshold, framing the first sightline into the main living zone.`,
    getLightingDirection: (profile) =>
      `Front-lit from the entry threshold, supported by ${profile.lightingMood} across the ceiling edge and feature joinery.`,
    fallbackFurnitureCarpentryDetails: [
      "Integrate a concealed shoe cabinet, bench, and drop-off ledge into one flush elevation.",
      "Use a feature wall or framed console composition to make the arrival zone feel intentional on first view.",
    ],
  },
  {
    key: "living-dining",
    defaultRoomName: "Living / Dining",
    matcher: /(living|dining|salon|lounge)/i,
    getCameraAngleDescription: (roomName) =>
      `Editorial perspective across ${roomName.toLowerCase()}, keeping both the main seating axis and dining alignment in one balanced frame.`,
    getLightingDirection: (profile) =>
      `Pulled from the main facade glazing and reinforced with ${profile.lightingMood} on the TV wall, ceiling recess, and dining feature.`,
    fallbackFurnitureCarpentryDetails: [
      "Anchor the sofa and TV wall on a clean axis, then keep the dining line clear for entertaining circulation.",
      "Treat the feature wall, storage, and display moments as one composition rather than isolated built-ins.",
    ],
  },
  {
    key: "kitchen",
    defaultRoomName: "Kitchen",
    matcher: /(kitchen|pantry)/i,
    getCameraAngleDescription: (roomName) =>
      `Three-quarter perspective from the dining-side approach into ${roomName.toLowerCase()}, capturing the island or counter edge and full cabinetry backdrop.`,
    getLightingDirection: (profile) =>
      `Natural spill light from the adjacent social zone, with task lighting over worktops and ${profile.lightingMood} below upper cabinets or shelving.`,
    fallbackFurnitureCarpentryDetails: [
      "Keep the main prep edge, tall storage, and entertaining surface visually connected in one clean run.",
      "Highlight joinery details that elevate the kitchen without reducing workable circulation.",
    ],
  },
  {
    key: "master-bedroom",
    defaultRoomName: "Master Bedroom",
    matcher: /(master|primary suite|primary bedroom|master suite|primary)/i,
    getCameraAngleDescription: (roomName) =>
      `Softly framed bedroom view from the door-side corner of ${roomName.toLowerCase()}, keeping the bed wall and wardrobe sequence readable in one shot.`,
    getLightingDirection: (profile) =>
      `Window daylight grazing the bed wall, supported by ${profile.lightingMood} around the headboard, bedside joinery, and wardrobe reveal.`,
    fallbackFurnitureCarpentryDetails: [
      "Use the headboard wall and wardrobe return as a unified composition with restrained bedside detailing.",
      "Keep vanity, dressing, or lounge elements calm and symmetrical so the room reads as a private suite.",
    ],
  },
  {
    key: "bathroom",
    defaultRoomName: "Primary Bathroom",
    matcher: /(bath|powder|toilet|wc|vanity)/i,
    getCameraAngleDescription: (roomName) =>
      `Compact interior view from the dry-side corner of ${roomName.toLowerCase()}, showing the vanity run, mirror, and main wall material together.`,
    getLightingDirection: (profile) =>
      `Mirror-front task lighting with a warm indirect ceiling wash and a restrained highlight on stone, tile, and vanity textures shaped by ${profile.lightingMood}.`,
    fallbackFurnitureCarpentryDetails: [
      "Compose the vanity, mirror cabinet, and recessed storage as one disciplined wet-area elevation.",
      "Use slab or tile continuity to make the bathroom feel larger and more premium in render.",
    ],
  },
  {
    key: "balcony-landscape",
    defaultRoomName: "Balcony / Landscape",
    matcher: /(balcony|yard|terrace|patio|garden|landscape|outdoor)/i,
    getCameraAngleDescription: (roomName) =>
      `Indoor-outdoor perspective from the interior threshold toward ${roomName.toLowerCase()}, showing how the exterior zone extends the main living experience.`,
    getLightingDirection: (profile) =>
      `Low-angle perimeter daylight or sunset edge light balanced with warm ambient spill from the interior, tuned to ${profile.lightingMood}.`,
    fallbackFurnitureCarpentryDetails: [
      "Keep loose seating and planters to the perimeter so the sliding-door threshold stays open and visually long.",
      "Coordinate the outdoor palette with the adjacent interior space so the transition reads as one concept package.",
    ],
  },
];

export function generateMockFurnitureLayout(plan: FloorPlanRecord): FloorPlanFurnitureLayoutResult {
  const sectionMap = new Map<FloorPlanFurnitureLayoutSectionKey, DraftFurnitureLayoutItem[]>();

  for (const legendItem of plan.furnitureLegend) {
    const room = findMatchingRoomDetection(plan.roomDetections, legendItem.room);
    const sectionKey = getFurnitureLayoutSectionKey(legendItem.room, room?.type);

    if (!sectionKey) continue;

    const currentItems = sectionMap.get(sectionKey) ?? [];
    currentItems.push({
      roomName: room?.name ?? legendItem.room,
      furnitureItem: legendItem.item,
      placementReason: buildPlacementReason(legendItem, sectionKey),
      clearanceNote: getClearanceNote(sectionKey, legendItem.item),
      dimensionsEstimate: getDimensionsEstimate(legendItem.item, sectionKey),
    });
    sectionMap.set(sectionKey, currentItems);
  }

  const outdoorFallbacks = buildOutdoorFallbackItems(plan.roomDetections);
  if (outdoorFallbacks.length > 0) {
    const currentOutdoorItems = sectionMap.get("balcony-yard") ?? [];
    sectionMap.set("balcony-yard", [...currentOutdoorItems, ...outdoorFallbacks]);
  }

  let legendNumber = 1;
  const sections = FURNITURE_LAYOUT_SECTION_ORDER.flatMap((section) => {
    const items = sectionMap.get(section.key) ?? buildFallbackItems(plan, section.key);

    if (items.length === 0 && section.optional) {
      return [];
    }

    return [
      {
        key: section.key,
        title: section.title,
        items: items.map((item) => ({
          ...item,
          legendNumber: legendNumber++,
        })),
      },
    ];
  });

  return {
    designRules: [...FURNITURE_LAYOUT_RULES],
    sections,
    designerNotes: buildDesignerNotes(plan),
    qsNotes: buildQsNotes(plan),
  };
}

export function generateMockPerspectiveConceptPackage(
  plan: FloorPlanRecord,
  style: FloorPlanPerspectiveStyle,
): FloorPlanPerspectiveConceptPackage {
  const profile = PERSPECTIVE_STYLE_PROFILES[style];
  const perspectives = PERSPECTIVE_VIEW_DEFINITIONS.filter(
    (definition) =>
      definition.key !== "balcony-landscape" || hasOutdoorPerspectiveOpportunity(plan),
  ).map((definition) => buildPerspectiveConcept(plan, definition, style, profile));

  const sharedColorPalette = buildPerspectiveColorPalette(plan, profile);
  const sharedMaterialPalette = buildPerspectiveMaterialPalette(plan, profile);

  return {
    style,
    artistIllustrationPrompt: [
      `Create a cohesive ${style.toLowerCase()} concept package for ${plan.projectName}, a ${plan.propertyType.toLowerCase()} project.`,
      profile.overview,
      `Cover ${perspectives.map((perspective) => perspective.viewTitle).join(", ")} in one consistent illustration language.`,
      `Keep the palette anchored to ${sharedColorPalette.join(", ")} with materials such as ${sharedMaterialPalette.join(", ")}.`,
      "Render as premium artist illustration boards for an interior design concept package, with no people and no construction clutter.",
    ].join(" "),
    perspectives,
    designerNotes: buildPerspectiveDesignerNotes(plan, style, profile, perspectives.length),
  };
}

function findMatchingRoomDetection(
  rooms: FloorPlanRoomDetection[],
  roomName: string,
): FloorPlanRoomDetection | null {
  const normalizedTarget = roomName.toLowerCase();

  return (
    rooms.find((room) => room.name.toLowerCase() === normalizedTarget) ??
    rooms.find((room) => normalizedTarget.includes(room.name.toLowerCase())) ??
    rooms.find((room) => room.name.toLowerCase().includes(normalizedTarget)) ??
    null
  );
}

function getFurnitureLayoutSectionKey(
  roomName: string,
  roomType?: string,
): FloorPlanFurnitureLayoutSectionKey | null {
  const normalizedValue = `${roomName} ${roomType ?? ""}`.toLowerCase();

  if (/(living|dining|salon|lounge)/.test(normalizedValue)) {
    return "living-dining";
  }

  if (/(kitchen|pantry)/.test(normalizedValue)) {
    return "kitchen";
  }

  if (/(bed|suite|study|guest|children|attic|flex)/.test(normalizedValue)) {
    return "bedrooms";
  }

  if (/(bath|powder|toilet|wc)/.test(normalizedValue)) {
    return "bathrooms";
  }

  if (/(balcony|yard|terrace|patio|outdoor)/.test(normalizedValue)) {
    return "balcony-yard";
  }

  return null;
}

function buildPlacementReason(
  legendItem: FloorPlanFurnitureLegendItem,
  sectionKey: FloorPlanFurnitureLayoutSectionKey,
): string {
  const normalizedItem = legendItem.item.toLowerCase();

  if (sectionKey === "living-dining" && /(sofa|lounge)/.test(normalizedItem)) {
    return `${legendItem.placement} This keeps the sofa axis aligned to the proposed TV wall.`;
  }

  if (sectionKey === "kitchen") {
    return `${legendItem.placement} Wet works stay close to the likely plumbing wall and service route.`;
  }

  if (sectionKey === "bedrooms" && /(study|desk|storage|wardrobe)/.test(normalizedItem)) {
    return `${legendItem.placement} Storage is kept out of the primary walking path for daily use.`;
  }

  return legendItem.placement;
}

function getClearanceNote(
  sectionKey: FloorPlanFurnitureLayoutSectionKey,
  furnitureItem: string,
): string {
  const normalizedItem = furnitureItem.toLowerCase();

  if (sectionKey === "living-dining" && /(dining)/.test(normalizedItem)) {
    return "Allow 900-1000 mm behind dining chairs and keep the foyer-to-window route clear.";
  }

  if (sectionKey === "living-dining") {
    return "Maintain a 900-1100 mm walking path around the seating cluster and clear door or window swings.";
  }

  if (sectionKey === "kitchen") {
    return "Maintain a 1000-1200 mm aisle around prep edges and avoid blocking service access.";
  }

  if (sectionKey === "bedrooms") {
    return "Keep 750-900 mm bedside access and avoid placing storage where door swings narrow circulation.";
  }

  if (sectionKey === "bathrooms") {
    return "Keep a 700-900 mm standing zone clear in front of the vanity and outside the wet area swing path.";
  }

  return "Preserve a 900 mm route to sliding panels, drainage points, and outdoor access.";
}

function getDimensionsEstimate(
  furnitureItem: string,
  sectionKey: FloorPlanFurnitureLayoutSectionKey,
): string {
  const normalizedItem = furnitureItem.toLowerCase();

  if (/(sectional sofa|main lounge sofa cluster)/.test(normalizedItem)) {
    return "Approx. 2800-3400W x 950-1050D mm";
  }

  if (/(sofa bed)/.test(normalizedItem)) {
    return "Approx. 2100-2400W x 950-1050D mm closed";
  }

  if (/(sofa|lounge bench|daybed)/.test(normalizedItem)) {
    return "Approx. 2200-2800W x 900-1000D mm";
  }

  if (/(armchair|chair pair|chairs)/.test(normalizedItem)) {
    return "Approx. 800-900W x 800-900D mm each";
  }

  if (/(10-seat dining table)/.test(normalizedItem)) {
    return "Approx. 3000-3400W x 1100-1200D mm";
  }

  if (/(8-seat dining table)/.test(normalizedItem)) {
    return "Approx. 2200-2600W x 950-1100D mm";
  }

  if (/(island|breakfast counter)/.test(normalizedItem)) {
    return "Approx. 1800-2600W x 750-1100D mm";
  }

  if (/(king bed)/.test(normalizedItem)) {
    return "Approx. 1800W x 2000L mm plus side clearance";
  }

  if (/(study desk|study desks)/.test(normalizedItem)) {
    return "Approx. 1600-2400W x 550-650D mm";
  }

  if (/(vanity|mirror cabinet)/.test(normalizedItem)) {
    return "Approx. 900-1200W x 500-550D mm";
  }

  if (sectionKey === "balcony-yard") {
    return "Approx. 1400-1800W x 450-800D mm";
  }

  return "Approx. 1200-2200W x 450-900D mm";
}

function buildFallbackItems(
  plan: FloorPlanRecord,
  sectionKey: FloorPlanFurnitureLayoutSectionKey,
): DraftFurnitureLayoutItem[] {
  if (sectionKey === "bathrooms") {
    return [
      {
        roomName: findBathroomRoomName(plan) ?? "Bathroom Plumbing Zone",
        furnitureItem: "Vanity, mirror cabinet, and linen storage",
        placementReason:
          "Keep the vanity run on the existing plumbing wall so wet works remain efficient for design and technical review.",
        clearanceNote:
          "Maintain a clear standing area in front of the vanity and keep shower or door swings outside the storage zone.",
        dimensionsEstimate: "Approx. 900-1200W x 500-550D mm",
      },
    ];
  }

  return [];
}

function buildOutdoorFallbackItems(
  rooms: FloorPlanRoomDetection[],
): DraftFurnitureLayoutItem[] {
  return rooms
    .filter((room) => getFurnitureLayoutSectionKey(room.name, room.type) === "balcony-yard")
    .map((room) => ({
      roomName: room.name,
      furnitureItem: room.name.toLowerCase().includes("yard")
        ? "Outdoor bench and planter storage ledge"
        : "Outdoor lounge chair pair and side table",
      placementReason:
        "Keep loose pieces to the perimeter so the interior threshold remains open and visually continuous.",
      clearanceNote:
        "Preserve a 900 mm route to sliding panels, planter access, and any drainage or service points.",
      dimensionsEstimate: room.name.toLowerCase().includes("yard")
        ? "Approx. 1400-1800W x 450-500D mm"
        : "Approx. 2 chairs at 700-800W each with 450-500D mm side table",
    }));
}

function findBathroomRoomName(plan: FloorPlanRecord): string | null {
  return (
    plan.roomDetections.find((room) =>
      /(bath|powder|toilet|wc)/.test(`${room.name} ${room.type}`.toLowerCase()),
    )?.name ?? null
  );
}

function buildDesignerNotes(plan: FloorPlanRecord): string[] {
  return [
    "Validate door swings, window openings, and final site measurements before locking the numbered layout legend.",
    `Use the generated layout to confirm lounge alignment, bedroom storage depth, and kitchen circulation for ${plan.projectName}.`,
    "Review vanity and kitchen wet-zone assumptions with the technical designer before issuing concept drawings.",
  ];
}

function buildQsNotes(plan: FloorPlanRecord): string[] {
  return [
    "Separate loose furniture from built-in scope when pricing TV walls, wardrobes, vanity storage, and kitchen islands.",
    `Allow tolerance for electrical and plumbing point adjustments if the preferred ${plan.propertyType.toLowerCase()} layout shifts during detailed design.`,
    "Check circulation-critical items first during site measure so sofa, dining, and bed clearances do not compress on installation.",
  ];
}

function buildPerspectiveConcept(
  plan: FloorPlanRecord,
  definition: PerspectiveViewDefinition,
  style: FloorPlanPerspectiveStyle,
  profile: PerspectiveStyleProfile,
): FloorPlanPerspectiveConcept {
  const matchedRoom = findRoomByPattern(plan.roomDetections, definition.matcher);
  const roomName =
    matchedRoom?.name ??
    (definition.key === "balcony-landscape"
      ? getOutdoorPerspectiveRoomName(plan)
      : definition.defaultRoomName);
  const viewTitle = `${roomName} Perspective`;
  const colorPalette = buildPerspectiveColorPalette(plan, profile);
  const materialPalette = buildPerspectiveMaterialPalette(plan, profile);
  const furnitureCarpentryDetails = buildPerspectiveDetailLines(
    plan,
    definition.matcher,
    definition.fallbackFurnitureCarpentryDetails,
  );
  const cameraAngleDescription =
    definition.getCameraAngleDescription(roomName);
  const lightingDirection = definition.getLightingDirection(profile);

  return {
    viewTitle,
    cameraAngleDescription,
    designStyle: style,
    colorPalette,
    materialPalette,
    lightingDirection,
    furnitureCarpentryDetails,
    imageGenerationPrompt: buildPerspectiveImagePrompt({
      plan,
      viewTitle,
      style,
      profile,
      cameraAngleDescription,
      colorPalette,
      materialPalette,
      lightingDirection,
      furnitureCarpentryDetails,
      referencePrompt: findPerspectivePromptReference(
        plan,
        definition.key,
      ),
    }),
  };
}

function buildPerspectiveColorPalette(
  plan: FloorPlanRecord,
  profile: PerspectiveStyleProfile,
): string[] {
  return uniqueStrings([
    ...plan.palette.map((item) => item.label),
    ...profile.paletteAccents,
  ]).slice(0, 5);
}

function buildPerspectiveMaterialPalette(
  plan: FloorPlanRecord,
  profile: PerspectiveStyleProfile,
): string[] {
  return uniqueStrings([
    ...plan.palette.map(
      (item) => `${item.material} (${item.finish.toLowerCase()})`,
    ),
    ...profile.materialAccents,
  ]).slice(0, 5);
}

function buildPerspectiveDesignerNotes(
  plan: FloorPlanRecord,
  style: FloorPlanPerspectiveStyle,
  profile: PerspectiveStyleProfile,
  perspectiveCount: number,
): string[] {
  return [
    `Keep all ${perspectiveCount} perspectives on the same ${style} material hierarchy so the concept package reads as one family.`,
    profile.designerNote,
    plan.readinessNote,
    "Validate site dimensions, window directions, and plumbing points before converting these mock prompts into production visuals.",
  ];
}

function buildPerspectiveDetailLines(
  plan: FloorPlanRecord,
  matcher: RegExp,
  fallbackLines: string[],
): string[] {
  const legendLines = plan.furnitureLegend
    .filter((item) => matcher.test(`${item.room} ${item.item}`))
    .map((item) => `${item.item}: ${item.placement}`);
  const carpentryLines = plan.carpentryNotes
    .filter((item) => matcher.test(`${item.zone} ${item.title}`))
    .map((item) => `${item.title}: ${item.note}`);

  return uniqueStrings([...legendLines, ...carpentryLines, ...fallbackLines]).slice(0, 4);
}

function buildPerspectiveImagePrompt(args: {
  plan: FloorPlanRecord;
  viewTitle: string;
  style: FloorPlanPerspectiveStyle;
  profile: PerspectiveStyleProfile;
  cameraAngleDescription: string;
  colorPalette: string[];
  materialPalette: string[];
  lightingDirection: string;
  furnitureCarpentryDetails: string[];
  referencePrompt?: string;
}): string {
  const basePrompt = [
    `${args.plan.propertyType} interior, ${args.viewTitle.toLowerCase()} for ${args.plan.projectName}.`,
    `${args.style} design direction.`,
    args.profile.overview,
    args.cameraAngleDescription,
    `Color palette: ${args.colorPalette.join(", ")}.`,
    `Material palette: ${args.materialPalette.join(", ")}.`,
    `Lighting: ${args.lightingDirection}`,
    `Furniture and carpentry details: ${args.furnitureCarpentryDetails.join("; ")}.`,
    `Render keywords: ${args.profile.promptKeywords.join(", ")}.`,
    "High-detail artist illustration, premium residential concept board quality, no people.",
  ].join(" ");

  if (!args.referencePrompt) {
    return basePrompt;
  }

  return `${basePrompt} Reference mood: ${args.referencePrompt}`;
}

function findRoomByPattern(
  rooms: FloorPlanRoomDetection[],
  matcher: RegExp,
): FloorPlanRoomDetection | null {
  return (
    rooms.find((room) => matcher.test(`${room.name} ${room.type}`)) ?? null
  );
}

function findPerspectivePromptReference(
  plan: FloorPlanRecord,
  perspectiveKey: PerspectiveViewKey,
): string | undefined {
  const matcherMap: Record<PerspectiveViewKey, RegExp> = {
    entrance: /(entrance|arrival|foyer|lobby)/i,
    "living-dining": /(living|dining|salon|lounge)/i,
    kitchen: /(kitchen|pantry)/i,
    "master-bedroom": /(master|primary|suite|bedroom)/i,
    bathroom: /(bath|vanity|powder)/i,
    "balcony-landscape": /(balcony|yard|terrace|outdoor|landscape)/i,
  };

  return plan.perspectivePrompts.find((item) =>
    matcherMap[perspectiveKey].test(item.title),
  )?.prompt;
}

function hasOutdoorPerspectiveOpportunity(plan: FloorPlanRecord): boolean {
  const searchableText = [
    plan.summary,
    plan.readinessNote,
    ...plan.roomDetections.map((room) => `${room.name} ${room.type}`),
    ...plan.furnitureLegend.map((item) => `${item.room} ${item.placement}`),
    ...plan.carpentryNotes.map((item) => `${item.zone} ${item.title} ${item.note}`),
  ]
    .join(" ")
    .toLowerCase();

  return /(balcony|yard|terrace|patio|garden|landscape|outdoor)/.test(
    searchableText,
  );
}

function getOutdoorPerspectiveRoomName(plan: FloorPlanRecord): string {
  const matchedOutdoorRoom = findRoomByPattern(
    plan.roomDetections,
    /(balcony|yard|terrace|patio|garden|landscape|outdoor)/i,
  );

  if (matchedOutdoorRoom) {
    return matchedOutdoorRoom.name;
  }

  if (plan.propertyType === "Landed") {
    return "Landscape Terrace";
  }

  if (plan.propertyType === "Penthouse") {
    return "Sky Terrace";
  }

  return "Balcony";
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(
    new Set(values.map((value) => value.trim()).filter(Boolean)),
  );
}
