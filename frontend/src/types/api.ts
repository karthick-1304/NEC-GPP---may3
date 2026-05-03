// Mirrors backend response envelope and entity shapes used by the frontend.

export type Role = 'Admin' | 'Dept Head' | 'Staff' | 'Student';

export interface ApiEnvelope<T> {
  success: boolean;
  message: string;
  data: T;
}

export interface ApiErrorBody {
  success?: false;
  message: string;
  errors?: Array<{ field?: string; message: string }> | Array<Record<string, unknown>>;
  statusCode?: number;
}

// ─── User shapes returned by /auth/login and /users/me ─────────────────────
export interface AuthUser {
  user_id: number;
  full_name: string;
  email: string;
  role: Role;
  last_login: string | null;

  dept_id: number | null;
  dept_name: string | null;
  dept_code: string | null;

  // Student-only
  reg_num: string | null;
  practice_score: number | null;
  test_score: number | null;
  lev_1_completed: number | null;
  lev_2_completed: number | null;
  topics_completed: number | null;
  batch_year: string | null;

  // Staff-only
  is_tutor: 0 | 1 | null;
  tutor_batch_year: string | null;
}

export interface LoginResponse {
  accessToken: string;
  user: AuthUser;
}

export interface RefreshResponse {
  accessToken: string;
}

// ─── Common dropdowns ───────────────────────────────────────────────────────
export interface Department {
  dept_id: number;
  dept_name: string;
  dept_code: string;
}

// ─── Subject ────────────────────────────────────────────────────────────────
export interface Subject {
  subject_id: number;
  subject_name: string;
  locked: 0 | 1;
  creator: string;          // 'Admin' or dept_code of owner
  created_by: number | null;
  topics_count: number;
  created_at?: string;
  dept_sub_lock?: 0 | 1;    // present on /subjects (my list) for non-admin
  superAccess?: boolean;    // computed by backend or frontend
  collaboratorAccess?: boolean;
}

export interface Collaborator {
  dept_id: number;
  dept_name: string;
  dept_code: string;
  dept_sub_lock: 0 | 1;
}

// ─── Topic / Level / Set ────────────────────────────────────────────────────
export interface Topic {
  topic_id: number;
  topic_name: string;
  display_order: number;
  sets_level1: number | string;
  sets_level2: number | string;
  total_sets: number | string;
}

export interface LevelInfo {
  level: '1' | '2';
  label: string;
  description: string;
  set_count: number;
  locked?: boolean;
  completed_sets?: number;
  new_sets_available?: boolean;
}

export interface PracticeSet {
  set_id: number;
  topic_id?: number;
  level: '1' | '2';
  negative_marking: 0 | 1;
  threshold_percentage: number;
  total_marks: number;
  total_questions: number;
  display_order: number;
  // student-only flags (added in /sets response)
  set_name?: string;
  locked?: boolean;
  is_unlocked?: boolean;
  is_completed?: boolean;
}

// ─── Question ───────────────────────────────────────────────────────────────
export type QuestionType = 'MCQ' | 'MSQ' | 'NAT';

export interface QuestionForAttempt {
  question_id: number;
  question_type: QuestionType;
  question_text: string;
  option_a: string | null;
  option_b: string | null;
  option_c: string | null;
  option_d: string | null;
  marks: number;
  question_image_url: string | null;
  question_image_thumb_url: string | null;
}

export interface QuestionAdmin extends QuestionForAttempt {
  correct_answer: string;
  question_image_delete_url?: string | null;
}

export interface AnswerInput {
  question_id: number;
  answer: string | null;
}

export interface PracticeResult {
  total_score: number;
  total_marks: number;
  correct_count: number;
  wrong_count: number;
  attained_percentage: number;
  threshold_percentage: number;
  passed: boolean;
}

// ─── Test ───────────────────────────────────────────────────────────────────
export interface TestRecord {
  test_id: number;
  test_name: string;
  total_marks: number;
  total_questions: number;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  negative_marking: 0 | 1;
  created_by: number;
  status: 'ongoing' | 'upcoming' | 'ended';

  // Student-only enrich
  attempt_status?: 'InProgress' | 'Submitted' | null;
  attempt_count?: number | null;
  time_remaining_sec?: number;
  attempt_ui_label?: 'Start Test' | 'Resume Test' | 'Finished';

  // Staff/Admin/HOD enrich
  creator_role?: Role;
  creator_dept_code?: string | null;
  dept_participating?: boolean;
}

export interface TestAssignmentRow {
  academic_year: string;
  dept_id: number;
  dept_name: string;
  dept_code: string;
}

// ─── Pagination envelope ───────────────────────────────────────────────────
export interface Paged<T, K extends string = 'items'> {
  total: number;
  page: number;
  limit: number;
  // backend uses different keys per route — we'll always project to `items`
  // in lib/api so consumer code is uniform
  items: T[];
}

export type PageQuery = {
  page?: number;
  limit?: number;
  search?: string;
};
