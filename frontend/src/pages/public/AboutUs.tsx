import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, Building2, Users, Trophy, Heart,
  Eye, GraduationCap, Sparkles, BookOpen, Code2,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';

// ─── NEC's official Vision ────────────────────────────────────────────────────
// Source: nec.edu.in (verbatim — keep in sync if the institute publishes a
// revision).
const VISION =
  'Transforming lives through quality education and research with human values.';

// ─── People ───────────────────────────────────────────────────────────────────
// Photos live under `frontend/public/team/` and are referenced by absolute
// path (Vite serves `public/` at the site root). The <Avatar/> component
// gracefully falls back to coloured initials if the image is missing,
// so the page never renders broken-image icons.
interface Person {
  name: string;
  qual?: string;
  role: string;
  img: string;
}

const MENTORS: Person[] = [
  {
    name: 'Dr. K. Kalidasa Murugavel',
    qual: 'M.E., Ph.D.',
    role: 'Principal, NEC',
    img: '/team/principal.jpg',
  },
  {
    name: 'Dr. S. Kalaiselvi',
    role: 'Associate Professor, Department of CSE, NEC',
    img: '/team/kalaiselvi.jpg',
  },
];

interface Dev {
  name: string;
  batch: string;
  /** Used purely as a stable React key — never rendered. */
  key: string;
  img: string;
}

const DEVS: Dev[] = [
  { name: 'Ponkarthikeyan P', batch: 'B.E CSE · 2022–26', key: '2212076', img: '/team/ponkarthikeyan.jpg' },
  { name: 'Dinesh Ram A',     batch: 'B.E CSE · 2022–26', key: '2212046', img: '/team/dinesh-ram.jpg' },
  { name: 'Petchivaradhan L', batch: 'B.E CSE · 2022–26', key: '2212056', img: '/team/petchivaradhan.jpg' },
  { name: 'Karan S',          batch: 'B.E CSE · 2022–26', key: '2212047', img: '/team/karan.jpg' },
];

// ─── Avatar with initials fallback ────────────────────────────────────────────
const initials = (name: string) =>
  name
    .replace(/^Dr\.?\s+/i, '') // drop honorifics so we don't render "DK"
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

function Avatar({ src, name, size = 88 }: { src: string; name: string; size?: number }) {
  const [errored, setErrored] = useState(false);
  if (errored || !src) {
    return (
      <div
        className="grid place-items-center rounded-full bg-gradient-to-br from-navy-700 to-navy-900 text-white font-display font-bold ring-4 ring-white shadow-md select-none"
        style={{ width: size, height: size, fontSize: Math.round(size / 2.6) }}
        aria-label={name}
      >
        {initials(name)}
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={name}
      loading="lazy"
      onError={() => setErrored(true)}
      className="rounded-full object-cover ring-4 ring-white shadow-md"
      style={{ width: size, height: size }}
    />
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function AboutUsPage() {
  return (
    <>
      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 pt-12 sm:pt-20 pb-8">
        <div className="text-center mb-10 animate-fade-in">
          <span className="inline-flex items-center gap-2 rounded-full bg-navy-50 px-3 py-1 text-xs font-semibold text-navy-700 border border-navy-100">
            About National Engineering College
          </span>
          <h1 className="mt-4 text-4xl sm:text-5xl font-display font-extrabold text-navy-900 tracking-tight">
            A legacy of engineering excellence
          </h1>
          <p className="mt-4 text-slate-600 max-w-2xl mx-auto leading-relaxed">
            National Engineering College, Kovilpatti is an autonomous institution recognised
            for academic rigour, research output, and a deep commitment to its students' careers.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { icon: Building2, k: 'Est. 1984',  l: 'Decades of teaching' },
            { icon: Users,     k: 'NAAC A+',    l: 'Accredited' },
            { icon: Trophy,    k: 'AICTE',      l: 'Recognised' },
            { icon: Heart,     k: 'Autonomous', l: 'Anna University affiliated' },
          ].map((s) => (
            <div key={s.l} className="card p-5 text-center">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-amber-100 text-amber-700 mx-auto">
                <s.icon className="h-5 w-5" />
              </div>
              <div className="mt-3 font-display font-bold text-navy-900">{s.k}</div>
              <div className="text-xs text-slate-500 mt-0.5">{s.l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Vision ─────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 pb-12">
        <div className="card p-6 sm:p-10 relative overflow-hidden text-center">
          {/* Soft amber halo top-right + navy halo bottom-left for depth */}
          <div className="absolute -top-8 -right-8 h-40 w-40 rounded-full bg-amber-100/50 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-10 -left-10 h-40 w-40 rounded-full bg-navy-100/50 blur-3xl pointer-events-none" />

          <div className="relative inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 border border-amber-100">
            <Eye className="h-3.5 w-3.5" />
            Our Vision
          </div>
          <p className="relative mt-5 text-xl sm:text-2xl font-display font-bold text-navy-900 leading-relaxed italic max-w-3xl mx-auto">
            "{VISION}"
          </p>
        </div>
      </section>

      {/* ── Why GATE + Built in-house ───────────────────────────────────── */}
      <section className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 pb-12">
        <div className="card p-6 sm:p-10 space-y-6 text-slate-700 leading-relaxed">
          <div>
            <h2 className="text-xl font-display font-bold text-navy-900 mb-2 flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-amber-500" /> Why GATE matters here
            </h2>
            <p>
              GATE is the gateway to higher studies, premium core-engineering placements, and PSU
              careers. NEC has historically produced some of Tamil Nadu's strongest GATE qualifiers —
              and this portal is built to multiply that count.
            </p>
          </div>
          <div>
            <h2 className="text-xl font-display font-bold text-navy-900 mb-2 flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-amber-500" /> Built in-house
            </h2>
            <p>
              This platform was envisioned, designed, and developed end-to-end by NEC faculty and
              students for the specific way our departments coach for GATE — collaborative practice
              between departments, transparent progress for tutors, and exam-grade test conditions.
            </p>
          </div>
        </div>
      </section>

      {/* ── Mentors ────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 pb-12">
        <div className="text-center mb-8">
          <span className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 border border-amber-100">
            <GraduationCap className="h-3.5 w-3.5" />
            Project Mentors
          </span>
          <h2 className="mt-3 text-3xl sm:text-4xl font-display font-extrabold text-navy-900">
            Guided by
          </h2>
          <p className="text-slate-500 text-sm mt-1.5">
            The faculty who shaped the platform's direction
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-5">
          {MENTORS.map((m) => (
            <div key={m.name} className="card p-5 sm:p-6 flex items-center gap-4">
              <Avatar src={m.img} name={m.name} size={76} />
              <div className="min-w-0">
                <h3 className="font-display font-bold text-navy-900 leading-tight">{m.name}</h3>
                {m.qual && (
                  <p className="text-xs text-slate-400 mt-0.5 font-mono">{m.qual}</p>
                )}
                <p className="text-sm text-slate-600 mt-1.5 leading-snug">{m.role}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Developers ─────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 pb-16">
        <div className="text-center mb-8">
          <span className="inline-flex items-center gap-2 rounded-full bg-navy-50 px-3 py-1 text-xs font-semibold text-navy-700 border border-navy-100">
            <Code2 className="h-3.5 w-3.5" />
            Developers
          </span>
          <h2 className="mt-3 text-3xl sm:text-4xl font-display font-extrabold text-navy-900">
            Built by NEC students
          </h2>
          <p className="text-slate-500 text-sm mt-1.5">
            Final-year CSE undergraduates of the 2022–26 batch
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {DEVS.map((d) => (
            <div
              key={d.key}
              className="card p-5 text-center group transition-all hover:-translate-y-0.5 hover:shadow-card-hover"
            >
              <div className="flex justify-center">
                <Avatar src={d.img} name={d.name} size={128} />
              </div>
              <h3 className="font-display font-bold text-navy-900 mt-4 leading-tight">{d.name}</h3>
              <p className="text-xs text-slate-500 mt-1">{d.batch}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ────────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 pb-20">
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link to="/about-portal">
            <Button variant="outline" size="lg">How the portal works</Button>
          </Link>
          <Link to="/login">
            <Button size="lg" rightIcon={<ArrowRight className="h-4 w-4" />}>
              Sign in
            </Button>
          </Link>
        </div>
      </section>
    </>
  );
}
