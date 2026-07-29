# Rotaro Product Requirements Document

## 1. Product Overview

Rotaro is a workforce scheduling and operations platform for businesses that need to manage employees, rosters, attendance, leave, shift swaps, holidays, internal messaging, notifications, reports, billing, and organization settings from one connected system.

The product contains two connected portals:

- Employer Portal: For business owners, managers, and administrators to manage the workforce.
- Employee Portal: For employees to view rosters, check in and out, request leave, request shift swaps, receive notifications, and communicate with managers.

The system is designed as a production-ready web application with realtime updates, secure Supabase-backed data, responsive UI, and Vercel deployment support.

## 2. Product Goals

The main goals of Rotaro are:

- Reduce manual roster planning work.
- Give employers one place to manage staff, shifts, leave, attendance, holidays, and business settings.
- Give employees a simple self-service portal for their schedule, attendance, leave, shift swaps, and messages.
- Keep employer and employee portals connected in realtime.
- Send notifications and emails for important workforce events.
- Support paid subscriptions through Stripe and Razorpay.
- Provide a responsive, secure, production-ready application for desktop, tablet, and mobile users.

## 3. Target Users

### Employer / Admin

Employers need to:

- Create and manage weekly rosters.
- Manage employees and employee profiles.
- Approve or reject leave requests.
- Approve or reject shift swap requests.
- Track attendance and compare rostered shifts with actual attendance.
- Manage holidays and public holiday imports.
- Send messages to employees.
- Receive notifications when employees check in, check out, request leave, request shift swaps, or send messages.
- Manage company settings, billing, organization details, and subscription plan.

### Employee

Employees need to:

- View their dashboard and upcoming shifts.
- Check in, start break, end break, and check out.
- View their roster.
- Apply for leave.
- Request shift swaps.
- View attendance history.
- Receive notifications.
- Send and receive messages with managers.
- Update profile and personal settings.

## 4. User Roles

### Employer

Full access to the employer portal, including organization management, staff, rosters, leave approvals, attendance reports, shift swap approvals, billing, settings, notifications, messages, and reports.

### Manager

Operational access to staff scheduling, leave review, attendance, messages, notifications, reports, and shift swaps, depending on assigned permissions.

### Employee

Access to employee portal only, including dashboard, personal roster, attendance, leave application, shift swap requests, messages, notifications, profile, and employee settings.

## 5. Core Modules

## 5.1 Authentication

### Requirements

- Users can log in securely.
- Session should persist across landing pages and authenticated portal pages.
- Logged-in users should see an "Open workspace" path instead of needing to log in again.
- Portal routing should respect user role.
- Employee and employer users should be directed to the correct portal experience.

### Acceptance Criteria

- User remains logged in after navigating to pricing or landing pages.
- Employer users open the employer portal.
- Employee users open the employee portal.
- Unauthorized users cannot access protected portal pages.

## 5.2 Employer Dashboard

### Requirements

- Show live overview of the business.
- Show store/business selector.
- Show department filter.
- Show clock time feed.
- Show roster summary and charts.
- Show staff on leave.
- Show roster staff count and pay group breakdown.
- Dashboard should match the Rotaro visual theme.

### Acceptance Criteria

- Dashboard loads without console errors.
- Filters update visible dashboard data.
- Clock feed reflects employee attendance records.
- Dashboard is responsive across desktop, tablet, and mobile.

## 5.3 Employee Dashboard

### Requirements

- Show welcome message and current date.
- Show next shift.
- Provide check-in action.
- Show leave balances.
- Show current week schedule.
- Provide quick actions for apply leave, request shift swap, view roster, and attendance.

### Acceptance Criteria

- Employee sees only their own data.
- Check-in action creates attendance record with user ID.
- Leave balances update from approved leave records.
- Dashboard works on mobile and desktop.

## 5.4 Rosters

### Employer Roster Requirements

- Employers can create weekly rosters.
- Employers can view current and previous rosters.
- Roster list should show a limited clean list instead of excessive duplicate rows.
- Roster editor should support grid and list style viewing.
- Roster editor should show days, time slots, staff rows, shift blocks, hours, and cost.
- Shifts should display correct time ranges.
- Shift blocks should use clear colors such as green, red, blue, and navy.
- Employers can save, clear, delete, and publish rosters.
- Publishing a roster should notify employees.
- Roster data should connect to employee "My Roster".

### Employee Roster Requirements

- Employee can view their read-only schedule.
- Employee can choose date range.
- Employee can refresh schedule.
- Employee can request shift swap from roster context.
- Approved leave and public holidays should be visible in the schedule.
- UI should match the main Rotaro theme.

### Acceptance Criteria

- Shift times display correctly.
- Different employees can have different shift times.
- Publishing roster sends notifications and email where configured.
- Employee portal shows the latest roster after publishing.
- Roster pages are responsive and horizontally scrollable where needed.

## 5.5 Shift Templates

### Requirements

- Employers can create reusable shift templates.
- Templates include name, start time, end time, break minutes, minimum staff, department, and color.
- Employers can edit and delete templates.
- Templates can be used while building rosters.

### Acceptance Criteria

- New templates save correctly.
- Edited templates update in the UI.
- Deleted templates are removed.
- Template colors appear in roster shifts.

## 5.6 Staff

### Requirements

- Employers can view staff list.
- Employers can manage employee details.
- Staff records should connect with auth profiles.
- Employee records should include name, email, role, department, employment type, and business association.

### Acceptance Criteria

- Staff list loads without relationship errors.
- Employee profile lookup does not fail when there are duplicate or missing rows.
- Employee data is scoped to the correct business.

## 5.7 Attendance

### Employer Attendance Requirements

- Employer can view attendance dashboard.
- Show today's attendance percentage.
- Show employee attended count.
- Show total log hours.
- Show working hour performance.
- Show attendance list with filters, sorting, and pagination.
- Show roster comparison tab.
- Roster comparison should display employee rows and daily cells.
- Highlight working days, weekly offs, public holidays, approved leave, and mismatches.
- UI should match the Rotaro theme.

### Employee Attendance Requirements

- Employee can check in.
- Employee can start break.
- Employee can end break.
- Employee can check out.
- Employee can view attendance history.
- Attendance records should include user ID, employee ID, business ID, check-in time, check-out time, break duration, status, and log hours.
- Employer should receive notification when employee checks in or checks out.

### Acceptance Criteria

- Attendance insert never fails because of missing `user_id`.
- Employee check-in/check-out updates both employee and employer views.
- Employer notifications are created for attendance events.
- Attendance list is responsive and readable on mobile.
- Roster comparison does not fail because of missing relationships.

## 5.8 Leave Management

### Employee Leave Requirements

- Employee can apply for leave.
- Leave form includes type, start date, end date, and reason.
- Leave request should create a record with employee ID, user ID, business ID, start date, end date, type, reason, and pending status.
- Employer receives notification when leave is requested.
- Employee receives notification when leave is approved or rejected.

### Employer Leave Requirements

- Employer can view leave requests.
- Employer can approve or reject leave.
- Employer can submit leave on behalf of an employee.
- Employer leave form includes employee selector, leave type, start date, end date, and notes.
- Approved leave should reflect in roster and employee dashboard.

### Acceptance Criteria

- Leave request insert does not fail because of missing `user_id` or `start_date`.
- Employer can approve and reject requests.
- Employee is notified about approval or rejection.
- Employer-submitted leave appears in employee records.

## 5.9 Shift Swaps

### Employee Requirements

- Employee can request a shift swap.
- Employee selects their own shift.
- Employee selects colleague.
- Employee selects colleague shift.
- Employee adds optional note.
- Request appears in employee's swap list.
- Target employee and employer receive notification.

### Employer Requirements

- Employer can view shift swap requests.
- Employer can approve or reject requests.
- Approved swaps update roster assignment where allowed.
- Rejected swaps stay recorded with status.

### Acceptance Criteria

- Shift swap insert does not fail because of missing requester or foreign key mismatch.
- Dropdowns show available shifts correctly.
- Employee cannot submit incomplete swap request.
- Employer sees requests in realtime.
- Status changes notify relevant users.

## 5.10 Holidays

### Requirements

- Employer can manually add holidays.
- Employer can mark holiday as national and/or paid.
- Employer can bulk import holidays through CSV.
- Employer can fetch public holidays through Nager API.
- Country selector should include all supported countries with India and Australia easy to find.
- Holidays should connect with roster and attendance views.

### Acceptance Criteria

- Fetching India and Australia holidays works.
- Empty or invalid public API responses do not crash the page.
- Manual holiday insert does not fail because of missing name.
- Imported holidays appear in holiday list and roster/attendance comparison.

## 5.11 Notifications

### Requirements

- Notification bell shows unread count.
- Notification popover shows tabs for all, mention, and reminder.
- Users can mark notifications as read.
- Users can clear read notifications.
- Users can delete individual notifications.
- Deleted notifications should not show again.
- Notification page stores and displays notification history.
- Realtime notifications should work for leave, attendance, roster publish, shift swaps, and messages.
- Toast messages should appear at the bottom-right of the screen.

### Acceptance Criteria

- RLS allows valid same-business notifications.
- Deleted notifications stay hidden/deleted.
- Read state persists after refresh.
- Employer receives employee action notifications.
- Employee receives employer decision notifications.

## 5.12 Messages

### Requirements

- Messages should work like a messaging app.
- Left side shows conversation list by person.
- Conversation list shows avatar, name, role, latest message, timestamp, and unread count.
- Right side shows full message thread with selected person.
- Current user's messages appear on the right.
- Other person's messages appear on the left.
- Users can send, receive, read, and delete messages.
- Messages update in realtime.
- Message notification is created for recipient.

### Acceptance Criteria

- Employer and employee can message each other.
- New message appears without full page reload.
- Read state updates correctly.
- Deleted message is removed from the conversation.
- Message UI is responsive.

## 5.13 Reports

### Requirements

- Employer can view workforce reports.
- Reports should include attendance, roster, leave, hours, wages, and comparison data.
- Reports should support filters.
- Reports should support export where enabled.
- UI should follow Rotaro theme.

### Acceptance Criteria

- Reports load without data errors.
- Filters update displayed data.
- Export actions work where available.

## 5.14 Search

### Requirements

- Global search bar available in header.
- Search opens a command/search panel.
- Search can find employees, departments, analytics, schedules, messages, settings, and major pages.
- Search design should match Rotaro theme.

### Acceptance Criteria

- Search opens quickly.
- Results are grouped by type.
- Selecting a result navigates or opens the related item.

## 5.15 Calendar

### Requirements

- Calendar icon opens a calendar page or panel.
- Calendar shows live date and time.
- Calendar shows holidays and important workforce events.
- Calendar should match the app theme.

### Acceptance Criteria

- Calendar opens from header icon.
- Current time updates live.
- Holidays display on their dates.

## 5.16 Calculator

### Requirements

- Calculator icon opens a calculator tool.
- Calculator supports standard arithmetic functions.
- Calculator should be available from the header.
- UI should match the app theme.

### Acceptance Criteria

- Calculator opens and closes correctly.
- Arithmetic operations work.
- Tool is responsive.

## 5.17 Help Center

### Requirements

- Help icon opens a hidden Help Center page.
- Help Center includes FAQ, articles, guides and tutorials, terms and conditions, and privacy policy sections.
- Search should find help content.
- Help Center should not replace the public Support page.

### Acceptance Criteria

- Help icon opens Help Center.
- FAQ accordion works.
- Search filters useful content.
- Page matches Rotaro theme.

## 5.18 Settings

### Employer Settings Requirements

- Company information.
- General information.
- Notification preferences.
- Security details.
- Integrations.
- Language.
- Theme tab removed because only light mode is supported.
- Settings connect with organization profile where relevant.

### Employee Settings Requirements

- General information.
- Notification preferences.
- Security details.
- Language.
- No theme tab.
- Employee can open profile from settings.

### Acceptance Criteria

- Settings persist correctly.
- Notification preferences affect notification behavior where supported.
- Security tab shows signed-in email and role.
- Settings UI is responsive.

## 5.19 Organization

### Requirements

- Employer can manage organization profile from a dedicated Organization page.
- Organization is available separately in the sidebar.
- Organization page includes company name, tax/business ID, primary location, contact email, country, region, timezone, operating hours, workforce rules, leave policy, sites, and quick links.
- Employer can upload and remove organization logo.
- Organization settings connect with Settings > Company Information.

### Acceptance Criteria

- Organization page loads business data.
- Employer can edit organization fields.
- Logo upload stores URL through Supabase storage/database.
- Settings and Organization show consistent business details.

## 5.20 Billing And Pricing

### Requirements

- Pricing page shows Starter, Professional, and Business plans.
- Pricing supports monthly and annual billing toggle.
- Payment provider toggle supports Stripe and Razorpay.
- Billing page shows current plan, status, provider, subscription, next billing, and payment history.
- Subscription checkout redirects to Stripe or Razorpay using environment configuration.
- Users should not manually paste provider billing URLs in the UI.
- Billing settings should be driven through server environment variables.

### Acceptance Criteria

- Pricing page detects logged-in users and shows Open workspace when applicable.
- Subscribe button opens configured payment provider checkout.
- Billing page reflects subscription status.
- Payment history displays available payment records.
- Missing provider environment variables show a safe setup state without crashing.

## 6. Realtime Requirements

Realtime updates should be supported for:

- Notifications.
- Messages.
- Attendance check-in and check-out.
- Leave request creation and decision updates.
- Shift swap request and decision updates.
- Published roster changes.

Realtime updates should use Supabase realtime channels where configured.

## 7. Email Requirements

The system should send email updates for important events when email is enabled:

- Employee applies for leave.
- Employer approves or rejects leave.
- Employee requests shift swap.
- Employer approves or rejects shift swap.
- Employee checks in or checks out.
- Employer publishes roster.
- User receives a message.
- Important reminders and system alerts.

Email should be configurable through server environment variables. If email is disabled, the app should still create in-app notifications.

## 8. Data Model Summary

Core data entities:

- Businesses.
- Profiles.
- Employees.
- Rosters.
- Roster shifts.
- Shift templates.
- Attendance records.
- Leaves.
- Shift swaps.
- Holidays.
- Notifications.
- Messages.
- Billing subscriptions.
- Payment history.
- Organization settings.
- Notification preferences.

Each business-scoped table should include `business_id` and enforce Row Level Security.

## 9. Security Requirements

- Supabase Row Level Security must be enabled on sensitive tables.
- Users can only access records from their own business.
- Employees can only view and mutate their own employee-scoped records, except where policy allows manager/employer access.
- Employers and managers can access business-level operational data.
- Service role keys must never be exposed to the browser.
- Production environment variables must be configured in Vercel.
- `.env` must not be committed.
- Auth sessions must be handled securely.
- Notification, message, attendance, leave, and shift swap inserts must be protected by same-business policies.

## 10. Performance Requirements

- Main app pages should load quickly on production hosting.
- Heavy modules should be code split where practical.
- Large exports and report libraries should be lazy-loaded where possible.
- Tables should use pagination or limited rows for large datasets.
- Realtime subscriptions should be scoped by business ID to reduce load.
- App should support many simultaneous users by relying on Supabase filtering, indexed queries, and frontend pagination.

## 11. Responsiveness Requirements

The app must work on:

- Desktop.
- Laptop.
- Tablet.
- Mobile.

Responsive behavior:

- Sidebar should collapse cleanly.
- Header controls should not overlap.
- Tables should scroll horizontally on small screens.
- Cards should stack on mobile.
- Forms should use single-column layout on mobile.
- Buttons and text should remain visible and readable.

## 12. SEO Requirements

Public pages should include:

- Proper page titles.
- Meta descriptions.
- Clean semantic headings.
- Pricing content indexable.
- Support/help content available to users.
- Fast page rendering on Vercel.

Authenticated application pages do not need public indexing.

## 13. Deployment Requirements

Production deployment target:

- Vercel for frontend/server runtime.
- Supabase for database, auth, realtime, and storage.

Required production environment configuration:

- Supabase URL and anon key.
- Supabase service role key for server-only operations.
- Stripe keys and price IDs, if Stripe is enabled.
- Razorpay keys and plan IDs, if Razorpay is enabled.
- Email server/API credentials, if email is enabled.
- App URL and allowed redirect URLs.

## 14. Known Technical Notes

- Build supports Vercel output.
- Supabase migrations are used for schema, RLS, and feature hardening.
- Native package loading may require the production build to run outside restricted sandbox environments.
- `exceljs` increases bundle size and uses direct `eval` internally; report/export functionality should be lazy-loaded or reviewed before final production scale.

## 15. Acceptance Checklist

Before final client handoff:

- Authentication works for employer and employee users.
- Employer dashboard loads cleanly.
- Employee dashboard loads cleanly.
- Roster create, save, publish, and employee view work.
- Shift templates work.
- Staff list works.
- Attendance check-in/check-out works.
- Employer attendance dashboard and roster comparison work.
- Employee leave request works.
- Employer leave approval/rejection works.
- Employer can submit leave for employee.
- Shift swaps work from employee and employer sides.
- Holidays manual add, CSV import, and public holiday fetch work.
- Notifications work, persist, read, clear, and delete.
- Messages work as conversation threads.
- Calendar, calculator, help center, and search open from header.
- Settings save correctly.
- Organization page saves details and logo.
- Billing and pricing routes work.
- Email notifications work when configured.
- App is responsive.
- Production build passes.
- RLS policies are applied in Supabase.
- Environment variables are configured in Vercel.

## 16. Future Enhancements

Possible future upgrades:

- Advanced payroll integrations.
- AI roster optimization.
- Mobile push notifications.
- Offline check-in support.
- Geolocation-based attendance.
- Multi-location advanced permissions.
- Audit logs.
- Advanced export builder.
- Calendar sync with Google Calendar and Outlook.
- Payroll provider integrations.
