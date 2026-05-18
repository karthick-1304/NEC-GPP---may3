import { Link } from 'react-router-dom';
import { ArrowRight, BookOpenCheck, Layers, ListChecks, ClipboardList, Trophy, Users } from 'lucide-react';
import { Button } from '@/components/ui/Button';

const sections = [
  {
    icon: BookOpenCheck,
    title: 'Practice — guided, gamified, gated',
    items: [
      'Subjects → Topics → Levels (Intermediate / Advanced) → Sets',
      'Each set has a threshold; cross it to unlock the next set',
      'Two levels per topic — Level 2 unlocks only after Level 1 is fully cleared',
      'Failed attempts don\'t hurt your stats — only your best score counts',
    ],
  },
  {
    icon: Layers,
    title: 'Subject collaboration across departments',
    items: [
      'Subjects can be created by Admins or any Department Head',
      'Other departments can request to collaborate; the owner approves',
      'Each dept can hide a subject from its own students/staff without affecting others',
      'Locking a subject freezes it for everyone except its super-access holder',
    ],
  },
  {
    icon: ClipboardList,
    title: 'Tests - GATE-Grade conditions',
    items: [
      'Two creation modes: Make-Questions and Intelli-Pick (auto-pulls from your practice bank)',
      'Mandatory full-screen mode; tab switches and window changes count as malpractice',
      'Up to 3 attempts per test; auto-submit on time-up or final malpractice',
    ],
  },
  {
    icon: Trophy,
    title: 'Where you stand',
    items: [
      'Dept heads, tutors, and admins each see a scoped progress view',
      'Per-student detail card with last attempts, current learning subjects',
      'Climb the ranks across your dept, batch, or globally.',
    ],
  },
  {
    icon: Users,
    title: 'Tutorward management',
    items: [
      'Staff can create tutorwardship for students from their dept + tutoring batch',
      'Add/remove students from their tutorward list',
    ],
  },
  {
    icon: ListChecks,
    title: 'Question types — exactly GATE',
    items: [
      'MCQ — 1 or 2 marks, (negative marking if applied)',
      'MSQ — 2 marks, all-or-nothing (no negative marking)',
      'NAT — 1 or 2 marks, ±0.0001 tolerance (no negative marking)',
    ],
  },
];

export default function AboutPortalPage() {
  return (
    <section className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-12 sm:py-20">
      <div className="text-center mb-12 animate-fade-in">
        <span className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800 border border-amber-200">
          About this portal
        </span>
        <h1 className="mt-4 text-4xl sm:text-5xl font-display font-extrabold text-navy-900 tracking-tight">
          How NEC GATE Portal works
        </h1>
        <p className="mt-4 text-slate-600 max-w-2xl mx-auto leading-relaxed">
          A quick tour of the platform workflows that was built around — practice, tests, leaderboards, and the access model that ties them together.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        {sections.map(s => (
          <div key={s.title} className="card card-hover p-6">
            <div className="flex items-start gap-4">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-navy-50 text-navy-700 shrink-0">
                <s.icon className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-display font-bold text-navy-900 text-lg">{s.title}</h2>
                <ul className="mt-3 space-y-2">
                  {s.items.map((it, i) => (
                    <li key={i} className="flex gap-2 text-sm text-slate-600 leading-relaxed">
                      <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />
                      {it}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-12 rounded-2xl bg-navy-50 border border-navy-100 p-6 sm:p-8 text-center">
        <h3 className="font-display font-bold text-navy-900 text-xl">Roles at a glance</h3>
        <p className="mt-2 text-slate-600 max-w-2xl mx-auto text-sm">
          Admins manage everything. Department Heads can monitor and own subjects and tests for their dept. Staff can mentor tutorward students. Students practice, attempt tests, and climb the leaderboard.
        </p>
        <Link to="/login" className="inline-block mt-5">
          <Button size="lg" rightIcon={<ArrowRight className="h-4 w-4" />}>Go to sign in</Button>
        </Link>
      </div>
    </section>
  );
}
