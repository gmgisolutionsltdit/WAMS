

## Employee Overtime Tracker — Implementation Plan

### 1. Database Setup (Lovable Cloud)
- **`user_roles`** table — stores roles (`admin`, `manager`, `employee`) per user, linked to `auth.users`
- **`profiles`** table — `id`, `email`, `full_name`, `department`, `reporting_manager_id` (FK to profiles), auto-created on signup via trigger
- **`attendance_logs`** table — `id`, `user_id`, `date`, `clock_in`, `clock_out`, `total_hours`, `overtime_hours`
- **`overtime_requests`** table — `id`, `user_id`, `date`, `requested_hours`, `reason`, `status` (pending/approved/rejected), `approved_by`
- **`settings`** table — overtime rates for weekdays, weekends, holidays; standard shift hours
- RLS policies: employees see only their own data; managers see their team's data; admins see everything

### 2. Authentication
- Email + Password signup/login with Supabase Auth
- Google OAuth sign-in button
- Auto-assign `employee` role on signup
- Auth pages: Login, Signup, Forgot Password, Reset Password

### 3. Layout & Navigation
- Responsive sidebar navigation using Shadcn Sidebar component
- Collapsible on mobile with hamburger trigger
- Role-based menu items (Employee vs Manager/Admin views)
- Routes: Dashboard, My Attendance, Submit OT Request, Pending Approvals (manager+), Reports (manager+), Settings (admin)

### 4. Employee Dashboard
- Real-time clock display
- Large Clock In / Clock Out buttons (with simulated IP/location logging)
- Daily progress bar (hours worked out of 8)
- Quick form to submit manual overtime requests
- Recent attendance logs table with OT status

### 5. Manager/Admin Dashboard
- Summary cards: Total OT hours this month, Pending Requests, Active Employees
- Pending Approvals section with one-click Approve/Reject
- Employee Overview table showing subordinates' detailed logs

### 6. Reports & Settings
- Filterable attendance/OT table (by date, employee, department)
- CSV export functionality
- Settings page: Standard Shift Hours, OT Multipliers (weekday/weekend/holiday)

### 7. Core Logic
- Auto-calculate overtime on clock-out: `overtime = max(0, total_hours - standard_hours)`
- Manual OT requests go through approval workflow
- TanStack Query for data fetching with real-time Supabase subscriptions

