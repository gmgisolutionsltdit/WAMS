# Time Tracking Precision & Session Upgrades

## 1. Seconds everywhere
Introduce one shared formatting helper (`src/lib/time.ts`) that renders any duration as `HH:MM:SS` and use it in every place a duration is shown:

- Dashboard live timer, break totals, admin live table
- My Attendance page (Total Hours, Break Time, Due Time, OT Regular, Approved OT, Total Overtime)
- Daily Work Summary table
- Reports totals

Clock in/out timestamps get seconds too (`hh:mm:ss AM/PM`).

## 2. Merge multiple daily sessions
Today several punches on one date create several rows, and pages show them as separate lines.

- Group attendance rows by `user_id + date` in the UI layer.
- Each day shows one row: first clock-in of the day, last clock-out, summed worked time, summed break time.
- The day row is expandable: clicking it reveals every individual session with its own start time, close time, break, and duration.
- Applies to My Attendance, Dashboard summary/admin table, and Reports (report totals use merged day values).

## 3. Manual Entry: Due Time & Break Time
Add two fields to the Dashboard manual-entry dialog:

- **Break Time** (minutes) — saved to `break_minutes`; net worked time = clock out − clock in − break.
- **Due Time** — shown as a live read-only calculation (standard shift hours − net worked time, floored at 0) so the person entering sees the shortfall before saving; overtime stays a manual field.

Validation stays as-is (48-hour rule, clock-out after clock-in).

## 4. Break countdown on Dashboard
When a break is started, the break card switches to a live countdown from the allowed break duration (default 60 minutes, configurable in Settings) ticking down in `HH:MM:SS`. When it hits zero it flips to a red "over break by HH:MM:SS" counter and keeps counting up. Ending the break records the actual elapsed minutes exactly as it does now.

## Technical notes
- No schema change is required for items 1, 2 and 3; merging is a presentation-layer grouping over existing `attendance_logs` rows.
- Item 4 adds one numeric column `break_allowance_minutes` to the existing `settings` table (default 60) plus a field in Settings.
- Durations are computed in seconds internally, rounded only at display time, so the summed day totals stay consistent with the individual sessions.
