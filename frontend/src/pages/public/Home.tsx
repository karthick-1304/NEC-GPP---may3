import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BookOpenCheck, Trophy, Sparkles, ShieldCheck, GraduationCap, Target, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export default function HomePage() {
  return (
    <>
      {/* ─── Hero ──────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-12 sm:pt-20 pb-16 sm:pb-24">
          <div className="grid lg:grid-cols-2 gap-10 items-center">
            <div className="animate-fade-in">
              <span className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800 border border-amber-200">
                <Sparkles className="h-3.5 w-3.5" />
                Built by NEC, for NEC students
              </span>
              <h1 className="mt-5 text-4xl sm:text-5xl lg:text-6xl font-display font-extrabold tracking-tight text-navy-900 leading-[1.05]">
                Prepare for <span className="text-amber-500">GATE</span>.
                <br />
                Earn it set by set.
              </h1>
              <p className="mt-5 text-base sm:text-lg text-slate-600 max-w-xl leading-relaxed">
                A focused practice + test platform with gamified progression, real-time leaderboards, and exam-grade scoring rules. Ace concepts at your pace, then prove it under timed conditions.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link to="/login">
                  <Button size="lg" rightIcon={<ArrowRight className="h-4 w-4" />}>Sign in to continue</Button>
                </Link>
                <Link to="/about-portal">
                  <Button size="lg" variant="outline">How it works</Button>
                </Link>
              </div>

              <div className="mt-10 grid grid-cols-3 gap-3 max-w-md">
                {[
                  { v: 'GATE-grade',  l: 'Scoring rules' },
                  { v: 'Adaptive',    l: 'Practice flow' },
                  { v: 'Multi-Branch',        l: 'Leaderboards' },
                ].map(s => (
                  <div key={s.l} className="rounded-xl bg-white/70 backdrop-blur border border-slate-200/60 px-3 py-3 text-center">
                    <div className="text-sm font-bold text-navy-800">{s.v}</div>
                    <div className="text-[0.7rem] uppercase tracking-wider text-slate-500 mt-0.5">{s.l}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Hero card mockup */}
            <div className="relative animate-slide-up">
              <div className="absolute -inset-6 bg-gradient-to-br from-amber-200/40 via-navy-200/30 to-transparent blur-2xl rounded-full" aria-hidden />
              <div className="relative card p-6 sm:p-8">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <div className="text-xs uppercase tracking-wider text-slate-500 font-semibold">Today's progress</div>
                    <div className="text-2xl font-display font-bold text-navy-900 mt-0.5">DSA · Trees</div>
                  </div>
                  <span className="rounded-full bg-emerald-100 text-emerald-700 px-3 py-1 text-xs font-semibold">
                    Set 3 of 5
                  </span>
                </div>
                <div className="space-y-3">
                  {[
                    { name: 'Set 1 — BST basics',     done: true,  score: '18 / 20' },
                    { name: 'Set 2 — Traversals',     done: true,  score: '16 / 20' },
                    { name: 'Set 3 — AVL Rotations',  done: false, current: true },
                    { name: 'Set 4 — Heaps',          done: false, locked: true },
                    { name: 'Set 5 — Segment Trees',  done: false, locked: true },
                  ].map((s, i) => (
                    <div key={i} className={`flex items-center justify-between rounded-xl border px-3 py-2.5 ${
                      s.current ? 'border-amber-300 bg-amber-50' :
                      s.done    ? 'border-emerald-200 bg-emerald-50/60' :
                                  'border-slate-200 bg-slate-50'
                    }`}>
                      <div className="flex items-center gap-3 min-w-0">
                        <span className={`grid h-7 w-7 place-items-center rounded-full text-xs font-bold ${
                          s.done    ? 'bg-emerald-500 text-white' :
                          s.current ? 'bg-amber-400 text-navy-900' :
                                      'bg-slate-200 text-slate-500'
                        }`}>{i + 1}</span>
                        <span className={`text-sm font-medium truncate ${s.locked ? 'text-slate-400' : 'text-navy-900'}`}>
                          {s.name}
                        </span>
                      </div>
                      <span className="text-xs text-slate-500 shrink-0 ml-3">
                        {s.score ?? (s.locked ? 'Locked' : 'Now')}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <div className="text-slate-500">Weekly score</div>
                    <Sparkline values={[12, 16, 14, 19, 22, 24, 28]} />
                  </div>
                  <div className="text-right">
                    <div className="inline-flex items-center gap-1 text-amber-600 font-bold text-base">
                      <TrendingUp className="h-4 w-4" />
                      +<AnimatedCounter to={28} />
                    </div>
                    <div className="text-[0.65rem] uppercase tracking-wider text-slate-400 font-semibold">this week</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Features ─────────────────────────────────────────────── */}
      <section className="bg-white border-y border-slate-100">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-display font-bold text-navy-900">Everything for the GATE journey</h2>
            <p className="mt-3 text-slate-600 max-w-2xl mx-auto">From curated practice sets that unlock as you master the basics, to full-length tests that mirror exam conditions.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              { icon: BookOpenCheck, title: 'Practice the right way',   text: 'Topic-wise sets across two levels — Intermediate and Advanced. Cross the threshold to unlock the next set.' },
              { icon: Target,         title: 'GATE-style scoring',       text: 'MCQ negative marking, MSQ all-or-nothing, NAT tolerance — exactly what you\'ll see on exam day.' },
              { icon: Trophy,         title: 'Where you stand',          text: 'Climb the ranks across your dept, batch, or globally.' },
              { icon: GraduationCap,  title: 'Tutor oversight',          text: 'Tutors track tutorward progress, identify weak topics, and step in early — no student left behind.' },
              { icon: ShieldCheck,    title: 'Anti-malpractice tests',   text: 'Full-screen lock, tab-switch detection, auto-submit, and 30-minute server evaluation window.' },
              { icon: Sparkles,       title: 'Intelli-Pick tests',       text: 'Test creators auto-pick fresh questions per topic — no hand-curation needed for weekly drills.' },
            ].map(f => (
              <div key={f.title} className="card card-hover p-6">
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-navy-50 text-navy-700">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 font-display font-bold text-navy-900 text-lg">{f.title}</h3>
                <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">{f.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CTA ──────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
        <div className="rounded-3xl bg-brand-gradient text-white px-6 sm:px-12 py-12 sm:py-16 relative overflow-hidden">
          <div className="absolute inset-0 bg-mesh opacity-30" aria-hidden />
          <div className="relative grid md:grid-cols-2 gap-6 items-center">
            <div>
              <h2 className="text-3xl sm:text-4xl font-display font-bold leading-tight">Ready when you are.</h2>
              <p className="mt-3 text-navy-100 leading-relaxed max-w-md">Sign in with your NEC credentials. Your dashboard, practice path, and pending tests are waiting for you.</p>
            </div>
            <div className="md:text-right">
              <Link to="/login">
                <Button size="lg" variant="amber" rightIcon={<ArrowRight className="h-4 w-4" />}>
                  Sign in to your account
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

// ─── Tiny sparkline of weekly scores (mock data on the home page) ────────
function Sparkline({ values }: { values: number[] }) {
  const w = 92, h = 28;
  if (!values.length) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = Math.max(1, max - min);
  const stepX = w / Math.max(1, values.length - 1);
  const pts = values.map((v, i) => {
    const x = i * stepX;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    return [x, y] as const;
  });
  const path = pts.map(([x, y], i) => (i === 0 ? `M${x},${y}` : `L${x},${y}`)).join(' ');
  const area = `${path} L${pts[pts.length - 1]![0]},${h} L0,${h} Z`;
  const last = pts[pts.length - 1]!;

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="mt-1">
      <defs>
        <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#fbbf24" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#fbbf24" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#sparkFill)" />
      <path d={path} fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="3" fill="#f59e0b" />
      <circle cx={last[0]} cy={last[1]} r="6" fill="#f59e0b" opacity="0.25">
        <animate attributeName="r" values="3;7;3" dur="1.6s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.4;0;0.4" dur="1.6s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}

// ─── easeOutCubic counter that animates from 0 → `to` once ───────────────
function AnimatedCounter({ to, duration = 1500 }: { to: number; duration?: number }) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(Math.round(to * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, duration]);
  return <>{val}</>;
}
