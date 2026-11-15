import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowRight,
  Bell,
  CalendarCheck,
  CheckCircle2,
  Database,
  HeartPulse,
  KeyRound,
  Lock,
  Mail,
  Menu,
  Pill,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import careTeamImg from '../assets/images/care_team_portrait_1794733113691.jpg';
import clinicVisitImg from '../assets/images/clinic_consultation_1794733114333.jpg';
import heroCareImg from '../assets/images/hero_elderly_care_1794733113394.jpg';
import { HeroDashboardPreview } from './HeroDashboardPreview';

interface LandingViewProps {
  onNavigate: (path: string) => void;
  isAuthenticated?: boolean;
}

function ResilientImage({
  src,
  alt,
  fallbackTitle,
  className,
}: {
  src: string;
  alt: string;
  fallbackTitle: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-gradient-to-br from-[#ECFDF5] to-[#E5E7EB] p-8 text-center ${className ?? ''}`}
      >
        <HeartPulse className="mb-3 h-10 w-10 text-[#065F46]" />
        <span className="font-display text-sm font-semibold text-[#1F2937]">{fallbackTitle}</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}

function AnimatedStat({
  target,
  suffix = '',
  prefix = '',
  decimals = 0,
}: {
  target: number;
  suffix?: string;
  prefix?: string;
  decimals?: number;
}) {
  const [value, setValue] = useState(0);
  const [hasAnimated, setHasAnimated] = useState(false);
  const ref = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || hasAnimated) return;

    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReduced) {
      setValue(target);
      setHasAnimated(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setHasAnimated(true);
          const duration = 900;
          const start = performance.now();

          const step = (now: number) => {
            const elapsed = now - start;
            const progress = Math.min(1, elapsed / duration);
            const eased = 1 - Math.pow(1 - progress, 3);
            setValue(target * eased);
            if (progress < 1) {
              requestAnimationFrame(step);
            } else {
              setValue(target);
            }
          };
          requestAnimationFrame(step);
          observer.disconnect();
        }
      },
      { threshold: 0.25 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [target, hasAnimated]);

  return (
    <span ref={ref} className="font-mono tabular-nums">
      {prefix}
      {value.toFixed(decimals)}
      {suffix}
    </span>
  );
}

export function LandingView({ onNavigate, isAuthenticated = false }: LandingViewProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactRole, setContactRole] = useState('Family Caregiver');
  const [contactMessage, setContactMessage] = useState('');
  const [contactSubmitted, setContactSubmitted] = useState(false);
  const [contactError, setContactError] = useState('');

  const primaryCtaTarget = isAuthenticated ? '/dashboard' : '/get-started';
  const loginTarget = isAuthenticated ? '/dashboard' : '/login';

  const scrollToSection = (sectionId: string) => {
    setMobileNavOpen(false);
    const el = document.getElementById(sectionId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleContactSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!contactName.trim() || !emailPattern.test(contactEmail.trim()) || !contactMessage.trim()) {
      setContactError('Please enter your name, a valid email address, and a short message.');
      return;
    }
    setContactError('');
    setContactSubmitted(true);
    setContactName('');
    setContactEmail('');
    setContactMessage('');
  };

  return (
    <div className="min-h-screen bg-[#F7F7F5] text-[#1F2937]">
      {/* Subtle Ambient Emerald Background Gradient */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[560px] bg-[radial-gradient(ellipse_at_top_right,rgba(16,185,129,0.10),transparent_55%),radial-gradient(ellipse_at_top_left,rgba(13,148,136,0.08),transparent_50%)]"
      />

      {/* 1. Navigation Bar */}
      <header className="sticky top-0 z-40 border-b border-[#E5E7EB]/90 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-6 py-4">
          <button
            type="button"
            onClick={() => scrollToSection('home')}
            className="flex items-center gap-2.5 text-left whitespace-nowrap shrink-0"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#064E3B] to-[#0D9488] text-white">
              <HeartPulse className="h-4 w-4" />
            </span>
            <span className="font-display text-lg font-bold tracking-tight text-[#064E3B]">
              CareConnect AI
            </span>
          </button>

          <nav aria-label="Primary navigation" className="hidden lg:flex items-center gap-7 text-sm font-medium text-[#4B5563]">
            <button
              type="button"
              onClick={() => scrollToSection('home')}
              className="hover:text-[#064E3B] transition-colors whitespace-nowrap shrink-0"
            >
              Home
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('features')}
              className="hover:text-[#064E3B] transition-colors whitespace-nowrap shrink-0"
            >
              Features
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('how-it-works')}
              className="hover:text-[#064E3B] transition-colors whitespace-nowrap shrink-0"
            >
              How It Works
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('about')}
              className="hover:text-[#064E3B] transition-colors whitespace-nowrap shrink-0"
            >
              About
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('contact')}
              className="hover:text-[#064E3B] transition-colors whitespace-nowrap shrink-0"
            >
              Contact
            </button>
          </nav>

          <div className="hidden lg:flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => onNavigate(loginTarget)}
              className="inline-flex min-h-[40px] items-center justify-center rounded-lg px-4 py-2 text-sm font-medium text-[#1F2937] transition-colors hover:bg-[#F3F4F6] whitespace-nowrap shrink-0"
            >
              {isAuthenticated ? 'Dashboard' : 'Login'}
            </button>
            <button
              type="button"
              onClick={() => onNavigate(primaryCtaTarget)}
              className="inline-flex min-h-[40px] items-center justify-center rounded-lg bg-gradient-to-r from-[#064E3B] to-[#065F46] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:from-[#065F46] hover:to-[#047857] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#065F46] whitespace-nowrap shrink-0"
            >
              {isAuthenticated ? 'Open Workspace' : 'Get Started'}
            </button>
          </div>

          <button
            type="button"
            onClick={() => setMobileNavOpen((prev) => !prev)}
            aria-label="Toggle menu"
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[#E5E7EB] text-[#1F2937] lg:hidden"
          >
            {mobileNavOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {/* Responsive Mobile Menu */}
        {mobileNavOpen && (
          <div className="border-t border-[#E5E7EB] bg-white px-6 py-4 lg:hidden">
            <div className="flex flex-col space-y-2 text-sm font-medium text-[#374151]">
              <button type="button" onClick={() => scrollToSection('home')} className="py-2 text-left hover:text-[#065F46]">
                Home
              </button>
              <button type="button" onClick={() => scrollToSection('features')} className="py-2 text-left hover:text-[#065F46]">
                Features
              </button>
              <button type="button" onClick={() => scrollToSection('how-it-works')} className="py-2 text-left hover:text-[#065F46]">
                How It Works
              </button>
              <button type="button" onClick={() => scrollToSection('about')} className="py-2 text-left hover:text-[#065F46]">
                About
              </button>
              <button type="button" onClick={() => scrollToSection('contact')} className="py-2 text-left hover:text-[#065F46]">
                Contact
              </button>
              <div className="flex flex-col gap-2 border-t border-[#E5E7EB] pt-3">
                <button
                  type="button"
                  onClick={() => {
                    setMobileNavOpen(false);
                    onNavigate(loginTarget);
                  }}
                  className="min-h-[42px] rounded-lg border border-[#D1D5DB] px-4 py-2 text-center font-medium text-[#1F2937]"
                >
                  {isAuthenticated ? 'Dashboard' : 'Login'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMobileNavOpen(false);
                    onNavigate(primaryCtaTarget);
                  }}
                  className="min-h-[42px] rounded-lg bg-[#065F46] px-4 py-2 text-center font-semibold text-white"
                >
                  {isAuthenticated ? 'Open Workspace' : 'Get Started'}
                </button>
              </div>
            </div>
          </div>
        )}
      </header>

      <main>
        {/* 2–6. Hero Section with Headline, Subtitle, CTAs & Interactive Dashboard Preview */}
        <section id="home" className="relative overflow-hidden pt-12 pb-16 lg:pt-18 lg:pb-20">
          <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 px-6 lg:grid-cols-12">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
              className="lg:col-span-6"
            >
              <p className="text-xs font-semibold tracking-wide text-[#0D9488]">
                Elderly Healthcare Ecosystem · Built for Care Circles
              </p>
              <h1
                className="font-display mt-3 text-[clamp(2.35rem,4vw,3.65rem)] font-extrabold leading-[1.08] tracking-tight text-[#1F2937]"
                style={{ textWrap: 'balance' }}
              >
                Care That Connects. Health That Matters.
              </h1>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-[#4B5563] sm:text-lg">
                CareConnect AI brings elderly individuals, family members, and professional caretakers into one
                shared, dependable workspace—coordinating daily medication schedules, doctor appointments, health
                records, routines, and intelligent care briefs.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  onClick={() => onNavigate(primaryCtaTarget)}
                  className="inline-flex min-h-[46px] items-center gap-2 rounded-lg bg-gradient-to-r from-[#064E3B] to-[#065F46] px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:from-[#065F46] hover:to-[#047857] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#065F46] whitespace-nowrap shrink-0"
                >
                  <span>{isAuthenticated ? 'Open Workspace' : 'Get Started'}</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => scrollToSection('features')}
                  className="inline-flex min-h-[46px] items-center justify-center rounded-lg border border-[#D1D5DB] bg-white px-6 py-3 text-sm font-semibold text-[#1F2937] transition-colors hover:bg-[#F3F4F6] whitespace-nowrap shrink-0"
                >
                  Explore Features
                </button>
              </div>

              <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[#E5E7EB] pt-5 text-xs text-[#6B7280]">
                <span>Elderly Individuals</span>
                <span aria-hidden="true">·</span>
                <span>Family Caregivers</span>
                <span aria-hidden="true">·</span>
                <span>In-Home Caretakers</span>
                <span aria-hidden="true">·</span>
                <span>Server-Side Gemini Guidance</span>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
              className="lg:col-span-6"
            >
              <HeroDashboardPreview onGetStarted={() => onNavigate(primaryCtaTarget)} />
            </motion.div>
          </div>
        </section>

        {/* 7. Animated Trust Statistics Section (Clearly Labeled Illustrative Demo Statistics) */}
        <section className="border-y border-[#E5E7EB] bg-white py-12">
          <div className="mx-auto max-w-7xl px-6">
            <div className="flex flex-col justify-between gap-2 pb-8 sm:flex-row sm:items-end">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[#0D9488]">
                  Illustrative Demo Benchmarks
                </p>
                <h2 className="font-display mt-1 text-xl font-bold text-[#1F2937]">
                  Built to reduce missed doses and caregiver guesswork
                </h2>
              </div>
              <p className="text-xs text-[#6B7280]">
                Sample workflow metrics illustrating CareConnect AI capabilities
              </p>
            </div>

            <div className="grid grid-cols-1 gap-6 border-t border-[#E5E7EB] pt-8 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <div className="font-display text-3xl font-bold text-[#064E3B]">
                  <AnimatedStat target={96.4} decimals={1} suffix="%" />
                </div>
                <p className="mt-1.5 text-sm font-semibold text-[#1F2937]">
                  Sample Schedule Adherence
                </p>
                <p className="mt-1 text-xs text-[#6B7280]">
                  Illustrative target when daily time-blocks and alerts are active
                </p>
              </div>

              <div>
                <div className="font-display text-3xl font-bold text-[#064E3B]">
                  <AnimatedStat target={3} decimals={0} suffix=" Roles" />
                </div>
                <p className="mt-1.5 text-sm font-semibold text-[#1F2937]">
                  Unified Care Circle Sync
                </p>
                <p className="mt-1 text-xs text-[#6B7280]">
                  Elderly member, family relatives, and caretakers on one timeline
                </p>
              </div>

              <div>
                <div className="font-display text-3xl font-bold text-[#064E3B]">
                  <AnimatedStat target={2} decimals={0} prefix="< " suffix=" min" />
                </div>
                <p className="mt-1.5 text-sm font-semibold text-[#1F2937]">
                  AI Shift Handoff Review
                </p>
                <p className="mt-1 text-xs text-[#6B7280]">
                  Illustrative time to review daily adherence, vitals, and notes
                </p>
              </div>

              <div>
                <div className="font-display text-3xl font-bold text-[#064E3B]">
                  <AnimatedStat target={100} decimals={0} suffix="%" />
                </div>
                <p className="mt-1.5 text-sm font-semibold text-[#1F2937]">
                  Circle-Isolated Access
                </p>
                <p className="mt-1 text-xs text-[#6B7280]">
                  Every database query verified against explicit Care Circle membership
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 8. Feature Cards (Asymmetric Bento Grid for 5 Core Capabilities) */}
        <section id="features" className="py-20">
          <div className="mx-auto max-w-7xl px-6">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#0D9488]">
                Platform Capabilities
              </p>
              <h2
                className="font-display mt-2 text-3xl font-bold tracking-tight text-[#1F2937]"
                style={{ textWrap: 'balance' }}
              >
                Every daily care workflow organized in one calm interface.
              </h2>
              <p className="mt-3 text-base text-[#4B5563]">
                Purpose-built modules replace scattered paper pill charts, group texts, and clinic portals.
              </p>
            </div>

            <div className="mt-12 grid grid-cols-1 gap-6 lg:grid-cols-6">
              {/* Card 1: Medication Tracking (Wide) */}
              <div className="rounded-2xl border border-[#E5E7EB] bg-white p-7 shadow-sm lg:col-span-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#ECFDF5] text-[#065F46]">
                  <Pill className="h-5 w-5" />
                </div>
                <h3 className="font-display mt-5 text-lg font-bold text-[#1F2937]">
                  Medication Tracking &amp; Refill Alerts
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[#4B5563]">
                  Schedule morning, afternoon, and evening prescriptions with meal instructions. Anyone in the
                  Care Circle can log doses as taken or skipped with automatic stock decrements and refill
                  warnings.
                </p>
                <div className="mt-5 border-t border-[#E5E7EB] pt-4 text-xs text-[#6B7280]">
                  Time-block schedules · Attribution logs · Low-quantity alerts
                </div>
              </div>

              {/* Card 2: Appointment Management (Wide) */}
              <div className="rounded-2xl border border-[#E5E7EB] bg-white p-7 shadow-sm lg:col-span-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#ECFDF5] text-[#065F46]">
                  <CalendarCheck className="h-5 w-5" />
                </div>
                <h3 className="font-display mt-5 text-lg font-bold text-[#1F2937]">
                  Doctor Appointment Management
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[#4B5563]">
                  Track specialist visits, clinic addresses, telehealth links, preparation notes, and post-visit
                  summaries so every family member knows what was decided at the clinic.
                </p>
                <div className="mt-5 border-t border-[#E5E7EB] pt-4 text-xs text-[#6B7280]">
                  In-person &amp; telehealth · Visit outcomes · Shared prep checklists
                </div>
              </div>

              {/* Card 3: Family Collaboration */}
              <div className="rounded-2xl border border-[#E5E7EB] bg-white p-7 shadow-sm lg:col-span-2">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#ECFDF5] text-[#065F46]">
                  <Users className="h-5 w-5" />
                </div>
                <h3 className="font-display mt-5 text-lg font-bold text-[#1F2937]">
                  Family &amp; Caretaker Collaboration
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[#4B5563]">
                  Invite relatives and in-home caretakers via private invite codes. Share daily routines, vital
                  signs, and shift handoff notes in real time.
                </p>
              </div>

              {/* Card 4: AI Assistance */}
              <div className="rounded-2xl border border-[#0D9488]/30 bg-gradient-to-br from-white to-[#ECFDF5]/60 p-7 shadow-sm lg:col-span-2">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#065F46] text-white">
                  <Sparkles className="h-5 w-5" />
                </div>
                <h3 className="font-display mt-5 text-lg font-bold text-[#1F2937]">
                  Gemini AI Care Assistance
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[#4B5563]">
                  Generate plain-language daily medication guides, tailored doctor visit checklists, and calm shift
                  summary briefs directly from your live records.
                </p>
              </div>

              {/* Card 5: Smart Notifications */}
              <div className="rounded-2xl border border-[#E5E7EB] bg-white p-7 shadow-sm lg:col-span-2">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#ECFDF5] text-[#065F46]">
                  <Bell className="h-5 w-5" />
                </div>
                <h3 className="font-display mt-5 text-lg font-bold text-[#1F2937]">
                  Smart Care Notifications
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[#4B5563]">
                  Automatic real-time alerts notify the Care Circle when doses are skipped, refills run low,
                  vitals are flagged, or urgent notes are posted.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 9. How It Works Section (Three Simple Steps) */}
        <section id="how-it-works" className="border-y border-[#E5E7EB] bg-white py-20">
          <div className="mx-auto max-w-7xl px-6">
            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
              <div className="max-w-2xl">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#0D9488]">
                  How It Works
                </p>
                <h2 className="font-display mt-2 text-3xl font-bold tracking-tight text-[#1F2937]">
                  Up and running with your Care Circle in three steps.
                </h2>
              </div>
              <button
                type="button"
                onClick={() => onNavigate(primaryCtaTarget)}
                className="inline-flex min-h-[42px] items-center gap-2 rounded-lg bg-[#065F46] px-5 py-2 text-sm font-semibold text-white hover:bg-[#047857] whitespace-nowrap shrink-0"
              >
                <span>Start Step 1 Now</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-12 grid grid-cols-1 gap-8 md:grid-cols-3">
              <div className="rounded-2xl border border-[#E5E7EB] bg-[#F7F7F5] p-7">
                <span className="font-mono text-sm font-bold text-[#065F46]">01</span>
                <h3 className="font-display mt-3 text-lg font-bold text-[#1F2937]">
                  Create or Join a Care Circle
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[#4B5563]">
                  Sign in with Google, choose your role (Elderly Individual, Family Member, or Caretaker), and
                  either start a Care Circle or enter an invite code.
                </p>
              </div>

              <div className="rounded-2xl border border-[#E5E7EB] bg-[#F7F7F5] p-7">
                <span className="font-mono text-sm font-bold text-[#065F46]">02</span>
                <h3 className="font-display mt-3 text-lg font-bold text-[#1F2937]">
                  Organize Medications, Visits &amp; Routines
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[#4B5563]">
                  Enter prescriptions, doctor appointments, baseline health records, and daily hydration or
                  mobility habits—or load a sample schedule with one click.
                </p>
              </div>

              <div className="rounded-2xl border border-[#E5E7EB] bg-[#F7F7F5] p-7">
                <span className="font-mono text-sm font-bold text-[#065F46]">03</span>
                <h3 className="font-display mt-3 text-lg font-bold text-[#1F2937]">
                  Coordinate &amp; Prepare Together
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[#4B5563]">
                  Log daily doses and routines in real time, receive smart alerts when follow-up is needed, and
                  generate Gemini visit prep and shift briefs.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 10. Dedicated Family & Caretaker Collaboration Section (#about) */}
        <section id="about" className="py-20">
          <div className="mx-auto max-w-7xl px-6 space-y-16">
            <div className="grid grid-cols-1 items-stretch gap-12 lg:grid-cols-12">
              <div className="lg:col-span-6">
                <div className="h-full overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-sm">
                  <ResilientImage
                    src={heroCareImg}
                    alt="Elderly woman and family member reviewing daily medication schedule on a tablet"
                    fallbackTitle="Family & Elderly Alignment"
                    className="h-full min-h-[320px] w-full object-cover lg:h-full"
                  />
                </div>
              </div>

              <div className="flex flex-col justify-center lg:col-span-6">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#0D9488]">
                  Family &amp; Caretaker Collaboration
                </p>
                <h2
                  className="font-display mt-2 text-3xl font-bold tracking-tight text-[#1F2937]"
                  style={{ textWrap: 'balance' }}
                >
                  Built for the real-world rhythm of shared elder care.
                </h2>
                <p className="mt-4 text-base leading-relaxed text-[#4B5563]">
                  Caring for an aging parent often spans households, work schedules, and shift changes.
                  CareConnect AI keeps everyone informed without endless phone tag.
                </p>

                <div className="mt-7 divide-y divide-[#E5E7EB] border-t border-[#E5E7EB]">
                  <div className="py-4">
                    <h3 className="font-display text-sm font-bold text-[#1F2937]">
                      For Elderly Individuals
                    </h3>
                    <p className="mt-1 text-sm text-[#6B7280]">
                      Clear daily checklists, calm typography, and plain-language medication instructions that
                      preserve independence.
                    </p>
                  </div>
                  <div className="py-4">
                    <h3 className="font-display text-sm font-bold text-[#1F2937]">
                      For Family Members Near &amp; Far
                    </h3>
                    <p className="mt-1 text-sm text-[#6B7280]">
                      Peace of mind knowing morning medications were taken, upcoming specialist appointments are
                      prepared, and alerts arrive immediately.
                    </p>
                  </div>
                  <div className="py-4">
                    <h3 className="font-display text-sm font-bold text-[#1F2937]">
                      For Professional Caretakers
                    </h3>
                    <p className="mt-1 text-sm text-[#6B7280]">
                      Fast dose and vital logging with clear shift handoff notes and AI-synthesized summaries for
                      incoming caregivers.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 items-stretch gap-12 lg:grid-cols-12">
              <div className="flex flex-col justify-center lg:col-span-6">
                <div className="overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-sm">
                  <ResilientImage
                    src={careTeamImg}
                    alt="Home caretaker sitting warmly with senior gentleman over morning tea and pill organizer"
                    fallbackTitle="In-Home Caretaker Support"
                    className="h-72 w-full object-cover"
                  />
                  <div className="p-6">
                    <h3 className="font-display text-lg font-bold text-[#1F2937]">
                      Attributed Shift Logs
                    </h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-[#4B5563]">
                      Every medication confirmation, vital entry, and routine completion automatically records who
                      logged it—eliminating accidental double doses across shifts.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-col justify-center lg:col-span-6">
                <div className="overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-sm">
                  <ResilientImage
                    src={clinicVisitImg}
                    alt="Doctor listening carefully to an elderly patient during a calm outpatient visit"
                    fallbackTitle="Clinic & Doctor Visit Readiness"
                    className="h-72 w-full object-cover"
                  />
                  <div className="p-6">
                    <h3 className="font-display text-lg font-bold text-[#1F2937]">
                      Prepared Doctor Consultations
                    </h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-[#4B5563]">
                      Bring accurate vitals, active prescriptions, and Gemini-generated visit questions to every
                      appointment, then share outcome notes back to the entire Care Circle.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 11. Security and Privacy Section */}
        <section id="security" className="border-y border-[#E5E7EB] bg-white py-20">
          <div className="mx-auto max-w-7xl px-6">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#0D9488]">
                Security &amp; Privacy Architecture
              </p>
              <h2 className="font-display mt-2 text-3xl font-bold tracking-tight text-[#1F2937]">
                Private health data protected at every layer.
              </h2>
              <p className="mt-3 text-base text-[#4B5563]">
                CareConnect AI enforces strict authentication, database-level access rules, and server-side AI
                execution.
              </p>
            </div>

            <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-[#E5E7EB] bg-[#F7F7F5] p-6">
                <ShieldCheck className="h-5 w-5 text-[#065F46]" />
                <h3 className="font-display mt-3 text-sm font-bold text-[#1F2937]">
                  Verified Google Sign-In
                </h3>
                <p className="mt-1.5 text-xs leading-relaxed text-[#4B5563]">
                  Requires authenticated, email-verified sessions via Firebase Authentication before any read or
                  write operation.
                </p>
              </div>

              <div className="rounded-xl border border-[#E5E7EB] bg-[#F7F7F5] p-6">
                <Lock className="h-5 w-5 text-[#065F46]" />
                <h3 className="font-display mt-3 text-sm font-bold text-[#1F2937]">
                  Zero-Trust Circle Rules
                </h3>
                <p className="mt-1.5 text-xs leading-relaxed text-[#4B5563]">
                  Firestore Security Rules verify explicit Care Circle membership on every medication, record, and
                  message path.
                </p>
              </div>

              <div className="rounded-xl border border-[#E5E7EB] bg-[#F7F7F5] p-6">
                <KeyRound className="h-5 w-5 text-[#065F46]" />
                <h3 className="font-display mt-3 text-sm font-bold text-[#1F2937]">
                  Rotatable Invite Codes
                </h3>
                <p className="mt-1.5 text-xs leading-relaxed text-[#4B5563]">
                  Coordinators control access with private invite codes that can be rotated or revoked at any
                  time.
                </p>
              </div>

              <div className="rounded-xl border border-[#E5E7EB] bg-[#F7F7F5] p-6">
                <Database className="h-5 w-5 text-[#065F46]" />
                <h3 className="font-display mt-3 text-sm font-bold text-[#1F2937]">
                  Server-Side AI Processing
                </h3>
                <p className="mt-1.5 text-xs leading-relaxed text-[#4B5563]">
                  Gemini API requests run exclusively on the backend server with strict schema validation and no
                  exposed browser keys.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 12. Sample Testimonials / Illustrative Care Scenarios */}
        <section className="py-20">
          <div className="mx-auto max-w-7xl px-6">
            <div className="flex flex-col justify-between gap-2 md:flex-row md:items-end">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[#0D9488]">
                  Illustrative Care Scenarios · Sample Content
                </p>
                <h2 className="font-display mt-2 text-3xl font-bold tracking-tight text-[#1F2937]">
                  How different care roles use CareConnect AI
                </h2>
              </div>
              <p className="text-xs text-[#6B7280]">
                Sample personas illustrating intended platform workflows
              </p>
            </div>

            <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-3">
              <div className="flex flex-col justify-between rounded-2xl border border-[#E5E7EB] bg-white p-7">
                <p className="text-sm leading-relaxed text-[#374151]">
                  &ldquo;Before coordinating in one workspace, my brother and I were texting back and forth
                  every morning to confirm whether Mom took her blood pressure medication. Now we check the daily
                  schedule in seconds.&rdquo;
                </p>
                <div className="mt-6 border-t border-[#E5E7EB] pt-4">
                  <p className="font-display text-sm font-bold text-[#1F2937]">
                    Sample Family Caregiver
                  </p>
                  <p className="text-xs text-[#6B7280]">
                    Illustrative Scenario · Long-distance daughter
                  </p>
                </div>
              </div>

              <div className="flex flex-col justify-between rounded-2xl border border-[#E5E7EB] bg-white p-7">
                <p className="text-sm leading-relaxed text-[#374151]">
                  &ldquo;Having the AI visit prep checklist before cardiology appointments helps me bring the
                  exact questions and blood pressure readings my doctor needs, without rummaging through paper
                  folders.&rdquo;
                </p>
                <div className="mt-6 border-t border-[#E5E7EB] pt-4">
                  <p className="font-display text-sm font-bold text-[#1F2937]">
                    Sample Elderly Member
                  </p>
                  <p className="text-xs text-[#6B7280]">
                    Illustrative Scenario · Independent senior managing 3 prescriptions
                  </p>
                </div>
              </div>

              <div className="flex flex-col justify-between rounded-2xl border border-[#E5E7EB] bg-white p-7">
                <p className="text-sm leading-relaxed text-[#374151]">
                  &ldquo;During shift changes, I log morning routines and hydration, flag any unusual readings,
                  and leave a concise note so the evening family member has full context immediately.&rdquo;
                </p>
                <div className="mt-6 border-t border-[#E5E7EB] pt-4">
                  <p className="font-display text-sm font-bold text-[#1F2937]">
                    Sample Home Caretaker
                  </p>
                  <p className="text-xs text-[#6B7280]">
                    Illustrative Scenario · Daytime elder care specialist
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 13. Contact & Final CTA Section */}
        <section id="contact" className="border-t border-[#E5E7EB] bg-white py-20">
          <div className="mx-auto grid max-w-7xl grid-cols-1 gap-10 px-6 lg:grid-cols-12">
            {/* Final Emerald Gradient CTA Banner */}
            <div className="flex flex-col justify-between rounded-2xl bg-gradient-to-br from-[#064E3B] via-[#065F46] to-[#0F766E] p-8 text-white shadow-lg lg:col-span-7 lg:p-10">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-200">
                  Start Coordinating Today
                </p>
                <h2
                  className="font-display mt-3 text-3xl font-bold leading-tight text-white sm:text-4xl"
                  style={{ textWrap: 'balance' }}
                >
                  Give your care circle clarity, calm, and real-time connection.
                </h2>
                <p className="mt-4 max-w-xl text-base leading-relaxed text-emerald-50/90">
                  Create your Care Circle in moments, invite family members or caretakers with a secure code,
                  and keep daily medications, appointments, and vitals organized in one place.
                </p>
              </div>

              <div className="mt-8 flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  onClick={() => onNavigate(primaryCtaTarget)}
                  className="inline-flex min-h-[46px] items-center gap-2 rounded-lg bg-white px-6 py-3 text-sm font-semibold text-[#064E3B] shadow-sm transition-colors hover:bg-emerald-50 whitespace-nowrap shrink-0"
                >
                  <span>{isAuthenticated ? 'Go to Dashboard' : 'Get Started Free'}</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate(loginTarget)}
                  className="inline-flex min-h-[46px] items-center justify-center rounded-lg border border-emerald-300/40 bg-white/10 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/20 whitespace-nowrap shrink-0"
                >
                  {isAuthenticated ? 'View Care Circle' : 'Login to Account'}
                </button>
              </div>
            </div>

            {/* Contact Form */}
            <div className="rounded-2xl border border-[#E5E7EB] bg-[#F7F7F5] p-8 lg:col-span-5">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[#0D9488]">
                <Mail className="h-4 w-4" />
                <span>Contact CareConnect AI</span>
              </div>
              <h3 className="font-display mt-2 text-xl font-bold text-[#1F2937]">
                Questions about setting up your Care Circle?
              </h3>

              {contactSubmitted ? (
                <div className="mt-6 rounded-xl border border-emerald-200 bg-white p-6">
                  <div className="flex items-center gap-2 text-sm font-semibold text-[#065F46]">
                    <CheckCircle2 className="h-5 w-5" />
                    <span>Message received</span>
                  </div>
                  <p className="mt-2 text-sm text-[#4B5563]">
                    Thank you for reaching out. You can also start using the full platform immediately by
                    creating a Care Circle.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => onNavigate(primaryCtaTarget)}
                      className="rounded-lg bg-[#065F46] px-4 py-2 text-xs font-semibold text-white hover:bg-[#047857]"
                    >
                      Get Started
                    </button>
                    <button
                      type="button"
                      onClick={() => setContactSubmitted(false)}
                      className="rounded-lg border border-[#D1D5DB] bg-white px-4 py-2 text-xs font-medium text-[#374151]"
                    >
                      Send another message
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleContactSubmit} className="mt-5 space-y-4">
                  {contactError && (
                    <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-[#B91C1C]">
                      {contactError}
                    </p>
                  )}
                  <div>
                    <label htmlFor="contact-name" className="block text-xs font-semibold text-[#1F2937]">
                      Your Name *
                    </label>
                    <input
                      id="contact-name"
                      type="text"
                      required
                      value={contactName}
                      onChange={(e) => setContactName(e.target.value)}
                      placeholder="e.g. David Bennett"
                      className="mt-1 w-full rounded-lg border border-[#D1D5DB] bg-white px-3.5 py-2 text-sm focus:border-[#065F46] focus:outline-none"
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label htmlFor="contact-email" className="block text-xs font-semibold text-[#1F2937]">
                        Email Address *
                      </label>
                      <input
                        id="contact-email"
                        type="email"
                        required
                        value={contactEmail}
                        onChange={(e) => setContactEmail(e.target.value)}
                        placeholder="you@example.com"
                        className="mt-1 w-full rounded-lg border border-[#D1D5DB] bg-white px-3.5 py-2 text-sm focus:border-[#065F46] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label htmlFor="contact-role" className="block text-xs font-semibold text-[#1F2937]">
                        I am a
                      </label>
                      <select
                        id="contact-role"
                        value={contactRole}
                        onChange={(e) => setContactRole(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-[#D1D5DB] bg-white px-3 py-2 text-sm focus:border-[#065F46] focus:outline-none"
                      >
                        <option>Family Caregiver</option>
                        <option>Elderly Individual</option>
                        <option>Professional Caretaker</option>
                        <option>Care Agency Coordinator</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label htmlFor="contact-msg" className="block text-xs font-semibold text-[#1F2937]">
                      Message *
                    </label>
                    <textarea
                      id="contact-msg"
                      rows={3}
                      required
                      value={contactMessage}
                      onChange={(e) => setContactMessage(e.target.value)}
                      placeholder="Tell us how we can help your family or care team..."
                      className="mt-1 w-full rounded-lg border border-[#D1D5DB] bg-white px-3.5 py-2 text-sm focus:border-[#065F46] focus:outline-none"
                    />
                  </div>
                  <button
                    type="submit"
                    className="inline-flex min-h-[42px] w-full items-center justify-center rounded-lg bg-[#065F46] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#047857]"
                  >
                    Send Inquiry
                  </button>
                </form>
              )}
            </div>
          </div>
        </section>
      </main>

      {/* 14. Professional Footer */}
      <footer className="border-t border-[#E5E7EB] bg-[#F7F7F5] py-12">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid grid-cols-1 gap-8 md:grid-cols-12">
            <div className="md:col-span-5">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#064E3B] text-white">
                  <HeartPulse className="h-4 w-4" />
                </span>
                <span className="font-display text-base font-bold text-[#064E3B]">CareConnect AI</span>
              </div>
              <p className="mt-3 max-w-sm text-sm leading-relaxed text-[#6B7280]">
                Intelligent elderly healthcare management connecting seniors, family members, and caretakers
                through one secure Care Circle platform.
              </p>
            </div>

            <div className="md:col-span-2">
              <h4 className="font-display text-xs font-semibold uppercase tracking-wide text-[#1F2937]">
                Platform
              </h4>
              <ul className="mt-3 space-y-2 text-sm text-[#4B5563]">
                <li>
                  <button type="button" onClick={() => scrollToSection('home')} className="hover:text-[#064E3B]">
                    Home
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => scrollToSection('features')} className="hover:text-[#064E3B]">
                    Features
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => scrollToSection('how-it-works')} className="hover:text-[#064E3B]">
                    How It Works
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => scrollToSection('security')} className="hover:text-[#064E3B]">
                    Security
                  </button>
                </li>
              </ul>
            </div>

            <div className="md:col-span-2">
              <h4 className="font-display text-xs font-semibold uppercase tracking-wide text-[#1F2937]">
                Company
              </h4>
              <ul className="mt-3 space-y-2 text-sm text-[#4B5563]">
                <li>
                  <button type="button" onClick={() => scrollToSection('about')} className="hover:text-[#064E3B]">
                    About Collaboration
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => scrollToSection('contact')} className="hover:text-[#064E3B]">
                    Contact Us
                  </button>
                </li>
              </ul>
            </div>

            <div className="md:col-span-3">
              <h4 className="font-display text-xs font-semibold uppercase tracking-wide text-[#1F2937]">
                Application Routes
              </h4>
              <ul className="mt-3 space-y-2 text-sm text-[#4B5563]">
                <li>
                  <button type="button" onClick={() => onNavigate(primaryCtaTarget)} className="font-medium text-[#065F46] hover:underline">
                    {isAuthenticated ? 'Open Dashboard' : 'Get Started'}
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => onNavigate(loginTarget)} className="hover:text-[#064E3B]">
                    {isAuthenticated ? 'Care Circle Workspace' : 'Member Login'}
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => onNavigate('/medications')} className="hover:text-[#064E3B]">
                    Medication Tracker
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => onNavigate('/appointments')} className="hover:text-[#064E3B]">
                    Appointment Manager
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => onNavigate('/accept-invite')} className="hover:text-[#064E3B]">
                    Accept Invitation
                  </button>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-10 flex flex-col items-start justify-between gap-3 border-t border-[#E5E7EB] pt-6 text-xs text-[#6B7280] sm:flex-row sm:items-center">
            <span>© {new Date().getFullYear()} CareConnect AI. All rights reserved.</span>
            <span>Medical guidance tools support—never replace—licensed clinical care.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
