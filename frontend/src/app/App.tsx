import { Routes, Route, Navigate } from 'react-router-dom';

import { RequireAuth } from './RequireAuth';
import { RedirectIfAuthed } from './RedirectIfAuthed';

import { PublicLayout } from '@/components/layout/PublicLayout';
import { AppShell } from '@/components/layout/AppShell';

import HomePage         from '@/pages/public/Home';
import AboutUsPage      from '@/pages/public/AboutUs';
import AboutPortalPage  from '@/pages/public/AboutPortal';
import LoginPage        from '@/pages/public/Login';
import ForgotPasswordPage from '@/pages/public/ForgotPassword';

import SubjectsPage         from '@/pages/practice/SubjectsPage';
import TopicsPage           from '@/pages/practice/TopicsPage';
import LevelsPage           from '@/pages/practice/LevelsPage';
import SetsPage             from '@/pages/practice/SetsPage';
import PracticeAttemptPage  from '@/pages/practice/PracticeAttemptPage';
import PracticeResultPage   from '@/pages/practice/PracticeResultPage';
import SetEditorPage        from '@/pages/practice/SetEditorPage';

import TestsPage        from '@/pages/test/TestsPage';
import TestEditorPage   from '@/pages/test/TestEditorPage';
import TestAttemptPage  from '@/pages/test/TestAttemptPage';

import ProfilePage from '@/pages/profile/ProfilePage';

import TutorwardPage from '@/pages/tutor/TutorwardPage';
import AdminPage     from '@/pages/admin/AdminPage';
import ProgressPage  from '@/pages/progress/ProgressPage';

export default function App() {
  return (
    <Routes>
      {/* ─── PUBLIC ─────────────────────────────────────────────────── */}
      <Route element={<PublicLayout />}>
        <Route path="/"             element={<HomePage />} />
        <Route path="/about"        element={<AboutUsPage />} />
        <Route path="/about-portal" element={<AboutPortalPage />} />
        <Route element={<RedirectIfAuthed />}>
          <Route path="/login"           element={<LoginPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        </Route>
      </Route>

      {/* ─── AUTHENTICATED APP ──────────────────────────────────────── */}
      <Route element={<RequireAuth />}>
        {/* Fullscreen attempt routes — no AppShell, role-gated */}
        <Route element={<RequireAuth roles={['Student', 'Staff', 'Dept Head', 'Admin']} />}>
          <Route
            path="/practice/subjects/:subjectId/topics/:topicId/levels/:level/sets/:setId/attempt"
            element={<PracticeAttemptPage />}
          />
        </Route>
        <Route element={<RequireAuth roles={['Student']} />}>
          <Route path="/tests/:testId/attempt" element={<TestAttemptPage />} />
        </Route>

        {/* All other authed routes render inside the standard AppShell */}
        <Route element={<AppShell />}>
          {/* ─── Open to all roles ─────────────────────────────────── */}
          <Route path="/practice" element={<SubjectsPage />} />
          <Route path="/practice/subjects/:subjectId/topics" element={<TopicsPage />} />
          <Route path="/practice/subjects/:subjectId/topics/:topicId/levels" element={<LevelsPage />} />
          <Route path="/practice/subjects/:subjectId/topics/:topicId/levels/:level/sets" element={<SetsPage />} />
          <Route
            path="/practice/subjects/:subjectId/topics/:topicId/levels/:level/sets/:setId/result"
            element={<PracticeResultPage />}
          />
          <Route path="/profile"  element={<ProfilePage />} />
          <Route path="/tests"    element={<TestsPage />} />
          <Route path="/progress" element={<ProgressPage />} />

          {/* ─── Admin / Dept Head only (set + test editing) ───────── */}
          <Route element={<RequireAuth roles={['Admin', 'Dept Head']} />}>
            <Route
              path="/practice/subjects/:subjectId/topics/:topicId/levels/:level/sets/new"
              element={<SetEditorPage mode="create" />}
            />
            <Route
              path="/practice/subjects/:subjectId/topics/:topicId/levels/:level/sets/:setId/edit"
              element={<SetEditorPage mode="edit" />}
            />
            <Route path="/tests/new"          element={<TestEditorPage mode="create" />} />
            <Route path="/tests/:testId/edit" element={<TestEditorPage mode="edit" />} />
          </Route>

          {/* ─── Staff only ────────────────────────────────────────── */}
          <Route element={<RequireAuth roles={['Staff']} />}>
            <Route path="/tutorward" element={<TutorwardPage />} />
          </Route>

          {/* ─── Admin only ────────────────────────────────────────── */}
          <Route element={<RequireAuth roles={['Admin']} />}>
            <Route path="/admin" element={<AdminPage />} />
          </Route>
        </Route>
      </Route>

      {/* ─── 404 → home ─────────────────────────────────────────────── */}
      <Route path="*" element={<Navigate to="/practice" replace />} />
    </Routes>
  );
}
