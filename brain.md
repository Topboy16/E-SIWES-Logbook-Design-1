# e-SIWES Logbook — Memory Log & Task Tracker (brain.md)

> **Last Updated**: 2026-07-09
> This is the **single source of truth** for the e-SIWES Logbook Design project. Always keep this file current whenever requirements, files, design decisions, tasks, or architecture change.

---

## 1. Project Overview

**e-SIWES** is a digital logbook system designed to replace physical logbooks for students undergoing the Student Industrial Work Experience Scheme (SIWES).

### Roles
| Role | Responsibilities |
|---|---|
| **Student** | Fill logbook entries, upload file attachments, view supervisor feedback, export entries to PDF |
| **Supervisor** | Review assigned student entries, submit comments/feedback, approve or reject submissions (individually or batch) |
| **Admin** | Oversee the entire system, register users, assign supervisors to students, monitor analytics |

### Tech Stack
| Layer | Technology |
|---|---|
| Framework | React 18 + Vite 6 |
| Language | TypeScript 6 |
| Styling | Tailwind CSS v4 + Radix UI (shadcn components) |
| UI Library | Radix UI (full suite), MUI v7, Lucide React icons, Recharts, Motion |
| Forms | React Hook Form |
| Routing | React Router DOM v7 |
| Backend | Supabase (Auth + Postgres + Storage) |
| Offline Fallback | Local Storage Mock Database (mockDb.ts) |
| PDF | Custom pdfExport.ts using print iframe |
| DnD | React DnD (HTML5 backend) |
| Notifications | Sonner |
| Date | date-fns |
| Build | Vite, @tailwindcss/vite, @vitejs/plugin-react |

---

## 2. File & Directory Map

```
E-SIWES Logbook Design/
├── index.html                          # App entry point HTML
├── vite.config.ts                      # Vite configuration
├── package.json                        # Dependencies & scripts
├── postcss.config.mjs                  # PostCSS (Tailwind plugin)
├── .env                                # Environment variables (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_ADMIN_EMAIL)
├── brain.md                            # THIS FILE (project memory log)
├── README.md                           # Project readme
├── ATTRIBUTIONS.md                     # Third-party attributions
├── AuthContext.tsx                     # ROOT-LEVEL COPY — stale/deprecated; canonical is src/app/contexts/AuthContext.tsx
├── supabase/                           # Supabase project config & migrations
├── guidelines/                         # Project guidelines directory
└── src/
    ├── main.tsx                        # React root mount
    ├── supabase.ts                     # Supabase client initialization
    ├── styles/                         # Global CSS / Tailwind entry
    └── app/
        ├── App.tsx                     # Root router, ProtectedRoute, AppRoutes
        ├── contexts/
        │   └── AuthContext.tsx         # Auth state, signIn/signUp/signOut/updateProfile
        ├── services/
        │   ├── mockDb.ts               # Local Storage mock DB (getMockDb / saveMockDb / seedAdminIfNeeded)
        │   ├── logbookService.ts       # Logbook entry CRUD (Supabase + MockDB fallback)
        │   ├── feedbackService.ts      # Supervisor feedback/comment CRUD (Supabase + MockDB fallback)
        │   ├── fileUploadService.ts    # File upload & attachment binding to stable entry IDs
        │   ├── notificationService.ts  # createNotification, fetchNotifications (entry_id deep-link)
        │   ├── adminService.ts         # Admin user management, supervisor assignment, analytics
        │   └── pdfExport.ts            # PDF export via print iframe (XSS-sanitized)
        └── components/
            ├── LoginPage.tsx           # Login form (email + password, resend confirmation)
            ├── SignUpPage.tsx          # Sign-up form (student/supervisor/admin, passport photo)
            ├── ForgotPasswordPage.tsx  # Forgot password (redirectTo /reset-password)
            ├── ResetPasswordPage.tsx   # Token-based password reset form
            ├── CompleteProfilePage.tsx # Profile completion gate for new/legacy accounts
            ├── ProfilePage.tsx         # Editable user profile (photo, name, dept, etc.)
            ├── StudentDashboard.tsx    # Student main UI (logbook, entries, PDF, notifications)
            ├── SupervisorDashboard.tsx # Supervisor main UI (review, approve/reject/feedback)
            ├── AdminDashboard.tsx      # Admin main UI (user list, assignments, analytics)
            ├── NotificationBell.tsx    # Real-time notification bell with deep-link navigation
            ├── ReminderPanel.tsx       # Student reminder / deadline panel
            ├── figma/                  # Figma-generated component stubs
            └── ui/                     # shadcn/Radix UI primitives (48 files)
```

---

## 3. Application Routes

| Path | Component | Protection |
|---|---|---|
| `/` | LoginPage (or redirect if authed) | Public |
| `/signup` | SignUpPage | Public |
| `/forgot-password` | ForgotPasswordPage | Public |
| `/reset-password` | ResetPasswordPage | Public |
| `/complete-profile` | CompleteProfilePage | Auth required; profile_completed=false |
| `/profile` | ProfilePage | Auth required |
| `/student` | StudentDashboard | Protected (role=student) |
| `/supervisor` | SupervisorDashboard | Protected (role=supervisor) |
| `/admin` | AdminDashboard | Protected (role=admin) |

---

## 4. Tasks & Progress Tracker

### Phase 1: Critical Security & Auth Fixes — COMPLETE
* [x] **Restrict Admin Self-Registration**: Removed admin option from public SignUpPage.tsx.
* [x] **XSS Mitigation in PDF Export**: Escape all user-supplied data in pdfExport.ts.
* [x] **Password Reset Flow**:
  * [x] Create ResetPasswordPage.tsx
  * [x] Add /reset-password route in App.tsx
  * [x] Update redirectTo inside ForgotPasswordPage.tsx to point to /reset-password
* [x] **Delete Stale Files**: Deleted duplicate src/app/components/feedbackService.ts

### Phase 2: Data Integrity & Service Realignment — COMPLETE
* [x] **Refactor Supervisor Dashboard Queries**: Ported inline Supabase queries into feedbackService.ts.
* [x] **Fix Orphaned File Attachments**: Bind files to stable DB entry ID, not a timestamp.
* [x] **Require Rejection Comments**: Supervisor reject modal validates comment before rejecting.
* [x] **Timezone Adjustment**: Local calendar dates display correctly regardless of UTC shift.

### Phase 3: UI/UX Polish — COMPLETE
* [x] **Prevent Login Flash**: Auth loading handled cleanly inside AppRoutes (App.tsx).
* [x] **Notification Links**: Notifications include entry_id; NotificationBell uses useNavigate for deep-linking.
* [x] **Edit Rejected Entries**: Students can edit and resubmit rejected draft entries.

### Bug Fixes (Post Phase 2) — COMPLETE
* [x] **Fix isSigningIn race condition**: Set isSigningIn.current = true before signInWithPassword; reset on all exit paths.
* [x] **Simplify auth event handling**: onAuthStateChange skips INITIAL_SESSION and SIGNED_IN. initializeAuth handles sessions; signIn() handles user login.
* [x] **Wire up notifications**: Supervisor actions call createNotification with entry_id.
* [x] **Fix SignUp grid layout**: grid-cols-3 to grid-cols-2 when admin removed; restored to grid-cols-3 when admin re-added.
* [x] **Fix blob URL memory leak**: File previews use cached blob URLs with useEffect cleanup.
* [x] **Restore Admin Role on Signup**: Admin option re-added to SignUpPage.tsx (grid-cols-3).
* [x] **Passport Photograph Upload**: Passport photo added to SignUpPage (circular preview, max 2MB). Stored as base64 passport_photo_url on profile. Shown on all dashboards and editable on ProfilePage.

### Phase 4: Planned / Upcoming
* [ ] *(Add new tasks here)*

---

## 5. Codebase Architectural Patterns

### A. Dual Database Architecture (Supabase + Mock DB)
Every service method must use the try-catch fallback pattern:
1. **Attempt Supabase query**: Call Supabase client methods.
2. **Fallback to Mock DB**: On error (network failure, RLS blocks, missing tables), read/write via mockDb.ts.

> RULE: Never write inline Supabase queries inside component files. Always route through a service.

### B. Route Protection & Authentication
- AuthProvider initializes the session, fetches the profile, and subscribes to auth events.
- Routes guarded by <ProtectedRoute allowedRole="..."> in App.tsx.
- `loading` flag must block page rendering until the authenticated profile is in context.
- `profile_completed` flag gates dashboards — false redirects to /complete-profile.

### C. Auth Event Handling (critical)
- INITIAL_SESSION and SIGNED_IN events are SKIPPED in onAuthStateChange.
- initializeAuth() resolves existing sessions on component mount.
- signIn() handles all user-initiated sign-in and subsequent profile fetch.
- This prevents duplicate fetchProfile calls and race conditions.

### D. Profile Fetching (fail-closed)
- fetchProfile() tries Supabase first, then falls back to Mock DB.
- NEVER fabricates a default profile with an assumed role.
- Returning null forces the caller to refuse access, not assume a role.

### E. Notification Deep-Linking
- Notifications store an entry_id field.
- NotificationBell uses useNavigate to route to the correct dashboard on click.

### F. Passport Photo
- Stored as base64 passport_photo_url on the profile row (Supabase + Mock DB).
- NOT sent as auth metadata on signup (base64 too large for JWT user_metadata).
- Applied on first profile edit after email confirmation.

---

## 6. Key Service API Reference

### mockDb.ts
| Export | Purpose |
|---|---|
| getMockDb() | Read full local storage DB |
| saveMockDb(db) | Persist DB to local storage |
| seedAdminIfNeeded(email) | Create default admin profile if none exists |

### logbookService.ts
Handles: create, read, update, delete of logbook entries. Supabase + MockDB fallback.

### feedbackService.ts
Handles: supervisor feedback submission, comment CRUD, entry approval/rejection. Supabase + MockDB fallback.

### fileUploadService.ts
Handles: file upload, attachment binding to a stable DB entry ID (not a timestamp).

### notificationService.ts
| Export | Purpose |
|---|---|
| createNotification(...) | Create a notification for a user with optional entry_id |
| fetchNotifications(userId) | Fetch all notifications for a user |

### adminService.ts
Handles: user listing, supervisor-student assignment, system analytics. Supabase + MockDB fallback.

### pdfExport.ts
Exports logbook entries to PDF via a sandboxed print iframe. All user data XSS-escaped before HTML rendering.

### AuthContext.tsx (src/app/contexts/)
| Export | Purpose |
|---|---|
| AuthProvider | Context provider wrapping the entire app |
| useAuth() | Hook: { user, profile, loading, signIn, signUp, signOut, updateProfile, resendConfirmation } |

---

## 7. UserProfile Type Reference

```ts
interface UserProfile {
  id: string;
  email: string;
  role: 'student' | 'supervisor' | 'admin';
  full_name: string;
  department?: string;
  supervisor_id?: string;
  matric_number?: string;
  organization?: string;
  staff_id?: string;
  passport_photo_url?: string;        // base64 data URL
  email_confirmed_at?: string | null; // synced from Supabase auth on login
  profile_completed?: boolean;        // false → redirect to /complete-profile
}
```

---

## 8. Coding Standards & Guidelines

1. **Elegant & Premium Design**: Use rich gradients, smooth transitions, HSL palettes, glassmorphic micro-animations.
2. **Defensive Programming**:
   - Always null-check user and profile before accessing sub-properties.
   - Revoke blob URLs via URL.revokeObjectURL(url) in useEffect cleanup.
3. **No Placeholders**: Create production-quality assets, never empty placeholders.
4. **Maintain Docstring Integrity**: Preserve all existing comments and docstrings unless explicitly changing that logic.
5. **Always Use Services**: Never write inline DB queries in components.
6. **Fail Closed on Profile**: Missing profile = block access, never assume a role.
7. **Keep brain.md Updated**: Update task statuses, file map, architecture, and rules whenever anything in the project changes.

---

## 9. Environment Variables

| Variable | Purpose |
|---|---|
| VITE_SUPABASE_URL | Supabase project URL |
| VITE_SUPABASE_ANON_KEY | Supabase anonymous API key |
| VITE_ADMIN_EMAIL | Email used to seed default admin profile via seedAdminIfNeeded() |

---

## 10. Known Quirks & Gotchas

- **Auth Timeout Safety Net**: initializeAuth sets a 3-second fallback timeout to force setLoading(false) if Supabase hangs.
- **Email Confirmation & Profile Creation**: With email confirmation enabled, there is no session at signup. Profile creation relies entirely on the server-side handle_new_user() Postgres trigger reading user_metadata.
- **Passport Photo & JWT**: passport_photo_url is a base64 string that can be megabytes. Never include it in user_metadata (JWT size limit). Upload it separately after profile completion.
- **signOut is local-first**: Even if the Supabase network call fails, local auth state is always cleared to prevent a stuck UI.
- **Stale root-level AuthContext.tsx**: There is a stale root-level AuthContext.tsx file. The canonical file is src/app/contexts/AuthContext.tsx. Do not edit the root-level copy.
