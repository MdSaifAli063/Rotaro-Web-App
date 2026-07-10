# Rotaro (RosterPro)

A modern workforce scheduling dashboard built with React, TanStack Start, Tailwind CSS, and Supabase. Rotaro helps Australian businesses manage rosters, leave requests, shift swaps, attendance, onboarding, reports, and staff details in one clean interface.

## Key Features

- Authenticated user sign-up / login via Supabase
- Manager and employee dashboards with role-specific views
- Business onboarding flow for employer users
- Roster builder, shift templates, attendance tracking, and leave management
- Shift swaps, holiday tracking, staff records, and reports
- Real-time notifications using Supabase and client-side state
- Responsive layout with sidebar navigation and mobile menu
- Smooth anchor scrolling for landing page section navigation

## Tech Stack

- React 19
- Vite 8
- TanStack React Start / React Router / React Query
- Supabase JS
- Tailwind CSS v4 + `@tailwindcss/vite`
- Radix UI primitives and Lucide icons
- Zod, React Hook Form, Sonner, Recharts

## Project Structure

- `src/`
  - `routes/` — all route pages, including public landing, auth, pricing, support, and authenticated app routes
  - `integrations/supabase/` — Supabase client setup and auth middleware
  - `lib/` — shared helpers for auth, notifications, and utilities
  - `components/` — reusable UI shell, navigation, and dashboard components
  - `styles.css` — Tailwind theme and global styles
- `package.json` — dependency manifest and scripts
- `vite.config.ts` — Vite plugin and build configuration

## Environment Variables

Create a `.env` file in the project root from `.env.example`, then fill in your Supabase, billing, and EmailJS values:

```env
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_PROJECT_ID=<project-id>
SUPABASE_ANON_KEY=<anon-or-publishable-key>
SUPABASE_PUBLISHABLE_KEY=<anon-or-publishable-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PROJECT_ID=<project-id>
VITE_SUPABASE_ANON_KEY=<anon-or-publishable-key>
VITE_SUPABASE_PUBLISHABLE_KEY=<anon-or-publishable-key>

VITE_EMAILJS_SERVICE_ID=service_your_emailjs_service
VITE_EMAILJS_PUBLIC_KEY=your_emailjs_public_key
VITE_EMAILJS_WELCOME_TEMPLATE_ID=template_employee_welcome
VITE_EMAILJS_LEAVE_TEMPLATE_ID=template_leave_status
VITE_EMAILJS_ROSTER_TEMPLATE_ID=template_roster_published
VITE_EMAILJS_PASSWORD_TEMPLATE_ID=template_password_changed
VITE_EMAILJS_NOTIFICATION_TEMPLATE_ID=template_notification
VITE_EMAILJS_PUBLIC_TEMPLATE_ID=template_public_forms
VITE_EMAILJS_PUBLIC_TO_EMAIL=support@yourdomain.com
VITE_APP_URL=https://your-vercel-domain.vercel.app
```

> Note: Use the same public key for both `SUPABASE_ANON_KEY` and `SUPABASE_PUBLISHABLE_KEY` if your Supabase project exposes only one public key.

## Development

Install dependencies and start the development server:

```bash
npm install
npm run dev
```

Open the app at `http://localhost:5173`.

## Build

Build the project for production:

```bash
npm run build
```

Preview the production build locally:

```bash
npm run preview
```

## Scripts

- `npm run dev` — start Vite dev server
- `npm run build` — build production assets
- `npm run build:dev` — build in development mode
- `npm run preview` — preview production build
- `npm run lint` — run ESLint
- `npm run typecheck` — run TypeScript without emitting files
- `npm run security:audit` — audit production dependencies
- `npm run format` — run Prettier

## Notes

- The app uses `vite-tsconfig-paths` for TypeScript path aliases. Vite also supports `resolve.tsconfigPaths` natively.
- Auth routes are guarded under `/_authenticated/*`.
- Landing page navigation supports smooth scrolling to sections like About, Industries, and Contact.

## Contact

For any setup issues, verify your Supabase auth provider and redirect/origins in the Supabase dashboard.
