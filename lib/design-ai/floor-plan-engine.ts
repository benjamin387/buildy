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
