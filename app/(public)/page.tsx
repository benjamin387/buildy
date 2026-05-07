import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  Check,
  Clock3,
  LayoutDashboard,
  MessageCircle,
  ReceiptText,
  Sparkles,
} from "lucide-react";
import { SectionCard } from "@/app/components/ui/section-card";
import { getSessionUser } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Interior Design Operating System",
  description:
    "Buildy helps interior design and construction teams turn inbound leads into polished concepts, pricing, and project-ready delivery workflows.",
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: "Buildy — Interior Design Operating System",
    description:
      "Win more renovation projects with faster briefs, clearer sample outputs, and pricing that clients approve with confidence.",
    url: "https://app.buildy.sg",
    siteName: "Buildy",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Buildy — Interior Design Operating System",
    description:
      "A high-conversion operating system for interior design and construction studios.",
  },
};

const heroStats = [
  { label: "Lead response", value: "< 5 min" },
  { label: "Concept to quote", value: "48 hrs" },
  { label: "Teams aligned", value: "One workspace" },
];

const steps = [
  {
    title: "Capture the brief once",
    description:
      "Convert WhatsApp enquiries, renovation notes, floor plans, and budget signals into one structured project brief.",
    icon: MessageCircle,
  },
  {
    title: "Generate polished outputs fast",
    description:
      "Draft design direction, scope summaries, and client-ready pricing with consistent quality across every opportunity.",
    icon: Sparkles,
  },
  {
    title: "Move into delivery without rework",
    description:
      "Carry the approved scope into quotations, procurement, contracts, and project tracking in the same system.",
    icon: LayoutDashboard,
  },
];

const sampleOutputs = [
  {
    eyebrow: "Concept brief",
    title: "Warm contemporary family apartment",
    detail:
      "Mood direction, zoning notes, material cues, and homeowner priorities packaged for design review.",
    bullets: ["Lifestyle-led layout notes", "Room-by-room design intent", "Approval-ready summary"],
  },
  {
    eyebrow: "Quotation",
    title: "Clear scope. Higher trust.",
    detail:
      "Client-facing pricing broken down by work package, add-ons, and milestone structure so fewer deals stall in clarification.",
    bullets: ["Transparent work packages", "Optional upgrades surfaced early", "Faster sign-off conversations"],
  },
  {
    eyebrow: "Delivery handoff",
    title: "Operations stay in sync",
    detail:
      "Approved projects flow into execution with commercial context, timeline assumptions, and documentation intact.",
    bullets: ["Shared source of truth", "Less manual copy-paste", "Cleaner project kickoff"],
  },
];

const pricingPlans = [
  {
    name: "Starter",
    price: "S$299",
    cadence: "/month",
    description: "For lean studios that want a sharper sales front-end.",
    features: ["Lead capture workflow", "Proposal-ready design summaries", "Client quotation templates"],
    featured: false,
  },
  {
    name: "Growth",
    price: "S$899",
    cadence: "/month",
    description: "For teams closing more projects and standardising operations.",
    features: ["Everything in Starter", "AI-assisted scope and pricing flows", "Project handoff and collaboration workspace"],
    featured: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    cadence: "",
    description: "For multi-user firms that need deeper controls and rollout support.",
    features: ["Custom onboarding", "Permissions and audit-ready workflows", "Priority implementation support"],
    featured: false,
  },
];

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function sanitizeWhatsAppNumber(value: string | undefined) {
  if (!value) return "";
  return value.replaceAll(/[^\d]/g, "");
}

function MarketingLink(props: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary";
  className?: string;
}) {
  const variant = props.variant ?? "primary";

  return (
    <Link
      href={props.href}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400",
        variant === "primary"
          ? "bg-neutral-950 text-white shadow-sm hover:bg-neutral-900"
          : "border border-slate-200 bg-white/90 text-neutral-900 shadow-sm hover:bg-white",
        props.className,
      )}
    >
      {props.children}
    </Link>
  );
}

function SectionHeading(props: { kicker: string; title: string; description: string }) {
  return (
    <div className="max-w-3xl">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-neutral-500">{props.kicker}</p>
      <h2 className="mt-3 text-3xl font-semibold tracking-tight text-neutral-950 sm:text-4xl" style={{ fontFamily: "var(--font-display)" }}>
        {props.title}
      </h2>
      <p className="mt-4 text-sm leading-6 text-neutral-600 sm:text-base">{props.description}</p>
    </div>
  );
}

export default async function PublicLandingPage() {
  const user = await getSessionUser();

  if (user) {
    redirect("/dashboard");
  }

  const whatsappNumber = sanitizeWhatsAppNumber(process.env.NEXT_PUBLIC_BUILDY_WHATSAPP_NUMBER);
  const whatsappHref = whatsappNumber ? `https://wa.me/${whatsappNumber}` : "https://wa.me/<number>";

  return (
    <main className="min-h-screen bg-stone-50 text-neutral-950">
      <div className="min-h-screen bg-[radial-gradient(1200px_circle_at_15%_0%,rgba(196,181,161,0.24),transparent_50%),radial-gradient(1000px_circle_at_100%_0%,rgba(15,23,42,0.09),transparent_45%),linear-gradient(to_bottom,rgba(255,255,255,0.85),rgba(248,250,252,0.98))]">
        <div className="mx-auto max-w-7xl px-4 pb-20 pt-6 sm:px-6 lg:px-8">
          <header className="flex items-center justify-between gap-4 rounded-full border border-white/70 bg-white/75 px-4 py-3 shadow-[0_1px_0_rgba(15,23,42,0.04),0_14px_30px_rgba(15,23,42,0.06)] backdrop-blur sm:px-6">
            <Link href="/" className="inline-flex items-center gap-3 text-sm font-semibold tracking-[0.14em] text-neutral-950 uppercase">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-neutral-950 text-sm text-white">
                B
              </span>
              Buildy
            </Link>
            <nav className="hidden items-center gap-6 text-sm text-neutral-600 md:flex">
              <Link href="#how-it-works" className="transition hover:text-neutral-950">
                How it works
              </Link>
              <Link href="#sample-output" className="transition hover:text-neutral-950">
                Sample output
              </Link>
              <Link href="#pricing" className="transition hover:text-neutral-950">
                Pricing
              </Link>
            </nav>
            <MarketingLink href="/login" variant="secondary" className="px-4 py-2.5">
              Sign in
            </MarketingLink>
          </header>

          <section className="relative mt-6 overflow-hidden rounded-[2rem] border border-white/70 bg-white/80 px-5 py-8 shadow-[0_1px_0_rgba(15,23,42,0.04),0_25px_60px_rgba(15,23,42,0.10)] backdrop-blur sm:px-8 sm:py-10 lg:px-12 lg:py-14">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-stone-300 to-transparent" />
            <div className="grid gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)] lg:items-center">
              <div className="max-w-3xl">
                <p className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-stone-100/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-neutral-600">
                  <Clock3 className="h-3.5 w-3.5" />
                  Luxury studio operations, simplified
                </p>
                <h1 className="mt-6 text-4xl font-semibold leading-tight tracking-tight text-neutral-950 sm:text-5xl lg:text-6xl" style={{ fontFamily: "var(--font-display)" }}>
                  Convert renovation leads into approved projects with less chasing, less chaos, and better client trust.
                </h1>
                <p className="mt-6 max-w-2xl text-base leading-7 text-neutral-600 sm:text-lg">
                  Buildy gives interior design and construction teams one polished flow for lead intake, sample deliverables, pricing, and project handoff so every opportunity moves faster.
                </p>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <MarketingLink href={whatsappHref} className="min-w-[220px]">
                    <MessageCircle className="h-4 w-4" />
                    Start on WhatsApp
                    <ArrowRight className="h-4 w-4" />
                  </MarketingLink>
                  <MarketingLink href="#pricing" variant="secondary" className="min-w-[220px]">
                    View pricing
                  </MarketingLink>
                </div>
                <div className="mt-8 grid gap-4 sm:grid-cols-3">
                  {heroStats.map((stat) => (
                    <div key={stat.label} className="rounded-2xl border border-stone-200/80 bg-stone-50/80 px-4 py-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.20em] text-neutral-500">{stat.label}</p>
                      <p className="mt-2 text-2xl font-semibold tracking-tight text-neutral-950">{stat.value}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="relative">
                <div className="absolute -left-6 top-10 hidden h-24 w-24 rounded-full bg-stone-200/70 blur-3xl lg:block" />
                <div className="absolute -right-6 bottom-8 hidden h-28 w-28 rounded-full bg-slate-200/60 blur-3xl lg:block" />
                <div className="relative rounded-[2rem] border border-slate-200/80 bg-neutral-950 p-5 text-white shadow-2xl">
                  <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/60">Live opportunity</p>
                      <p className="mt-2 text-xl font-semibold">Meyer Road Condo Refresh</p>
                    </div>
                    <span className="rounded-full border border-emerald-400/30 bg-emerald-400/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-200">
                      Proposal ready
                    </span>
                  </div>

                  <div className="mt-4 grid gap-4">
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/55">Client brief</p>
                      <p className="mt-3 text-sm leading-6 text-white/80">
                        3-bed resale renovation. Warm hotel feel. Needs design concept, carpentry scope, and a clear investment range before Saturday.
                      </p>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/55">Suggested output</p>
                        <ul className="mt-3 space-y-2 text-sm text-white/80">
                          <li className="flex items-start gap-2">
                            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-amber-200" />
                            Concept summary with material direction
                          </li>
                          <li className="flex items-start gap-2">
                            <ReceiptText className="mt-0.5 h-4 w-4 shrink-0 text-amber-200" />
                            Client quotation with package options
                          </li>
                        </ul>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-stone-200/20 to-white/5 p-4">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/55">Commercial snapshot</p>
                        <div className="mt-3 space-y-3 text-sm text-white/80">
                          <div className="flex items-center justify-between">
                            <span>Estimated contract</span>
                            <span className="font-semibold text-white">S$82k</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>Decision window</span>
                            <span className="font-semibold text-white">72 hours</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>Next move</span>
                            <span className="font-semibold text-white">Send sample pack</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section id="how-it-works" className="scroll-mt-24 pt-16 sm:pt-20">
            <SectionHeading
              kicker="How it works"
              title="A calmer path from first enquiry to confident close."
              description="Every section is designed to remove the usual handoff friction between sales, design, and delivery teams."
            />
            <div className="mt-8 grid gap-5 lg:grid-cols-3">
              {steps.map((step, index) => {
                const Icon = step.icon;

                return (
                  <SectionCard key={step.title} className="rounded-[1.75rem] border-white/80 bg-white/85">
                    <div className="flex items-start justify-between gap-4">
                      <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-stone-100 text-neutral-950">
                        <Icon className="h-5 w-5" />
                      </div>
                      <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-neutral-400">
                        Step {index + 1}
                      </span>
                    </div>
                    <h3 className="mt-6 text-2xl font-semibold tracking-tight text-neutral-950" style={{ fontFamily: "var(--font-display)" }}>
                      {step.title}
                    </h3>
                    <p className="mt-4 text-sm leading-6 text-neutral-600">{step.description}</p>
                  </SectionCard>
                );
              })}
            </div>
          </section>

          <section id="sample-output" className="scroll-mt-24 pt-16 sm:pt-20">
            <SectionHeading
              kicker="Sample output"
              title="Show prospects work that already feels premium."
              description="Instead of sending loose notes and fragmented screenshots, present structured outputs that make your team feel organised from the first interaction."
            />
            <div className="mt-8 grid gap-5 xl:grid-cols-3">
              {sampleOutputs.map((sample) => (
                <section
                  key={sample.title}
                  className="overflow-hidden rounded-[1.75rem] border border-slate-200/80 bg-white/90 shadow-[0_1px_0_rgba(15,23,42,0.04),0_20px_45px_rgba(15,23,42,0.08)]"
                >
                  <div className="border-b border-slate-200/80 bg-[radial-gradient(500px_circle_at_20%_0%,rgba(214,211,209,0.38),transparent_55%),linear-gradient(to_bottom,rgba(249,250,251,0.96),rgba(255,255,255,0.9))] px-5 py-5 sm:px-6">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-neutral-500">{sample.eyebrow}</p>
                    <h3 className="mt-3 text-2xl font-semibold tracking-tight text-neutral-950" style={{ fontFamily: "var(--font-display)" }}>
                      {sample.title}
                    </h3>
                    <p className="mt-3 text-sm leading-6 text-neutral-600">{sample.detail}</p>
                  </div>
                  <div className="px-5 py-5 sm:px-6">
                    <ul className="space-y-3">
                      {sample.bullets.map((bullet) => (
                        <li key={bullet} className="flex items-start gap-3 text-sm leading-6 text-neutral-700">
                          <span className="mt-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-neutral-950 text-white">
                            <Check className="h-3 w-3" />
                          </span>
                          <span>{bullet}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </section>
              ))}
            </div>
          </section>

          <section id="pricing" className="scroll-mt-24 pt-16 sm:pt-20">
            <SectionHeading
              kicker="Pricing"
              title="Start simple. Scale when the workflow sticks."
              description="Pricing is positioned to help design-led firms adopt quickly without committing to heavy custom implementation on day one."
            />
            <div className="mt-8 grid gap-5 xl:grid-cols-3">
              {pricingPlans.map((plan) => (
                <section
                  key={plan.name}
                  className={cx(
                    "rounded-[1.75rem] border p-6 shadow-[0_1px_0_rgba(15,23,42,0.04),0_20px_45px_rgba(15,23,42,0.08)]",
                    plan.featured
                      ? "border-neutral-950 bg-neutral-950 text-white"
                      : "border-slate-200/80 bg-white/90 text-neutral-950",
                  )}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p
                        className={cx(
                          "text-[11px] font-semibold uppercase tracking-[0.24em]",
                          plan.featured ? "text-white/60" : "text-neutral-500",
                        )}
                      >
                        {plan.name}
                      </p>
                      <div className="mt-4 flex items-end gap-1">
                        <span className="text-4xl font-semibold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
                          {plan.price}
                        </span>
                        {plan.cadence ? (
                          <span className={cx("pb-1 text-sm", plan.featured ? "text-white/60" : "text-neutral-500")}>
                            {plan.cadence}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    {plan.featured ? (
                      <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white">
                        Most popular
                      </span>
                    ) : null}
                  </div>
                  <p className={cx("mt-4 text-sm leading-6", plan.featured ? "text-white/75" : "text-neutral-600")}>
                    {plan.description}
                  </p>
                  <ul className="mt-6 space-y-3">
                    {plan.features.map((feature) => (
                      <li key={feature} className={cx("flex items-start gap-3 text-sm leading-6", plan.featured ? "text-white/85" : "text-neutral-700")}>
                        <span
                          className={cx(
                            "mt-1 inline-flex h-5 w-5 items-center justify-center rounded-full",
                            plan.featured ? "bg-white/12 text-white" : "bg-neutral-950 text-white",
                          )}
                        >
                          <Check className="h-3 w-3" />
                        </span>
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <MarketingLink
                    href={plan.name === "Enterprise" ? whatsappHref : "#cta"}
                    variant={plan.featured ? "secondary" : "primary"}
                    className={cx(
                      "mt-8 w-full",
                      plan.featured ? "border-white/15 bg-white text-neutral-950 hover:bg-stone-100" : undefined,
                    )}
                  >
                    {plan.name === "Enterprise" ? "Talk to sales" : "Choose plan"}
                  </MarketingLink>
                </section>
              ))}
            </div>
          </section>

          <section id="cta" className="scroll-mt-24 pt-16 sm:pt-20">
            <section className="overflow-hidden rounded-[2rem] border border-neutral-950 bg-neutral-950 px-5 py-8 text-white shadow-[0_30px_70px_rgba(15,23,42,0.16)] sm:px-8 sm:py-10 lg:px-12">
              <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                <div className="max-w-3xl">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/55">WhatsApp CTA</p>
                  <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl" style={{ fontFamily: "var(--font-display)" }}>
                    Want Buildy in your front-end sales flow?
                  </h2>
                  <p className="mt-4 text-sm leading-7 text-white/72 sm:text-base">
                    Message us on WhatsApp to see how Buildy can package your briefs, sample outputs, and pricing journey into one luxury-ready client experience.
                  </p>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
                  <MarketingLink
                    href={whatsappHref}
                    variant="secondary"
                    className="min-w-[220px] border-white/15 bg-white text-neutral-950 hover:bg-stone-100"
                  >
                    <MessageCircle className="h-4 w-4" />
                    Chat on WhatsApp
                  </MarketingLink>
                  <MarketingLink
                    href="/login"
                    variant="secondary"
                    className="min-w-[220px] border-white/15 bg-transparent text-white hover:bg-white/10"
                  >
                    Existing customer login
                  </MarketingLink>
                </div>
              </div>
            </section>
          </section>
        </div>
      </div>
    </main>
  );
}
