# e-SIWES Logbook — Memory Log & Task Tracker (brain.md)

Welcome to the central memory log for the e-SIWES Logbook Design project. This document serves as the persistent single-source-of-truth for project status, codebase patterns, architectural rules, tasks completed, and planned roadmap items.

---

## 1. Project Overview

**e-SIWES** is a digital logbook system designed to replace physical logbooks for students undergoing the Student Industrial Work Experience Scheme (SIWES). 
The application supports three roles:
1. **Students**: Fill logbook entries, upload file attachments, view supervisor feedback, and export entries to a formatted PDF.
2. **Supervisors**: Review assigned student entries, submit comments/feedback, and approve or reject submissions (individually or in batches).
3. **Administrators**: Oversee the entire system, register users, assign supervisors to students, and monitor system analytics.

The tech stack is built on **React (Vite)**, styled with **Tailwind CSS & Radix UI (shadcn components)**, and powered by **Supabase** with a seamless **Local Storage Mock Database fallback** for offline resilience.

---

## 2. Tasks & Progress Tracker

### Phase 1: Critical Security & Auth Fixes (Current Focus)
* [x] **Restrict Admin Self-Registration**: Remove `"admin"` option from the public `SignUpPage.tsx` to prevent unauthorized admin creation.
* [x] **XSS Mitigation in PDF Export**: Escape all user-supplied data in `pdfExport.ts` before rendering raw HTML strings in the printing iframe/window.
* [x] **Password Reset Flow implementation**:
  * [x] Create `ResetPasswordPage.tsx` component.
  * [x] Add `/reset-password` route in `App.tsx`.
  * [x] Update `redirectTo` inside `ForgotPasswordPage.tsx` to point to `/reset-password`.
* [x] **Delete Stale Files**: Safely delete the duplicate file `src/app/components/feedbackService.ts`.

### Phase 2: Data Integrity & Service Realignment
* [x] **Refactor Supervisor Dashboard Queries**: Port inline Supabase queries from `SupervisorDashboard.tsx` into `feedbackService.ts` to support Mock DB fallbacks.
* [x] **Fix Orphaned File Attachments**: Redesign file upload to bind files to a stable database entry ID rather than a temporary timestamp.
* [x] **Require Rejection Comments**: Modify supervisor reject modal to ensure comment validation.
* [x] **Timezone Adjustment**: Display local calendar dates correctly regardless of UTC shift.

### Phase 3: UI/UX Polish
* [x] **Prevent Login Flash**: Handle global auth loading cleanly inside `AppRoutes` (`App.tsx`).
* [ ] **Notification Links**: Allow clicking notifications to navigate students/supervisors directly to the relevant logbook entry.
* [x] **Edit Rejected Entries**: Re-enable editing for rejected entries to allow students to correct and resubmit their drafts.

### Bug Fixes (Post Phase 2)
* [x] **Fix `isSigningIn` race condition**: Set `isSigningIn.current = true` before `signInWithPassword` and reset on all exit paths in `AuthContext.tsx`.
* [x] **Wire up notifications**: Supervisor approve/reject/feedback actions now call `createNotification` targeting the student.
* [x] **Fix SignUp grid layout**: Changed `grid-cols-3` to `grid-cols-2` after admin role was removed.
* [x] **Fix blob URL memory leak**: File preview thumbnails now use cached blob URLs with proper cleanup via `useEffect`.

---

## 3. Codebase Architectural Patterns

### A. Dual Database Architecture (Supabase + Mock DB)
All data-fetching and manipulation operations must be routed through centralized service files (e.g., `logbookService.ts`, `feedbackService.ts`). Every service method must adopt the try-catch fallback pattern:
1. **Attempt Supabase query**: Call Supabase client methods.
2. **Fallback to Mock DB**: On error (network failure, RLS blocks, missing database tables), gracefully fetch, manipulate, and save state using the local storage utility `mockDb.ts`.

### B. Route Protection and Authentication
* The `AuthProvider` handles initializing the session, profile retrieval, and event subscriptions (`SIGNED_IN`, `SIGNED_OUT`, `TOKEN_REFRESHED`).
* Routes are guarded via `<ProtectedRoute allowedRole="...">` wrapper in `App.tsx`.
* Loading flags must block page rendering until the authenticated profile resides in the context.

---

## 4. Coding Standards & Guidelines

1. **Keep Component Design Elegant & Premium**: Avoid generic designs. Utilize rich gradients, smooth transitions, HSL color palettes, and glassmorphic micro-animations.
2. **Defensive Programming**:
   * Always check if the `user` and `profile` objects are not null before accessing sub-properties (e.g., `user.id`).
   * Properly revoke blob URLs created via `URL.createObjectURL` using `URL.revokeObjectURL(url)`.
3. **No Placeholders**: Never insert empty placeholder images. Create production-quality assets or code illustrations.
4. **Maintain Docstring Integrity**: Preserve existing comments and docstrings unless explicitly updating that logic.
5. **Keep brain.md Updated**: Always update task statuses, active plans, and project rules in `brain.md` whenever requirements, design decisions, or tasks change.
