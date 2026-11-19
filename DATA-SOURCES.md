# Where each board's numbers come from

This file traces every number and chart on the three office monitor boards back to the Zoho record, field and filter it comes from. The queries are in `src/zoho.js`, the counting is in `src/metrics.js`, and the layout is in `src/render.js`.

## How the data is pulled

- **When:** once when the server starts, then at the times in `REFRESH_TIMES`. The default is 7:00 AM, 12:00 PM and 4:00 PM Eastern. Between pulls the boards show the server's cached copy and never call Zoho.
- **Access:** read-only. Zoho CRM is queried with COQL (`POST /crm/v7/coql`). Zoho Projects is queried with REST v3 (`/api/v3/portal/727368074/...`). Zoho Desk is queried with the ticket search API (`GET /api/v1/tickets/search`, org id from `ZOHO_DESK_ORG_ID`).
- **Sources:** there are twelve. Each one is fetched on its own, so if one fails it keeps its last good data and the board shows "refresh delayed".
- **Time zone:** all dates are bucketed in America/New_York.
- **"Updated" time in each header:** the oldest fetch time among that board's sources.

### Date windows

| Term | Meaning |
| --- | --- |
| This week | Monday through Sunday of the current week. The header shows Mon–Fri ("Nov 9 – 13"), but counts include Saturday and Sunday. |
| Last 4 weeks | The current week plus the three weeks before it, each Monday–Sunday. |
| Next week | The following Monday–Friday. |
| Month to date | The 1st of this month through today. |
| Year to date | Jan 1 through today. |
| Last month | The 1st through the last day of the previous calendar month. |

### The twelve sources

| Source | Zoho app / module | Query | Fields used |
| --- | --- | --- | --- |
| `leads` | CRM · Leads | `Created_Time >=` 22 days before this Monday | `Created_Time`, `Lead_Source` (blank becomes "None") |
| `calls` | CRM · Calls | `Call_Start_Time >=` 22 days before this Monday | `Call_Start_Time`, `Call_Type`, `Subject` (used to keep only the inside sales reps' calls) |
| `meetings` | CRM · Events (Meetings) | `Start_DateTime` between 22 days before this Monday and the Sunday after next | `Start_DateTime`, `Owner` (name and id) |
| `apptSat` | CRM · Deals | `Appointment_Date` between the 1st and the last day of last month | `Appointment_Date`, `Lead_Source` (blank becomes "None"), `Scheduled_Appointment_Quality` |
| `openDeals` | CRM · Deals | `Stage not in` Closed Won, Closed Lost, Closed Deferred, Closed Disqualified, Closed Hold, Appointment Cancelled. No date filter: every open deal. | `Stage`, `Amount` (blank = 0), `Layout` |
| `newDeals` | CRM · Deals | `Created_Time >=` the 1st of last month | `Created_Time`, `Pipeline` |
| `wonDeals` | CRM · Deals | `Stage = 'Closed Won'` and `Closing_Date >=` Jan 1 | `Closing_Date`, `Amount`, `Pipeline` |
| `projects` | Projects · Projects | `created_time >=` 22 days before this Monday | `created_time`, `project_group.name` |
| `tasksDesign` | Projects · Tasks | name contains "Design", status is any closed status, `last_updated_time >=` 22 days before this Monday | `name`, `completed_on` |
| `tasksPermit` | Projects · Tasks | the same, name contains "Permit" | `name`, `completed_on` |
| `tasksInstall` | Projects · Tasks | the same, name contains "Install" | `name`, `completed_on` |
| `tickets` | Desk · Tickets | `modifiedTimeRange` from 22 days before this Monday through now. Spam (`isSpam`) is dropped. | `createdTime`, `closedTime` |

### Fields used only by the phone view

Each query above also pulls the record's `id` and a name, so the phone view (`/m`) can list the records behind each number: Leads `First_Name`, `Last_Name`, `Owner`; Calls `Call_Duration`; Events `Event_Title`; Deals `Deal_Name`, `Owner` (plus `Stage` for new deals and `Created_Time` for open deals, used for the age breakdown); Projects `name`; Tasks the task's project and owners; Desk tickets `ticketNumber`, `subject`, `status`, `channel`, `assignee`, `contact` and `webUrl` (the link to the ticket). The boards themselves still show counts only.

Each drill-down opens with a plain-language "What this shows" note for people outside the department (the `explain` text in `src/drill.js`), then the exact counting rule under "How it's counted".

Every phone drill-down list is filtered with the same rule helpers in `src/metrics.js` as the number it opens from, so the list's count (and amount total) matches the board.

### Two rules used on several boards

- **Standard vs service:** a deal counts as **service** when its `Pipeline` field contains "CFSS" (any case). Every other deal counts as **standard**. This uses the `Pipeline` field, not the deal's Layout.
- **Up/down arrows** compare this period with the one before it. The previous value is shown in parentheses. Green ▲ means up, orange ▼ means down, and grey ● means no change.

---

## Inside Sales (`/left`)

Sources: `leads`, `calls`, `meetings`, `apptSat` (Zoho CRM).

### Leads created (tile)
- **Big number:** Leads with `Created_Time` in this week (Mon–Sun).
- **Arrow:** compared with last week's count.
- **4-wk avg:** the average of the last 4 weekly counts, this week included.

### Which calls count (all call numbers on this board)
- Only calls on the lines of **Nicole Brugman, Quintin Driskell and Michael Broadhurst** (`CALL_REPS` in `src/metrics.js`).
- The phone integration logs every call under one CRM user, so the call's `Owner` can't tell reps apart. Instead the rep is read from the line name in `Subject`: outbound calls look like "Call Nicole Brugman +1910… → +1…", and inbound calls look like "Call +1… → Nicole Brugman +1910…". A call counts when its Subject contains one of the three names, in any case.
- Calls on shared lines (Service, Sales, Interconnections, EV Solutions) and other people's lines are left out.
- As of Nov 13, 2026, no call in CRM has Quintin Driskell's name in the Subject, so his calls don't reach the board yet.

### Calls logged (tile)
- **Big number:** the reps' calls with `Call_Start_Time` in this week (Mon–Sun).
- **"X out / Y in" (phone view only):** a call counts as **out** when `Call_Type` contains "out" (Outbound). **Everything else counts as "in"**, which means Missed calls are counted as inbound.

### Meetings this week (tile)
- **Big number:** CRM Events (Meetings) with `Start_DateTime` in this week (Mon–Sun). This counts **every** Event in CRM, whatever kind of meeting it is and whoever owns it, Quintin Driskell included.
- **Arrow and 4-wk avg:** worked out the same way as the Leads tile. The TV shows only the arrow; the 4-wk avg is on the phone view.

### Meetings booked · next week (green tile)
- Events with `Start_DateTime` on next Monday through Friday. Every owner is included.

### Calls per day, this week (bar chart)
- One bar per weekday, Monday through Friday, built from the reps' calls by `Call_Start_Time`. Weekend calls are not shown here, but they do count in the Calls tile.
- **Green:** outbound calls (`Call_Type` contains "out").
- **Yellow:** everything else, which includes Missed calls.

### Meetings this week · by rep (grid)
- **What it counts:** Events with `Start_DateTime` on Monday–Friday of this week. On Saturday and Sunday it switches to **next** week and the title changes to "Meetings next week".
- **Rows:** the Event `Owner`, meaning the user who owns the meeting. Full names come from the `REP_NAMES` map in `src/metrics.js`, because the CRM owner field only carries a last name for these users. An owner not in the map shows the name CRM sends.
- **Who's left out:** Quintin Driskell (`GRID_EXCLUDE`). That's why the grid total can be lower than the "Meetings this week" tile.
- **Order and "Other":** reps are sorted by meeting count. Past six rows, the reps with the fewest meetings fold into "Other (n)".
- **Shading:** a cell is darker green the more meetings it holds, relative to the busiest cell.
- **Today:** the yellow band marks today's column. Days already past are faded.
- **Per day / "light":** the Per day row is the daily total. A day still ahead is marked **light** (orange) when it has fewer than half the meetings of the busiest day, as long as the busiest day has at least 4.
- **Total column and Per day row:** each rep's week total and each day's total. Both are outlined so they stand out, and the grand total (bottom right) is the grid total.

### Leads → appointments sat, by source · last month (overlaid bars)
One card showing how last month's leads from each source turned into sat appointments. The phone view still shows the two halves as separate cards (lead sources over the last 4 weeks, appointments sat last month).
- **Left (leads):** Leads with `Created_Time` in last month (for example, all of October when viewed in November), grouped by `Lead_Source` (blank becomes "None"). Each source's leads are a pale, outlined bar. The lead pull reaches back to last month's 1st for this.
- **Right (sat):** Deals whose `Appointment_Date` falls in last month, grouped by `Lead_Source`, counting only the ones that sat (see below). They're a solid green bar drawn inside the lead bar, on the same scale, so the empty part of the lead bar is the drop-off.
- **What counts as "sat":** `Scheduled_Appointment_Quality` (shown in CRM as "Appointment Quality") is filled in and isn't "D (Not Good, Questionable)". A deal with no quality score is left out.
- **Where the rule came from:** CRM has no field that marks an appointment as sat. This rule was fitted to the CRM report "Appointments Sat by Source - Last Month". For October 2026 it matched Tesla 10, Phone 9, Website - Quote Page 7 and Events & Seminars 3 exactly. It gave DemandIQ 7 (report 6) and Duke Energy Program 5 (report 6). The report's own filter couldn't be read through the API.
- **Sat rate:** sat ÷ leads for the same source and month. It shows green when it's at or above the overall rate. A sat appointment can come from a lead created in an earlier month, so a source can have more sat than leads. Its sat bar then runs past the lead bar and the rate shows "–" instead of a number over 100%.
- **Order and "Other":** sources are sorted by lead count. The top 8 each get a row and the rest are combined into one grey "Other (n sources)" row.
- **Header:** last month's total leads, total sat and the overall sat rate.

---

## Sales Pipeline (`/middle`)

Sources: `openDeals`, `wonDeals`, `newDeals` (Zoho CRM Deals).

### New deals · month to date (tile)
- **Big number:** Deals with `Created_Time` from the 1st of this month through today, in any stage, open or closed.
- **Arrow and "X standard, Y service" (phone view only):** compared with Deals created over the same days of last month (for example, on Nov 12 it compares with Oct 1–12), and split by the CFSS rule. The TV shows only the big number.

### Avg deal size · year (gold tile)
- **Big number:** for **standard** deals only, the total `Amount` of Closed Won deals this year divided by how many there are. Closed Won means `Stage = 'Closed Won'` and `Closing_Date` this year.
- **"Service avg" (phone view only):** the same calculation for service (CFSS) deals.

### Closed won · month to date (tile)
- **Big number:** the total `Amount` of Closed Won deals whose `Closing_Date` is in this month.
- **Smaller line (phone view only):** the deal count, split by the CFSS rule.

### Closed won · year (green tile)
- **Big number:** the total `Amount` of Closed Won deals whose `Closing_Date` is in this year.
- **Deal count and "Oct was $X" (phone view only):** this year's deal count and last month's total.

### Closed-won revenue by month (bar chart)
- **Bars:** one stacked bar per month from January through this month, built from Closed Won deals by `Closing_Date` month and summing `Amount`.
  - **Green:** standard.
  - **Yellow:** service (CFSS).
  - **Label above each bar:** that month's total.
  - **Current month:** shown in yellow, because it is month to date.
- **Deals won row:** the number of Closed Won deals in each month.
- **Dashed white trend line:** a straight-line (least-squares) fit through the monthly totals of **completed** months only. The current month is left out. The legend shows the slope in dollars per month.

### Open deals by stage & department (grid, phone view only)
- **What it counts:** every Deal whose `Stage` is **not** one of Closed Won, Closed Lost, Closed Deferred, Closed Disqualified, Closed Hold or Appointment Cancelled. There is no date filter, so open deals of any age are included.
- **Rows:** `Stage`, in the order set by `STAGE_ORDER` in `src/metrics.js`. A stage not in that list sorts to the bottom.
- **Columns:** the deal's CRM **Layout**, which stands in for the department. Short labels:

  | Layout | Shown as |
  | --- | --- |
  | CFSS Standard Deal | Standard |
  | Service Deal | Service |
  | EV Charging Deal | EV |
  | Energy Services | Energy |

  Any other layout shows its full name. Columns are sorted by deal count, largest first.
- **Cells:** the deal count. Shading is relative to the busiest cell.
- **Totals:** the Total column is per stage. The number under each column header is the total for that layout.

---

## Operations (`/right`)

Sources: `projects`, `tasksDesign`, `tasksPermit`, `tasksInstall` (Zoho Projects, portal 727368074) and `tickets` (Zoho Desk).

### Weekly tiles
Each tile's big number is **this week's** count (Mon–Sun). The arrow compares it with last week. The mini bars show the last 4 weeks, with this week in green.

For every task tile, the count is closed Zoho Projects tasks, bucketed by the week of the task's `completed_on` date. Zoho is first asked for closed tasks whose name contains "Design", "Permit" or "Install". Then the name rules below pick which tile each task counts toward.

| Tile | Group | What it counts | Rule on the task name |
| --- | --- | --- | --- |
| Projects created | Pre-construction | Projects by `created_time` | (not a task) |
| Designs complete | Pre-construction | Closed tasks | contains "design" anywhere, any case |
| Permits submitted | Pre-construction | Closed tasks | starts with "Permit Application" |
| Permits received | Pre-construction | Closed tasks | starts with "Notify HO of Permit Approval" |
| Module installs | Installs completed | Closed tasks | starts with "Module Install" |
| Electrical installs | Installs completed | Closed tasks | starts with "Electrical Install" |
| EV chargers | Installs completed | Closed tasks | starts with "EV Charger Install" |
| Incoming tickets | Service tickets | Desk tickets by `createdTime` | (not a task) |
| Closed tickets | Service tickets | Desk tickets by `closedTime` | (not a task) |

**Ticket tiles:** one Desk query feeds both. It asks for every ticket modified since 22 days before this Monday, because a ticket created or closed in the window was also modified in it. Incoming counts every new ticket, whatever its status now. Closed counts tickets by `closedTime`. The Desk search API allows a time range of up to one month, and this window is never more than 30 days.

The task tiles count **tasks, not projects**. If one project has two closed tasks that both have "design" in the name, it adds 2 to Designs complete.

### Permits and Tickets (flow cards)
Permits submitted / received and Incoming / Closed tickets are shown as pairs, one card each, instead of four separate tiles. The counts and rules are the same as the tiles above.
- **Left:** this week's count for each side (orange = in: submitted or incoming; green = out: received or closed), with the arrow compared with last week.
- **Chart:** running totals by day over the last 4 weeks, starting at 0 on the first Monday and drawn up to today. The shaded gap between the lines, and the number beside it, is in minus out over those 4 weeks: how much the queue **grew** in that time. It is not the all-time backlog, because items submitted or opened before the 4 weeks aren't pulled. A negative number means the queue shrank.
- The phone view still shows these as four separate tiles.

### Projects created · running total (line chart)
- **What it counts:** Projects by `created_time`.
- **Green line:** the running total for each day of this week, Monday through Sunday, drawn up to today.
- **Dashed grey line:** the same running total for last week, drawn for the whole week.

### New projects by type (bar chart)
- **What it counts:** Projects created in the last 4 weeks, grouped by **project group** (`project_group.name`). A project with no group shows as "Ungrouped".
- **Group labels:**

  | Project group | Shown as |
  | --- | --- |
  | EV | EV charger |
  | Non PV Install | Non-PV install |
  | Addition | PV addition |
  | Commercial Installation | Commercial |
  | Ungrouped Projects | Ungrouped |

  Any other group shows its own name.
- **Columns:**
  - **4 wk:** the 4-week count, which also sets the bar length.
  - **this wk:** this week's count, shown in yellow when it is above zero.
- Up to 8 groups are shown, largest first.

### 4-week totals (list, phone view only)
- Each tile's 4 weekly counts added together, using the same sources and rules as the tiles above.

---

## Things to know when reading the numbers

- **Meetings:** "Meetings" is every CRM Event. If someone puts something other than a sales appointment on the CRM calendar, it is counted.
- **Calls:** Missed calls count as inbound.
- **Weekends:** "This week" counts include Saturday and Sunday, even though the header and the daily charts show Monday–Friday.
- **Quintin Driskell:** left out of the meetings-by-rep grid, but included in every other meeting count.
- **Open deals:** the stage grid includes open deals of every age. A deal left in an early stage for years still shows up there.
- **Fixed EST offset in the date filters:** the CRM date filters are written with a fixed `-05:00` offset, so during daylight saving time the cutoff is one hour off. This doesn't change any number shown, because the fetch starts a day earlier than the oldest week the boards display. The "New deals" filter starts on the 1st of last month, so its comparison could in theory lose a deal created in the first hour of that day during daylight saving time. The "Appointments sat" filter has the same gap: an appointment between midnight and 1 AM on the 1st of last month would be missed.
- **Row limits per pull:**

  | Source | Most rows read |
  | --- | --- |
  | Each CRM query | 20,000 |
  | Projects | 2,000 |
  | Each task query | 4,000 |
  | Desk tickets | 5,000 (the Desk search API's own limit) |

  Rows past these limits are silently dropped.
