import { createFileRoute, Link } from "@tanstack/react-router";
import {
  animate,
  createDrawable,
  createDraggable,
  createTimer,
  createTimeline,
  onScroll,
  scrambleText,
  splitText,
  stagger,
} from "animejs";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  useScroll,
  useSpring,
  type Variants,
} from "motion/react";
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Bell,
  BookOpenCheck,
  BrainCircuit,
  Calculator,
  Check,
  ChevronDown,
  CircleDot,
  FileCheck2,
  FileCode2,
  Gauge,
  LockKeyhole,
  MessageSquareText,
  MousePointer2,
  PlayCircle,
  ReceiptText,
  RotateCcw,
  ScanText,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  UploadCloud,
  UsersRound,
  Workflow,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import ScrollText from "@/components/kokonutui/scroll-text";
import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/site-nav";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BorderBeam } from "@/components/ui/border-beam";
import { Button } from "@/components/ui/button";
import { Magnetic } from "@/components/ui/magnetic-button";
import { Marquee } from "@/components/ui/marquee";
import { Meteors } from "@/components/ui/meteors";
import { OrbitingCircles } from "@/components/ui/orbiting-circles";
import NumberTicker from "@/components/widgets/number-ticker";
import { StatsWidget } from "@/components/widgets/stats-widget";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "IMMapp - Document AI si e-Factura pentru IMM-uri" },
      {
        name: "description",
        content:
          "IMMapp citeste automat facturile firmei tale, calculeaza TVA si cash-flow si tine firma si contabilul pe aceeasi pagina.",
      },
      {
        property: "og:title",
        content: "IMMapp - Document AI si e-Factura pentru IMM-uri",
      },
      {
        property: "og:description",
        content:
          "Incarci documente, verifici campurile extrase de AI si vezi TVA, cash-flow si risc intr-un dashboard clar.",
      },
    ],
  }),
  component: Landing,
});

const easeOut = [0.16, 1, 0.3, 1] as const;

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 18, filter: "blur(8px)" },
  visible: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.65, ease: easeOut },
  },
};

const staggerParent: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.08,
    },
  },
};

const cashFlowSeries = [
  { month: "Ian", cash: 41, tva: 32 },
  { month: "Feb", cash: 46, tva: 35 },
  { month: "Mar", cash: 54, tva: 38 },
  { month: "Apr", cash: 49, tva: 43 },
  { month: "Mai", cash: 63, tva: 47 },
  { month: "Iun", cash: 71, tva: 52 },
];

const dataScoreSeries = [
  { label: "Cash", value: 74 },
  { label: "TVA", value: 56 },
  { label: "Risc", value: 31 },
  { label: "Date", value: 88 },
];

const cashFlowArea = [
  { day: "L", value: 18 },
  { day: "M", value: 28 },
  { day: "M", value: 24 },
  { day: "J", value: 36 },
  { day: "V", value: 44 },
  { day: "S", value: 39 },
  { day: "D", value: 52 },
];

const heroStats = [
  { icon: ReceiptText, label: "Facturi procesate", value: "1.245", delta: "+4,2%" },
  { icon: FileCheck2, label: "Documente active", value: "128", delta: "+2,1%" },
  { icon: Calculator, label: "TVA de verificat", value: "8.430 RON", delta: null },
  { icon: Check, label: "Campuri confirmate", value: "91%", delta: "+3,4%" },
];

const heroRecentDocs = [
  {
    title: "Factura RO-4821",
    meta: "SC Atlas Media SRL",
    status: "Confirmat",
    tone: "success" as const,
  },
  {
    title: "Raport TVA - trimestrul 3",
    meta: "generat automat",
    status: "In lucru",
    tone: "warning" as const,
  },
  { title: "Export UBL - iunie", meta: "CIUS-RO valid", status: "Trimis", tone: "info" as const },
];

const moduleTags = [
  "Document AI",
  "e-Factura XML",
  "TVA",
  "Cash-flow",
  "Profitabilitate",
  "Roluri & Contabil",
  "Export UBL",
  "Securitate RLS",
];

const featureCards = [
  {
    icon: BrainCircuit,
    title: "Document AI",
    description:
      "Extrage automat furnizor, CUI, sume si TVA din facturi PDF sau XML, cu scor de incredere pe fiecare camp.",
  },
  {
    icon: FileCode2,
    title: "e-Factura XML",
    description:
      "Genereaza si valideaza fisiere UBL 2.1 / CIUS-RO gata de trimis, fara completare manuala de campuri.",
  },
  {
    icon: Calculator,
    title: "TVA & cash-flow",
    description:
      "Calculeaza TVA de plata si estimeaza presiunea pe cash-flow direct din documentele confirmate.",
  },
  {
    icon: BarChart3,
    title: "Rapoarte financiare",
    description:
      "Venituri, cheltuieli, profitabilitate si risc de concentrare clienti, actualizate in timp real.",
  },
  {
    icon: UsersRound,
    title: "Firma & contabil",
    description:
      "Contabilul extern vede exact ce trebuie, cu acces separat pe companie si pe rol, fara conturi partajate.",
  },
  {
    icon: ShieldCheck,
    title: "Securitate & RLS",
    description:
      "Fiecare firma are datele izolate la nivel de baza de date. Nimeni nu vede ce nu ii apartine.",
  },
];

const growthStats = [
  { label: "Documente procesate", value: "2.450", delta: "+18,2%", positive: true },
  { label: "Precizie extractie AI", value: "94%", delta: "+3,1%", positive: true },
  { label: "TVA in intarziere", value: "6%", delta: "-4,3%", positive: false },
];

const growthChecklist = [
  "Scalabil de la 10 la 10.000 de facturi pe luna",
  "Roluri separate pentru firma si contabil extern",
  "Date criptate si izolate la nivel de companie",
  "Format compatibil cu specificatia oficiala ANAF",
];

const orbitItems = [
  { label: "XML", icon: FileCode2 },
  { label: "PDF", icon: ReceiptText },
  { label: "AI", icon: BrainCircuit },
  { label: "TVA", icon: Calculator },
  { label: "ROL", icon: UsersRound },
  { label: "RLS", icon: LockKeyhole },
];

const pipelineEvents = [
  { label: "Import XML", value: "121 documente", icon: UploadCloud },
  { label: "Extractie AI", value: "10 campuri", icon: ScanText },
  { label: "Validare TVA", value: "91% confirmat", icon: Calculator },
  { label: "Raportare", value: "+8,7% cash", icon: BarChart3 },
];

const processingPhrases = ["procesare XML", "verificare TVA", "cash-flow live", "corectii AI"];

const trustSignals = [
  { icon: ShieldCheck, label: "RLS pe tabelele companiei" },
  { icon: FileCode2, label: "UBL 2.1 / CIUS-RO" },
  { icon: LockKeyhole, label: "Date separate pe roluri" },
  { icon: BookOpenCheck, label: "Corectii AI salvate pentru training" },
];

const featureSteps = [
  {
    title: "Incarca documentele",
    body: "XML e-Factura, PDF sau imagine. Fluxul porneste din fisierele pe care firma le are deja.",
    icon: UploadCloud,
  },
  {
    title: "Verifica extractia AI",
    body: "Campurile critice sunt marcate cu incredere, sursa si avertismente cand ceva pare suspect.",
    icon: ScanText,
  },
  {
    title: "Controleaza raportarea",
    body: "TVA, cash-flow, venituri si cheltuieli sunt calculate din datele confirmate.",
    icon: Gauge,
  },
  {
    title: "Lucreaza cu contabilul",
    body: "Roluri, acces partajat si istoric comun pentru firma si contabilul extern.",
    icon: UsersRound,
  },
];

const scrollQuestions = [
  "TVA de verificat",
  "Cash-flow pe 14 zile",
  "Client dominant",
  "Campuri lipsa",
  "Export UBL",
  "Risc mediu",
  "Corectii AI",
  "Raport contabil",
];

const recommendations = [
  {
    title: "Client principal peste prag",
    body: "Un singur client sustine o parte mare din incasari.",
    action: "Revizuieste dependenta",
  },
  {
    title: "TVA de plata in crestere",
    body: "Valoarea estimata depaseste media ultimelor luni.",
    action: "Deschide raportul TVA",
  },
  {
    title: "Date incomplete",
    body: "Unele documente au campuri lipsa sau valori cu incredere scazuta.",
    action: "Corecteaza campurile",
  },
];

function Landing() {
  return (
    <div className="immapp-landing min-h-screen overflow-x-hidden bg-background text-foreground">
      <ScrollProgress />
      <SiteNav />
      <main>
        <Hero />
        <ModulesMarquee />
        <FeaturesSection />
        <GrowthSection />
        <WorkflowSection />
        <FinancialFlowSection />
        <ReportsSection />
        <PromptSection />
        <SecuritySection />
        <FinalCta />
      </main>
      <SiteFooter />
    </div>
  );
}

function ScrollProgress() {
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 240,
    damping: 32,
    restDelta: 0.001,
  });

  if (reduce) {
    return null;
  }

  return (
    <motion.div
      style={{ scaleX }}
      className="fixed inset-x-0 top-0 z-[70] h-[3px] origin-left bg-primary"
      aria-hidden
    />
  );
}

function Hero() {
  const reduce = useReducedMotion();
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (reduce || !headingRef.current) {
      return;
    }

    const split = splitText(headingRef.current, { words: { wrap: "clip" } });

    animate(split.words, {
      y: ["112%", "0%"],
      opacity: [0, 1],
      duration: 760,
      delay: stagger(48),
      ease: "outExpo",
    });

    return () => {
      split.revert();
    };
  }, [reduce]);

  return (
    <section className="relative overflow-hidden px-4 pt-14 pb-16 sm:px-6 sm:pt-20 lg:pb-24">
      <HeroBackground />

      <div className="relative mx-auto grid max-w-6xl gap-14 lg:grid-cols-[1fr_1.05fr] lg:items-center lg:gap-8">
        <motion.div
          variants={staggerParent}
          initial="hidden"
          animate="visible"
          className="flex flex-col items-center text-center lg:items-start lg:text-left"
        >
          <motion.div
            variants={fadeUp}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-foreground shadow-sm"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_0_4px_rgba(37,86,224,0.15)]" />
            Document AI antrenat pe facturi romanesti
          </motion.div>

          <h1
            ref={headingRef}
            className="mt-6 max-w-xl text-balance text-[40px] font-semibold leading-[1.05] text-foreground sm:text-6xl lg:text-[54px] xl:text-[60px]"
          >
            Facturile intra singure. <span className="text-primary">Tu vezi ce conteaza.</span>
          </h1>

          <motion.p
            variants={fadeUp}
            className="mt-6 max-w-lg text-balance text-[15px] leading-7 text-muted-foreground sm:text-base"
          >
            IMMapp citeste e-Facturi si documente, marcheaza campurile riscante si transforma datele
            in rapoarte clare de TVA si cash-flow, pentru tine si contabilul tau.
          </motion.p>

          <motion.div
            variants={fadeUp}
            className="mt-8 flex w-full flex-wrap items-center justify-center gap-3 lg:justify-start"
          >
            <Magnetic>
              <Button
                asChild
                className="h-11 rounded-lg bg-primary px-5 text-primary-foreground shadow-[0_16px_36px_rgba(37,86,224,0.3)] hover:bg-primary/90"
              >
                <Link to="/register">
                  Incepe gratuit
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </Magnetic>
            <Button asChild variant="outline" className="h-11 rounded-lg bg-card px-5">
              <a href="#functionalitati">
                <PlayCircle className="h-4 w-4" />
                Vezi cum functioneaza
              </a>
            </Button>
          </motion.div>

          <motion.div
            variants={fadeUp}
            className="mt-6 flex w-full flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-muted-foreground lg:justify-start"
          >
            <TrustBullet label="Fara instalare" />
            <TrustBullet label="Cont gratuit" />
            <TrustBullet label="Date separate pe firma" />
          </motion.div>
        </motion.div>

        <motion.div
          initial={reduce ? false : { opacity: 0, y: 32, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.9, delay: 0.3, ease: easeOut }}
          className="relative mx-auto w-full max-w-[560px] lg:mx-0"
        >
          <HeroDashboardMockup />
        </motion.div>
      </div>
    </section>
  );
}

function TrustBullet({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Check className="h-3.5 w-3.5 text-primary" />
      {label}
    </span>
  );
}

function HeroBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-[560px] bg-[linear-gradient(to_bottom,rgba(37,86,224,0.06),rgba(255,255,255,0)_70%)]" />
      <div className="absolute -top-24 right-[-10%] h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,rgba(37,86,224,0.14),transparent_70%)] blur-2xl" />
      <div className="absolute inset-x-0 top-6 mx-auto h-[480px] max-w-6xl rounded-[42px] border border-black/[0.03] bg-[linear-gradient(rgba(15,23,42,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.04)_1px,transparent_1px)] bg-[size:44px_44px] [mask-image:linear-gradient(to_bottom,black,transparent_88%)]" />
    </div>
  );
}

function HeroDashboardMockup() {
  const reduce = useReducedMotion();

  return (
    <div className="relative" style={{ perspective: 1600 }}>
      <FloatingOrbShape />
      <FloatingGemShape />
      <FloatingOrbitPath />

      <motion.div
        animate={reduce ? undefined : { y: [0, -10, 0] }}
        transition={reduce ? undefined : { duration: 6, repeat: Infinity, ease: "easeInOut" }}
        style={{ transformStyle: "preserve-3d" }}
        className="relative"
      >
        <div
          style={{ transform: "rotateY(-7deg) rotateX(4deg)" }}
          className="relative overflow-hidden rounded-[26px] border border-black/10 bg-card shadow-[0_40px_100px_rgba(30,41,110,0.22)]"
        >
          {!reduce && (
            <Meteors
              number={8}
              minDelay={0.4}
              maxDelay={2.4}
              minDuration={5}
              maxDuration={9}
              className="bg-primary/25"
            />
          )}

          <div className="relative flex">
            <aside className="hidden w-14 shrink-0 flex-col items-center gap-4 border-r border-border py-5 sm:flex">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Gauge className="h-4 w-4" />
              </span>
              {[Gauge, ReceiptText, Calculator, TrendingUp, UsersRound, Settings].map(
                (Icon, index) => (
                  <span
                    key={index}
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-lg",
                      index === 0 ? "bg-accent text-primary" : "text-muted-foreground",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                ),
              )}
            </aside>

            <div className="min-w-0 flex-1 p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">Buna, Andrei</p>
                  <p className="text-xs text-muted-foreground">4 documente noi de verificat azi</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="hidden h-8 items-center gap-2 rounded-lg border border-border bg-background px-2.5 text-xs text-muted-foreground sm:flex">
                    <Search className="h-3.5 w-3.5" />
                    Cauta
                  </span>
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground">
                    <Bell className="h-3.5 w-3.5" />
                  </span>
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-foreground text-[11px] font-semibold text-background">
                    A
                  </span>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                {heroStats.map((stat) => {
                  const Icon = stat.icon;

                  return (
                    <div
                      key={stat.label}
                      className="rounded-xl border border-border bg-background p-3"
                    >
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-primary">
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <p className="mt-2 text-base font-semibold">{stat.value}</p>
                      <p className="truncate text-[10px] text-muted-foreground">{stat.label}</p>
                    </div>
                  );
                })}
              </div>

              <div className="mt-3 grid gap-2.5 sm:grid-cols-[1.2fr_1fr]">
                <div className="rounded-xl border border-border bg-background p-3.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[11px] text-muted-foreground">Cash-flow estimat</p>
                      <p className="text-lg font-semibold">
                        <NumberTicker value={24980} currency="RON" />
                      </p>
                    </div>
                    <span className="rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success">
                      +12,3%
                    </span>
                  </div>
                  <div className="mt-2 h-16">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={cashFlowSeries}>
                        <defs>
                          <linearGradient id="heroCashFill" x1="0" x2="0" y1="0" y2="1">
                            <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.28} />
                            <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <Area
                          type="monotone"
                          dataKey="cash"
                          stroke="var(--color-primary)"
                          strokeWidth={2}
                          fill="url(#heroCashFill)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="rounded-xl border border-border bg-background p-3.5">
                  <p className="text-[11px] font-medium text-muted-foreground">Documente recente</p>
                  <div className="mt-2 space-y-2">
                    {heroRecentDocs.map((doc) => (
                      <div key={doc.title} className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-[11px] font-medium">{doc.title}</p>
                          <p className="truncate text-[10px] text-muted-foreground">{doc.meta}</p>
                        </div>
                        <span
                          className={cn(
                            "shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-medium",
                            doc.tone === "success" && "bg-success/10 text-success",
                            doc.tone === "warning" && "bg-warning/15 text-warning",
                            doc.tone === "info" && "bg-info/10 text-info",
                          )}
                        >
                          {doc.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={reduce ? false : { opacity: 0, x: 16, y: -10 }}
        animate={{ opacity: 1, x: 0, y: 0 }}
        transition={{ duration: 0.7, delay: 0.8, ease: easeOut }}
        className="absolute -right-6 -top-16 hidden w-44 rotate-[3deg] sm:block lg:-right-20 lg:-top-20"
      >
        <StatsWidget label="Incasari" className="shadow-[0_20px_50px_rgba(30,41,110,0.18)]" />
      </motion.div>
    </div>
  );
}

function FloatingOrbShape() {
  const reduce = useReducedMotion();

  return (
    <motion.div
      animate={reduce ? undefined : { y: [0, -14, 0] }}
      transition={reduce ? undefined : { duration: 7, repeat: Infinity, ease: "easeInOut" }}
      className="pointer-events-none absolute -right-8 -top-16 hidden h-40 w-40 rounded-full bg-[radial-gradient(circle_at_30%_30%,rgba(125,211,252,0.9),rgba(37,86,224,0.65)_60%,rgba(37,86,224,0.15)_100%)] opacity-80 blur-[1px] lg:block"
      aria-hidden
    />
  );
}

function FloatingGemShape() {
  const reduce = useReducedMotion();

  return (
    <motion.div
      animate={reduce ? undefined : { y: [0, 12, 0], rotate: [0, 6, 0] }}
      transition={reduce ? undefined : { duration: 8, repeat: Infinity, ease: "easeInOut" }}
      className="pointer-events-none absolute -bottom-10 -left-8 hidden h-14 w-14 lg:block"
      aria-hidden
    >
      <div
        className="h-full w-full bg-[linear-gradient(135deg,rgba(125,211,252,0.95),rgba(37,86,224,0.85))] shadow-[0_18px_40px_rgba(37,86,224,0.35)]"
        style={{ clipPath: "polygon(50% 0%, 100% 38%, 78% 100%, 22% 100%, 0% 38%)" }}
      />
    </motion.div>
  );
}

function FloatingOrbitPath() {
  return (
    <svg
      viewBox="0 0 200 200"
      className="pointer-events-none absolute -top-10 right-10 hidden h-40 w-40 opacity-50 lg:block"
      aria-hidden
    >
      <circle
        cx="100"
        cy="100"
        r="86"
        fill="none"
        stroke="var(--color-primary)"
        strokeWidth="1"
        strokeDasharray="2 8"
      />
      <circle cx="100" cy="14" r="3.5" fill="var(--color-primary)" />
      <circle cx="35" cy="150" r="2.5" fill="var(--color-primary)" />
    </svg>
  );
}

function ModulesMarquee() {
  return (
    <section className="border-y border-border bg-secondary/40 py-6">
      <div className="mx-auto max-w-6xl px-4">
        <p className="mb-4 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Ce gestionezi cu IMMapp
        </p>
        <Marquee className="p-0 [--duration:30s]" pauseOnHover repeat={3}>
          {moduleTags.map((item) => (
            <span
              key={item}
              className="mx-2 inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-muted-foreground shadow-sm"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-primary/50" />
              {item}
            </span>
          ))}
        </Marquee>
      </div>
    </section>
  );
}

function FeaturesSection() {
  return (
    <section id="functionalitati" className="px-4 py-20 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.25 }}
          variants={staggerParent}
          className="mx-auto max-w-2xl text-center"
        >
          <motion.p
            variants={fadeUp}
            className="text-xs font-semibold uppercase tracking-wide text-primary"
          >
            Functionalitati
          </motion.p>
          <motion.h2
            variants={fadeUp}
            className="mt-3 text-balance text-4xl font-semibold leading-tight sm:text-5xl"
          >
            Tot ce ai nevoie ca sa controlezi financiarul firmei.
          </motion.h2>
          <motion.p variants={fadeUp} className="mx-auto mt-4 max-w-xl text-muted-foreground">
            De la citirea automata a facturilor pana la raportul de TVA gata de verificat.
          </motion.p>
        </motion.div>

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.15 }}
          variants={staggerParent}
          className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3"
        >
          {featureCards.map((feature) => {
            const Icon = feature.icon;

            return (
              <motion.article
                key={feature.title}
                variants={fadeUp}
                onMouseMove={(event) => {
                  const rect = event.currentTarget.getBoundingClientRect();
                  event.currentTarget.style.setProperty(
                    "--spot-x",
                    `${event.clientX - rect.left}px`,
                  );
                  event.currentTarget.style.setProperty(
                    "--spot-y",
                    `${event.clientY - rect.top}px`,
                  );
                }}
                className="group relative overflow-hidden rounded-2xl border border-border bg-card p-6 transition duration-300 hover:border-primary/30 hover:shadow-[0_16px_45px_rgba(37,86,224,0.08)]"
              >
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                  style={{
                    background:
                      "radial-gradient(360px circle at var(--spot-x, 50%) var(--spot-y, 50%), rgba(37,86,224,0.1), transparent 70%)",
                  }}
                />
                <div className="relative">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-primary">
                    <Icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-5 font-semibold">{feature.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {feature.description}
                  </p>
                  <a
                    href="#workflow"
                    className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary"
                  >
                    Afla mai mult
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </a>
                </div>
              </motion.article>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}

function GrowthSection() {
  const reduce = useReducedMotion();
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = cardRef.current;

    if (!el || reduce) {
      return;
    }

    const tiltIn = animate(el, {
      opacity: [0, 1],
      y: [40, 0],
      rotateX: [12, 0],
      duration: 900,
      ease: "out(3)",
      autoplay: onScroll({ target: el, enter: "bottom-=10% top" }),
    });

    return () => {
      tiltIn.revert();
    };
  }, [reduce]);

  return (
    <section className="px-4 py-20 sm:px-6">
      <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <div style={{ perspective: 1400 }}>
          <div
            ref={cardRef}
            className="rounded-[28px] border border-border bg-card p-5 shadow-[0_24px_70px_rgba(30,41,110,0.08)]"
          >
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div>
                <p className="text-sm font-semibold">Performanta lunara</p>
                <p className="text-xs text-muted-foreground">Ultimele 30 de zile</p>
              </div>
              <span className="rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground">
                live workspace
              </span>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-3">
              {growthStats.map((stat) => (
                <div key={stat.label} className="rounded-xl bg-secondary/60 p-3">
                  <p className="text-xl font-semibold">{stat.value}</p>
                  <p
                    className={cn(
                      "text-[11px] font-medium",
                      stat.positive ? "text-success" : "text-destructive",
                    )}
                  >
                    {stat.delta}
                  </p>
                  <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{stat.label}</p>
                </div>
              ))}
            </div>

            <div className="mt-5 h-40">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={cashFlowSeries}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="var(--color-border)"
                  />
                  <XAxis dataKey="month" axisLine={false} tickLine={false} fontSize={11} />
                  <YAxis hide domain={[0, 80]} />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="cash"
                    stroke="var(--color-primary)"
                    strokeWidth={3}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="tva"
                    stroke="var(--color-chart-3)"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-5 flex items-center justify-between border-t border-border pt-4">
              <p className="text-sm font-semibold">Documente recente</p>
              <span className="text-xs font-medium text-primary">Vezi tot</span>
            </div>
            <div className="mt-3 flex items-center gap-2">
              {["A", "M", "R", "+3"].map((initial) => (
                <span
                  key={initial}
                  className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-card bg-accent text-[11px] font-semibold text-primary -ml-2 first:ml-0"
                >
                  {initial}
                </span>
              ))}
            </div>
          </div>
        </div>

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.3 }}
          variants={staggerParent}
        >
          <motion.p
            variants={fadeUp}
            className="text-xs font-semibold uppercase tracking-wide text-primary"
          >
            Construit pentru crestere
          </motion.p>
          <motion.h2
            variants={fadeUp}
            className="mt-3 max-w-md text-4xl font-semibold leading-tight sm:text-5xl"
          >
            Creste fara sa aduci un contabil intern.
          </motion.h2>
          <motion.p variants={fadeUp} className="mt-5 max-w-lg leading-7 text-muted-foreground">
            IMMapp scaleaza odata cu volumul de facturi, pastreaza rolurile firma-contabil clare si
            tine datele fiecarei companii separate, indiferent cat de repede creste echipa.
          </motion.p>

          <motion.ul variants={staggerParent} className="mt-6 space-y-3">
            {growthChecklist.map((item) => (
              <motion.li key={item} variants={fadeUp} className="flex items-start gap-3 text-sm">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-primary">
                  <Check className="h-3 w-3" />
                </span>
                <span className="text-foreground/90">{item}</span>
              </motion.li>
            ))}
          </motion.ul>

          <motion.div variants={fadeUp} className="mt-8">
            <Magnetic>
              <Button
                asChild
                className="h-11 rounded-lg bg-primary px-5 text-primary-foreground shadow-[0_16px_36px_rgba(37,86,224,0.3)] hover:bg-primary/90"
              >
                <Link to="/register">
                  Incepe gratuit
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </Magnetic>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}

function WorkflowSection() {
  const reduce = useReducedMotion();
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    if (reduce) {
      return;
    }

    const timer = createTimer({
      duration: 3600,
      loop: true,
      onLoop: () => {
        setActiveStep((current) => (current + 1) % featureSteps.length);
      },
    });

    return () => {
      timer.revert();
    };
  }, [reduce]);

  const active = featureSteps[activeStep];
  const ActiveIcon = active.icon;

  return (
    <section id="workflow" className="px-4 py-20 sm:px-6">
      <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[420px_minmax(0,1fr)] lg:items-start">
        <div className="lg:sticky lg:top-24">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">Workflow</p>
          <h2 className="mt-3 max-w-sm text-4xl font-semibold leading-tight sm:text-5xl">
            Un flux clar, de la fisier la decizie.
          </h2>
          <div className="mt-8 space-y-2">
            {featureSteps.map((step, index) => {
              const Icon = step.icon;

              return (
                <button
                  key={step.title}
                  type="button"
                  onClick={() => setActiveStep(index)}
                  className={cn(
                    "group w-full rounded-2xl border px-4 py-4 text-left transition duration-300",
                    activeStep === index
                      ? "border-primary bg-primary text-primary-foreground shadow-[0_16px_45px_rgba(37,86,224,0.28)]"
                      : "border-border bg-card text-foreground hover:border-primary/30",
                  )}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={cn(
                        "flex h-9 w-9 items-center justify-center rounded-xl",
                        activeStep === index ? "bg-white/15" : "bg-muted",
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="font-semibold">{step.title}</span>
                  </div>
                  <AnimatePresence initial={false}>
                    {activeStep === index && (
                      <motion.p
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.25, ease: easeOut }}
                        className="mt-3 overflow-hidden text-sm leading-6 text-primary-foreground/75"
                      >
                        {step.body}
                      </motion.p>
                    )}
                  </AnimatePresence>
                </button>
              );
            })}
          </div>
        </div>

        <div className="relative overflow-hidden rounded-[30px] border border-border bg-card p-5 shadow-[0_28px_80px_rgba(30,41,110,0.1)]">
          <div className="absolute inset-0 bg-[linear-gradient(rgba(37,86,224,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(37,86,224,0.035)_1px,transparent_1px)] bg-[size:36px_36px]" />
          <div className="relative rounded-[24px] border border-border bg-background p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
                  <ActiveIcon className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm font-semibold">{active.title}</p>
                  <p className="text-xs text-muted-foreground">Pas {activeStep + 1} din 4</p>
                </div>
              </div>
              <span className="rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
                automatizat
              </span>
            </div>

            <WorkflowWidget activeStep={activeStep} />
          </div>
        </div>
      </div>
    </section>
  );
}

function WorkflowWidget({ activeStep }: { activeStep: number }) {
  const fields = [
    ["Numar factura", "FA-1042", "98%"],
    ["Furnizor", "SC Atlas Media SRL", "94%"],
    ["CUI furnizor", "RO48291031", "99%"],
    ["Total plata", "7.725 RON", "91%"],
  ];

  return (
    <div className="mt-8 grid gap-5 lg:grid-cols-[minmax(0,1fr)_240px]">
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <p className="text-sm font-semibold">Factura scanata</p>
          <span className="text-xs text-muted-foreground">PDF</span>
        </div>
        <div className="mt-4 space-y-3">
          <div className="h-4 w-32 rounded bg-primary/70" />
          <div className="h-3 w-48 rounded bg-muted-foreground/20" />
          <div className="grid grid-cols-2 gap-3 pt-2">
            <div className="h-20 rounded-xl bg-muted" />
            <div className="h-20 rounded-xl bg-muted" />
          </div>
          <div className="space-y-2 pt-2">
            {[0, 1, 2, 3].map((item) => (
              <div key={item} className="grid grid-cols-[1fr_80px_70px] gap-2">
                <div className="h-3 rounded bg-muted" />
                <div className="h-3 rounded bg-muted" />
                <div className="h-3 rounded bg-muted" />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {fields.map(([label, value, confidence], index) => (
          <motion.div
            key={label}
            animate={{
              scale: activeStep === 1 && index === 3 ? 1.03 : 1,
              borderColor:
                activeStep === 1 && index === 3 ? "var(--color-primary)" : "var(--color-border)",
            }}
            transition={{ duration: 0.3 }}
            className="rounded-2xl border bg-card p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
              <span className="inline-flex items-center gap-1 text-[11px] text-success">
                <Check className="h-3 w-3" />
                {confidence}
              </span>
            </div>
            <p className="mt-1 truncate text-sm font-semibold">{value}</p>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function FinancialFlowSection() {
  return (
    <section className="px-4 py-20 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">
              Flux financiar
            </p>
            <SplitRevealTitle className="mt-3 max-w-2xl text-4xl font-semibold leading-tight sm:text-5xl">
              Documentele, TVA-ul si cash-flow-ul se misca in acelasi flux.
            </SplitRevealTitle>
            <p className="mt-5 max-w-xl leading-7 text-muted-foreground">
              Vezi ce documente intra, ce campuri cer atentie, cum se leaga modulele si ce impact au
              intarzierile asupra banilor firmei.
            </p>
          </div>
        </div>

        <div className="mt-10 grid gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)]">
          <OrbitMapWidget />
          <div className="grid gap-5">
            <DocumentPipelineWidget />
            <DraggableScenarioWidget />
          </div>
        </div>
      </div>
    </section>
  );
}

function SplitRevealTitle({ children, className }: { children: string; className?: string }) {
  const reduce = useReducedMotion();
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const target = titleRef.current;

    if (!target || reduce) {
      return;
    }

    const splitter = splitText(target, {
      words: { wrap: "clip" },
      chars: { class: "inline-block" },
      accessible: true,
    });
    const animation = animate(splitter.chars, {
      y: ["110%", "0%"],
      opacity: [0, 1],
      duration: 720,
      delay: stagger(14),
      ease: "out(3)",
      autoplay: onScroll({ target, enter: "bottom-=10% top" }),
    });

    return () => {
      animation.revert();
      splitter.revert();
    };
  }, [reduce]);

  return (
    <h2 ref={titleRef} className={className}>
      {children}
    </h2>
  );
}

function OrbitMapWidget() {
  const reduce = useReducedMotion();

  return (
    <article className="relative overflow-hidden rounded-[30px] border border-border bg-card p-5 shadow-[0_24px_80px_rgba(30,41,110,0.08)]">
      {!reduce && (
        <Meteors
          number={12}
          minDelay={0.2}
          maxDelay={2.4}
          minDuration={7}
          maxDuration={12}
          className="bg-primary/20"
        />
      )}
      <div className="relative z-10 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold">Harta modulelor</p>
          <p className="mt-1 text-sm text-muted-foreground">Documente, roluri si rapoarte legate</p>
        </div>
        <span className="rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground">
          live workspace
        </span>
      </div>

      <div className="relative z-10 mt-6 grid gap-6 md:grid-cols-[minmax(0,1fr)_230px] md:items-center">
        <div className="relative mx-auto flex h-[340px] w-full max-w-[380px] items-center justify-center overflow-hidden rounded-[28px] border border-border bg-background">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(37,86,224,0.1),transparent_58%)]" />
          {!reduce ? (
            <>
              <OrbitingCircles
                radius={118}
                duration={22}
                iconSize={58}
                className="border border-border bg-card shadow-[0_12px_35px_rgba(30,41,110,0.12)]"
              >
                {orbitItems.slice(0, 3).map((item) => {
                  const Icon = item.icon;

                  return (
                    <div key={item.label} className="flex flex-col items-center gap-0.5">
                      <Icon className="h-5 w-5" />
                      <span className="text-[9px] font-semibold">{item.label}</span>
                    </div>
                  );
                })}
              </OrbitingCircles>
              <OrbitingCircles
                reverse
                radius={72}
                duration={16}
                iconSize={48}
                className="border border-border bg-muted shadow-[0_10px_24px_rgba(30,41,110,0.08)]"
              >
                {orbitItems.slice(3).map((item) => {
                  const Icon = item.icon;

                  return (
                    <div key={item.label} className="flex flex-col items-center gap-0.5">
                      <Icon className="h-4 w-4" />
                      <span className="text-[8px] font-semibold">{item.label}</span>
                    </div>
                  );
                })}
              </OrbitingCircles>
            </>
          ) : (
            <div className="grid max-w-[240px] grid-cols-3 gap-2">
              {orbitItems.map((item) => {
                const Icon = item.icon;

                return (
                  <span
                    key={item.label}
                    className="flex h-16 flex-col items-center justify-center gap-1 rounded-2xl border border-border bg-card text-[10px] font-semibold"
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </span>
                );
              })}
            </div>
          )}
          <div className="absolute left-1/2 top-1/2 flex h-28 w-28 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border border-black/10 bg-primary text-primary-foreground shadow-[0_22px_70px_rgba(37,86,224,0.32)]">
            <Gauge className="h-6 w-6" />
            <span className="mt-2 text-sm font-semibold">IMMapp</span>
            <span className="text-[10px] text-primary-foreground/65">hub date</span>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-background p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Semnal financiar</p>
              <p className="mt-1 text-2xl font-semibold">+18%</p>
            </div>
            <span className="rounded-full bg-success/10 px-2.5 py-1 text-xs font-medium text-success">
              trend
            </span>
          </div>
          <div className="mt-5 h-32">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={cashFlowSeries}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="var(--color-border)"
                />
                <XAxis dataKey="month" axisLine={false} tickLine={false} fontSize={10} />
                <YAxis hide domain={[0, 80]} />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="cash"
                  stroke="var(--color-primary)"
                  strokeWidth={3}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
                <Line
                  type="monotone"
                  dataKey="tva"
                  stroke="var(--color-chart-3)"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </article>
  );
}

function DocumentPipelineWidget() {
  const reduce = useReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  const pathRef = useRef<SVGPathElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const path = pathRef.current;

    if (!root || !path || reduce) {
      return;
    }

    const drawable = createDrawable(path);
    const timeline = createTimeline({
      loop: true,
      loopDelay: 700,
      defaults: { ease: "out(3)" },
    })
      .set(drawable, { draw: "0 0" })
      .add(drawable, { draw: "0 1", duration: 1500, ease: "inOut(3)" }, 0)
      .add(
        root.querySelectorAll("[data-pipeline-node]"),
        {
          opacity: [0.32, 1],
          scale: [0.78, 1],
          duration: 520,
          delay: stagger(180),
        },
        120,
      )
      .add(
        root.querySelectorAll("[data-pipeline-row]"),
        {
          opacity: [0, 1],
          x: [-14, 0],
          duration: 520,
          delay: stagger(140),
        },
        280,
      )
      .add(drawable, { draw: "1 1", duration: 760, ease: "inOut(3)" }, "+=900");

    return () => {
      timeline.revert();
    };
  }, [reduce]);

  return (
    <article
      ref={rootRef}
      className="relative overflow-hidden rounded-[28px] border border-border bg-card p-5 shadow-[0_20px_65px_rgba(30,41,110,0.07)]"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold">Pipeline animat</p>
          <p className="mt-1 text-sm text-muted-foreground">De la import la raportare</p>
        </div>
        <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
          4 pasi
        </span>
      </div>

      <div className="relative mt-5 min-h-[270px] overflow-hidden rounded-2xl border border-border bg-background p-4">
        <svg
          viewBox="0 0 460 150"
          className="absolute inset-x-4 top-6 h-36 w-[calc(100%-2rem)] overflow-visible"
          aria-hidden="true"
        >
          <path
            ref={pathRef}
            d="M22 92 C96 18 160 28 214 84 C270 142 332 122 438 34"
            fill="none"
            stroke="var(--color-primary)"
            strokeLinecap="round"
            strokeWidth="3"
          />
        </svg>

        <div className="relative h-40">
          {pipelineEvents.map((event, index) => {
            const Icon = event.icon;
            const positions = [
              { left: "8%", top: "55%" },
              { left: "34%", top: "16%" },
              { left: "61%", top: "58%" },
              { left: "90%", top: "18%" },
            ];

            return (
              <div
                key={event.label}
                className="absolute -translate-x-1/2 -translate-y-1/2"
                style={positions[index]}
              >
                <span
                  data-pipeline-node
                  className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-card shadow-[0_14px_40px_rgba(30,41,110,0.12)]"
                >
                  <Icon className="h-5 w-5" />
                </span>
              </div>
            );
          })}
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          {pipelineEvents.map((event) => (
            <div
              key={event.label}
              data-pipeline-row
              className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 py-2"
            >
              <span className="text-xs font-semibold">{event.label}</span>
              <span className="text-[11px] text-muted-foreground">{event.value}</span>
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}

function DraggableScenarioWidget() {
  const reduce = useReducedMotion();
  const trackRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLButtonElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const valueRef = useRef<HTMLSpanElement>(null);
  const amountRef = useRef<HTMLSpanElement>(null);
  const stateRef = useRef<HTMLSpanElement>(null);
  const draggableRef = useRef<ReturnType<typeof createDraggable> | null>(null);

  const syncScenarioUi = useCallback((progress: number) => {
    const nextProgress = Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0));
    const days = Math.round(22 - nextProgress * 13);
    const tva = Math.round(2600 + nextProgress * 3600);
    const state =
      nextProgress < 0.34
        ? "presiune mica"
        : nextProgress < 0.68
          ? "presiune medie"
          : "presiune mare";

    if (fillRef.current) {
      fillRef.current.style.width = `${Math.max(12, Math.round(nextProgress * 100))}%`;
    }

    if (valueRef.current) {
      valueRef.current.textContent = `${days} zile`;
    }

    if (amountRef.current) {
      amountRef.current.textContent = `${tva.toLocaleString("ro-RO")} RON`;
    }

    if (stateRef.current) {
      stateRef.current.textContent = state;
    }
  }, []);

  useEffect(() => {
    const track = trackRef.current;
    const handle = handleRef.current;
    const defaultProgress = 0.44;

    if (!track || !handle) {
      return;
    }

    syncScenarioUi(defaultProgress);

    if (reduce) {
      const range = Math.max(0, track.clientWidth - handle.offsetWidth - 8);
      handle.style.transform = `translate3d(${range * defaultProgress}px, 0, 0)`;
      return;
    }

    const draggable = createDraggable(handle, {
      container: track,
      containerPadding: 4,
      x: true,
      y: false,
      releaseEase: "out(3)",
      onUpdate: (self) => syncScenarioUi(self.progressX),
      onSettle: (self) => syncScenarioUi(self.progressX),
    });

    draggableRef.current = draggable;
    draggable.progressX = defaultProgress;
    syncScenarioUi(defaultProgress);

    return () => {
      draggable.revert();
      draggableRef.current = null;
    };
  }, [reduce, syncScenarioUi]);

  const resetScenario = () => {
    const defaultProgress = 0.44;
    const draggable = draggableRef.current;

    if (draggable) {
      draggable.progressX = defaultProgress;
      syncScenarioUi(defaultProgress);
      return;
    }

    const track = trackRef.current;
    const handle = handleRef.current;

    if (track && handle) {
      const range = Math.max(0, track.clientWidth - handle.offsetWidth - 8);
      handle.style.transform = `translate3d(${range * defaultProgress}px, 0, 0)`;
    }

    syncScenarioUi(defaultProgress);
  };

  return (
    // Deliberately fixed-dark regardless of light/dark mode -- a
    // "device mockup" card, same idea as the app shell's own always-dark
    // sidebar. Was `bg-foreground text-background`, which looked right in
    // light mode by coincidence (foreground is dark there) but inverts to
    // a jarring light card once .dark flips foreground/background too.
    <article className="relative overflow-hidden rounded-[28px] border border-border bg-[oklch(0.19_0.02_262)] p-5 text-[oklch(0.99_0.003_260)] shadow-[0_20px_65px_rgba(30,41,110,0.16)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold">Scenariu cash-flow</p>
          <p className="mt-1 text-sm text-[oklch(0.99_0.003_260)]/55">
            Intarzieri si impact estimat
          </p>
        </div>
        <button
          type="button"
          onClick={resetScenario}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/8 text-[oklch(0.99_0.003_260)]/70 transition hover:bg-white/14 hover:text-[oklch(0.99_0.003_260)]"
          aria-label="Reseteaza scenariul"
        >
          <RotateCcw className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_160px] sm:items-end">
        <div>
          <div className="flex items-center gap-2 text-xs text-[oklch(0.99_0.003_260)]/55">
            <MousePointer2 className="h-4 w-4" />
            Trage nivelul intarzierii incasarilor
          </div>
          <div
            ref={trackRef}
            className="relative mt-4 h-14 touch-none rounded-full border border-white/10 bg-white/8 p-1"
          >
            <div className="absolute inset-y-1 left-1 rounded-full bg-white/10" />
            <div
              ref={fillRef}
              className="absolute inset-y-1 left-1 rounded-full bg-[oklch(0.99_0.003_260)] transition-[width] duration-200"
              style={{ width: "44%" }}
            />
            <button
              ref={handleRef}
              type="button"
              className="absolute left-1 top-1 z-10 flex h-12 w-12 touch-none items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_12px_34px_rgba(37,86,224,0.4)]"
              aria-label="Muta scenariul de cash-flow"
            >
              <MousePointer2 className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/8 p-4">
          <p className="text-xs text-[oklch(0.99_0.003_260)]/50">Runway estimat</p>
          <p className="mt-2 text-3xl font-semibold">
            <span ref={valueRef}>16 zile</span>
          </p>
          <p className="mt-3 text-xs text-[oklch(0.99_0.003_260)]/50">TVA impact</p>
          <p className="mt-1 font-mono text-sm">
            <span ref={amountRef}>4.184 RON</span>
          </p>
          <p className="mt-3 rounded-full bg-white/10 px-2.5 py-1 text-center text-xs text-[oklch(0.99_0.003_260)]/65">
            <span ref={stateRef}>presiune medie</span>
          </p>
        </div>
      </div>
    </article>
  );
}

function ReportsSection() {
  return (
    <section id="rapoarte" className="px-4 py-20 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">Rapoarte</p>
            <h2 className="mt-3 max-w-xl text-4xl font-semibold leading-tight sm:text-5xl">
              Datele contabile devin rapoarte pe care le intelegi.
            </h2>
            <p className="mt-5 max-w-lg leading-7 text-muted-foreground">
              In loc sa vanezi valori in tabele, vezi unde se misca firma: cash-flow, TVA, venituri,
              cheltuieli si profitabilitate.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-[1fr_0.8fr]">
            <div className="rounded-[26px] border border-border bg-card p-5 shadow-[0_24px_70px_rgba(30,41,110,0.08)]">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">Raport cash-flow</p>
                  <p className="text-xs text-muted-foreground">Ultimele 7 zile</p>
                </div>
                <span className="rounded-full bg-success/10 px-3 py-1 text-xs font-medium text-success">
                  pozitiv
                </span>
              </div>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={cashFlowArea}>
                    <defs>
                      <linearGradient id="cashFlowFill" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.22} />
                        <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="day" axisLine={false} tickLine={false} fontSize={11} />
                    <YAxis hide domain={[0, 60]} />
                    <Tooltip />
                    <Area
                      type="monotone"
                      dataKey="value"
                      stroke="var(--color-primary)"
                      strokeWidth={3}
                      fill="url(#cashFlowFill)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-[26px] border border-border bg-primary p-5 text-primary-foreground shadow-[0_24px_70px_rgba(30,41,110,0.18)]">
                <p className="text-xs text-primary-foreground/70">Total estimat</p>
                <p className="mt-3 text-4xl font-semibold">
                  <NumberTicker value={4120} currency="RON" />
                </p>
                <p className="mt-2 text-xs text-primary-foreground/70">
                  TVA de verificat luna aceasta
                </p>
              </div>
              <div className="rounded-[26px] border border-border bg-card p-5">
                <p className="text-sm font-semibold">Scor date</p>
                <div className="mt-4 h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dataScoreSeries}>
                      <XAxis dataKey="label" axisLine={false} tickLine={false} fontSize={11} />
                      <YAxis hide domain={[0, 100]} />
                      <Bar dataKey="value" radius={[10, 10, 10, 10]}>
                        {dataScoreSeries.map((entry, index) => (
                          <Cell
                            key={entry.label}
                            fill={
                              index === 0
                                ? "var(--color-primary)"
                                : index === 2
                                  ? "var(--color-chart-3)"
                                  : "var(--color-chart-5)"
                            }
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function PromptSection() {
  const reduce = useReducedMotion();

  return (
    <section className="overflow-hidden border-y border-border bg-card py-20">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
            Intrebari utile
          </p>
          <h2 className="mt-3 max-w-xl text-4xl font-semibold leading-tight sm:text-5xl">
            Pornesti de la intrebarile pe care oricum le-ai pune contabilului.
          </h2>
          <p className="mt-5 max-w-lg leading-7 text-muted-foreground">
            IMMapp transforma intrebarile recurente despre TVA, incasari, clienti si campuri lipsa
            in verificari rapide pe datele firmei.
          </p>
        </div>

        <div className="relative overflow-hidden rounded-[28px] border border-border bg-background shadow-[0_24px_80px_rgba(30,41,110,0.08)]">
          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-20 bg-gradient-to-b from-background to-transparent" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-20 bg-gradient-to-t from-background to-transparent" />
          {reduce ? (
            <div className="grid gap-3 p-5 sm:grid-cols-2">
              {scrollQuestions.map((prompt) => (
                <span
                  key={prompt}
                  className="rounded-2xl border border-border bg-card px-4 py-3 text-sm font-semibold"
                >
                  {prompt}
                </span>
              ))}
            </div>
          ) : (
            <ScrollText texts={scrollQuestions} className="max-w-full" />
          )}
        </div>
      </div>

      <div className="mx-auto mt-12 grid max-w-5xl gap-4 px-4 md:grid-cols-3">
        {recommendations.map((item) => (
          <article
            key={item.title}
            className="rounded-[24px] border border-border bg-background p-5"
          >
            <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-primary">
              <Sparkles className="h-5 w-5" />
            </div>
            <h3 className="font-semibold">{item.title}</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.body}</p>
            <p className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-primary">
              {item.action}
              <ArrowRight className="h-4 w-4" />
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

function SecuritySection() {
  return (
    <section id="securitate" className="px-4 py-20 sm:px-6">
      <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
            Securitate si conformitate
          </p>
          <h2 className="mt-3 max-w-xl text-4xl font-semibold leading-tight sm:text-5xl">
            Pentru documente financiare, increderea trebuie sa fie vizibila.
          </h2>
          <p className="mt-5 max-w-lg leading-7 text-muted-foreground">
            IMMapp trateaza separarea datelor, rolurile si exportul e-Factura ca parte din produs,
            nu ca detalii ascunse in setari.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {trustSignals.map((signal, index) => {
            const Icon = signal.icon;

            return (
              <motion.article
                key={signal.label}
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{ duration: 0.5, delay: index * 0.06, ease: easeOut }}
                className="rounded-[24px] border border-border bg-card p-5"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent text-primary">
                  <Icon className="h-5 w-5" />
                </span>
                <p className="mt-8 text-lg font-semibold">{signal.label}</p>
              </motion.article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function FinalCta() {
  const reduce = useReducedMotion();

  return (
    <section className="px-4 pb-20 sm:px-6">
      <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[32px] bg-primary px-6 py-16 text-center text-primary-foreground sm:px-10">
        <BorderBeam colorFrom="#ffffff" colorTo="#7dd3fc" duration={7} size={170} borderWidth={1} />
        {!reduce && (
          <Meteors
            number={12}
            minDelay={0.2}
            maxDelay={2.2}
            minDuration={6}
            maxDuration={10}
            className="bg-white/45"
          />
        )}
        <div className="relative mx-auto max-w-3xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/8 px-3 py-1 text-xs text-white/70">
            <Bell className="h-3.5 w-3.5" />
            Pregatit pentru primele fluxuri reale
          </span>
          <h2 className="mt-5 text-balance text-4xl font-semibold leading-tight sm:text-6xl">
            Mai putina introducere manuala. Mai multa claritate financiara.
          </h2>
          <p className="mx-auto mt-5 max-w-xl leading-7 text-white/70">
            Configureaza firma, incarca facturile si lasa IMMapp sa-ti arate ce trebuie verificat.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Magnetic>
              <Button
                asChild
                className="h-11 rounded-lg bg-white px-5 text-primary hover:bg-white/90"
              >
                <Link to="/register">
                  Incepe gratuit
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </Magnetic>
            <Button
              asChild
              variant="outline"
              className="h-11 rounded-lg border-white/25 bg-transparent px-5 text-primary-foreground hover:bg-white/10 hover:text-primary-foreground"
            >
              <Link to="/login">Autentificare</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
