import { createServerFn } from "@tanstack/react-start";

/**
 * Idempotently seeds the Rotaro demo workspace.
 * - employer@rotaro.com / Demo1234!  (employer, Sarah Mitchell)
 * - manager@rotaro.com  / Demo1234!  (manager,  James Thornton)
 * - emily@/liam@/priya@/tom@/aisha@rotaro.com / Demo1234!  (5 employees)
 * - 1 demo business, 4 shift templates, 2 weekly rosters (last week published,
 *   current week draft), shift assignments, leave balances, 3 leave requests,
 *   5 days of attendance records.
 *
 * Safe to call repeatedly: short-circuits if employer@rotaro.com already exists.
 */
export const seedDemoData = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // ---------- idempotency check ----------
  const { data: existing } = await supabaseAdmin.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  const existingUsers = existing?.users ?? [];

  // ---------- helpers ----------
  const ensureUser = async (
    email: string,
    name: string,
    role: "employer" | "manager" | "employee",
  ): Promise<string> => {
    const found = existingUsers.find((u) => u.email === email);
    if (found) return found.id;

    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: "Demo1234!",
      email_confirm: true,
      user_metadata: { name, role },
    });
    if (error || !data.user) throw new Error(`createUser ${email}: ${error?.message}`);
    return data.user.id;
  };

  const upsertProfile = async (
    id: string,
    name: string,
    email: string,
    role: "employer" | "manager" | "employee",
    business_id: string | null,
    extra: Record<string, unknown> = {},
  ) => {
    const { error } = await supabaseAdmin
      .from("profiles")
      .upsert({ id, name, email, role, business_id, ...extra });
    if (error) throw new Error(`profile ${email}: ${error.message}`);
  };

  const monday = (d: Date) => {
    const x = new Date(d);
    const day = x.getDay() || 7;
    if (day !== 1) x.setDate(x.getDate() - (day - 1));
    x.setHours(0, 0, 0, 0);
    return x;
  };
  const addDays = (d: Date, n: number) => {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  };
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  // ---------- employer + business ----------
  const employerId = await ensureUser("employer@rotaro.com", "Sarah Mitchell", "employer");

  // Check if business exists before inserting
  const { data: existingBusinesses } = await supabaseAdmin
    .from("businesses")
    .select("id, name")
    .eq("name", "Rotaro Demo Business")
    .order("created_at", { ascending: true })
    .limit(1);

  let biz = existingBusinesses?.[0] ?? null;
  if (!biz) {
    const { data: newBiz, error: bizErr } = await supabaseAdmin
      .from("businesses")
      .insert({
        owner_id: employerId,
        name: "Rotaro Demo Business",
        country: "Australia",
        state: "NSW",
        location: "Sydney, NSW, Australia",
        open_days: ["Mon", "Tue", "Wed", "Thu", "Fri"],
        open_time: "07:00",
        close_time: "22:00",
        employment_types: ["Full-time", "Part-time", "Casual"],
        break_options: [0, 15, 30, 60],
        min_age: 16,
        is_onboarded: true,
        business_email: "hello@rotarodemo.com",
        business_phone: "+61 2 9000 0000",
        abn: "12 345 678 901",
      })
      .select()
      .single();
    if (bizErr || !newBiz) throw new Error(`business: ${bizErr?.message}`);
    biz = newBiz;
  }

  await upsertProfile(employerId, "Sarah Mitchell", "employer@rotaro.com", "employer", biz.id);
  await supabaseAdmin
    .from("settings")
    .upsert({ business_id: biz.id }, { onConflict: "business_id" });

  // ---------- employees ----------
  const empSeed = [
    {
      name: "Emily Chen",
      email: "emily@rotaro.com",
      code: "EMP001",
      dept: "Front of House",
      role: "Supervisor",
      type: "Full-time",
      rate: 28,
    },
    {
      name: "Liam Nguyen",
      email: "liam@rotaro.com",
      code: "EMP002",
      dept: "Kitchen",
      role: "Cook",
      type: "Part-time",
      rate: 24,
    },
    {
      name: "Priya Sharma",
      email: "priya@rotaro.com",
      code: "EMP003",
      dept: "Front of House",
      role: "Cashier",
      type: "Casual",
      rate: 22,
    },
    {
      name: "Tom Williams",
      email: "tom@rotaro.com",
      code: "EMP004",
      dept: "Kitchen",
      role: "Kitchen Hand",
      type: "Casual",
      rate: 21,
    },
    {
      name: "Aisha Okafor",
      email: "aisha@rotaro.com",
      code: "EMP005",
      dept: "Management",
      role: "Duty Manager",
      type: "Full-time",
      rate: 32,
    },
  ];

  const empIds: string[] = [];
  const employeeUserIds = new Map<string, string>();
  for (const e of empSeed) {
    const uid = await ensureUser(e.email, e.name, "employee");
    await upsertProfile(uid, e.name, e.email, "employee", biz.id, { department: e.dept });

    // --- Make employee creation idempotent ---
    let employeeId: string;
    const { data: existingEmps, error: findErr } = await supabaseAdmin
      .from("employees")
      .select("id")
      .eq("user_id", uid)
      .eq("business_id", biz.id)
      .order("created_at", { ascending: true })
      .limit(1);

    if (findErr) throw new Error(`Error finding employee ${e.email}: ${findErr.message}`);

    if (existingEmps?.[0]) {
      employeeId = existingEmps[0].id;
    } else {
      const { data: newEmp, error: empErr } = await supabaseAdmin
        .from("employees")
        .insert({
          business_id: biz.id,
          user_id: uid,
          name: e.name,
          email: e.email,
          employee_code: e.code,
          department: e.dept,
          role: e.role,
          employment_type: e.type,
          pay_rate: e.rate,
          status: "Active",
          start_date: "2025-01-01",
        })
        .select("id")
        .single();
      if (empErr || !newEmp) throw new Error(`employee ${e.email}: ${empErr?.message}`);
      employeeId = newEmp.id;
    }
    empIds.push(employeeId);
    employeeUserIds.set(employeeId, uid);

    await supabaseAdmin.from("leave_balances").upsert(
      [
        // Ensure business_id is included for RLS if needed
        {
          business_id: biz.id,
          employee_id: employeeId,
          leave_type: "Annual",
          total_days: 20,
          used_days: 0,
        },
        {
          business_id: biz.id,
          employee_id: employeeId,
          leave_type: "Sick",
          total_days: 10,
          used_days: 0,
        },
        {
          business_id: biz.id,
          employee_id: employeeId,
          leave_type: "Casual",
          total_days: 5,
          used_days: 0,
        },
      ],
      { onConflict: "employee_id,leave_type" },
    ); // Specify conflict columns for upsert
  }

  // ---------- shift templates ----------
  const { data: existingTemplates } = await supabaseAdmin
    .from("shift_templates")
    .select("id")
    .eq("business_id", biz.id)
    .limit(1);
  if (!existingTemplates?.length) {
    await supabaseAdmin.from("shift_templates").insert([
      {
        business_id: biz.id,
        name: "Morning Shift",
        start_time: "07:00",
        end_time: "15:00",
        break_minutes: 30,
      },
      {
        business_id: biz.id,
        name: "Afternoon Shift",
        start_time: "12:00",
        end_time: "20:00",
        break_minutes: 30,
      },
      {
        business_id: biz.id,
        name: "Evening Shift",
        start_time: "15:00",
        end_time: "22:00",
        break_minutes: 30,
      },
      {
        business_id: biz.id,
        name: "Split Shift",
        start_time: "09:00",
        end_time: "13:00",
        break_minutes: 0,
      },
    ]);
  }

  // ---------- rosters (last week published, this week draft) ----------
  const today = new Date();
  const thisMon = monday(today);
  const lastMon = addDays(thisMon, -7);

  const rotation = [
    { s: "07:00", e: "15:00", brk: 30, h: 7.5 },
    { s: "12:00", e: "20:00", brk: 30, h: 7.5 },
    { s: "15:00", e: "22:00", brk: 30, h: 6.5 },
  ];

  for (const [start, status] of [
    [lastMon, "Published"],
    [thisMon, "Draft"],
  ] as const) {
    const { data: existingRoster } = await supabaseAdmin
      .from("rosters")
      .select("id")
      .eq("business_id", biz.id)
      .eq("week_start", fmt(start))
      .maybeSingle();

    if (existingRoster) continue; // Skip if roster for this week already exists

    const { data: r } = await supabaseAdmin
      .from("rosters")
      .insert({
        business_id: biz.id,
        week_start: fmt(start),
        week_end: fmt(addDays(start, 6)),
        status,
      })
      .select()
      .single();
    if (!r) continue;

    const shifts: any[] = [];
    for (let d = 0; d < 5; d++) {
      empIds.forEach((eid, i) => {
        const slot = rotation[(i + d) % rotation.length];
        shifts.push({
          roster_id: r.id,
          employee_id: eid,
          day: fmt(addDays(start, d)),
          start_time: slot.s,
          end_time: slot.e,
          break_minutes: slot.brk,
          total_hours: slot.h,
        });
      });
    }
    await supabaseAdmin.from("roster_shifts").insert(shifts);
  }

  // ---------- leaves ----------
  const { data: existingLeaves } = await supabaseAdmin
    .from("leaves")
    .select("id")
    .eq("business_id", biz.id)
    .limit(1);
  if (!existingLeaves?.length) {
    const employeeIdAt = (index: number) => {
      const employeeId = empIds[index];
      if (!employeeId) throw new Error(`Missing seeded employee at index ${index}`);
      return employeeId;
    };
    const userIdFor = (employeeId: string) => {
      const userId = employeeUserIds.get(employeeId);
      if (!userId) throw new Error(`Missing seeded user for employee ${employeeId}`);
      return userId;
    };
    const annualLeaveEmployee = employeeIdAt(0);
    const sickLeaveEmployee = employeeIdAt(1);
    const unpaidLeaveEmployee = employeeIdAt(3);

    // Only insert if no leaves exist for this business
    await supabaseAdmin.from("leaves").insert([
      {
        business_id: biz.id,
        employee_id: annualLeaveEmployee,
        user_id: userIdFor(annualLeaveEmployee),
        leave_type: "Annual",
        from_date: fmt(lastMon),
        to_date: fmt(addDays(lastMon, 2)),
        start_date: fmt(lastMon),
        end_date: fmt(addDays(lastMon, 2)),
        status: "Approved",
        reason: "Family trip",
      },
      {
        business_id: biz.id,
        employee_id: sickLeaveEmployee,
        user_id: userIdFor(sickLeaveEmployee),
        leave_type: "Sick",
        from_date: fmt(thisMon),
        to_date: fmt(addDays(thisMon, 1)),
        start_date: fmt(thisMon),
        end_date: fmt(addDays(thisMon, 1)),
        status: "Pending",
        reason: "Flu",
      },
      {
        business_id: biz.id,
        employee_id: unpaidLeaveEmployee,
        user_id: userIdFor(unpaidLeaveEmployee),
        leave_type: "Unpaid",
        from_date: fmt(addDays(thisMon, -14)),
        to_date: fmt(addDays(thisMon, -13)),
        start_date: fmt(addDays(thisMon, -14)),
        end_date: fmt(addDays(thisMon, -13)),
        status: "Rejected",
        reason: "Personal",
      },
    ]);
  }

  // ---------- attendance (last 5 working days) ----------
  const { data: existingAtt } = await supabaseAdmin
    .from("attendance_records")
    .select("id")
    .eq("business_id", biz.id)
    .limit(1);
  if (!existingAtt?.length) {
    // Only insert if no attendance records exist for this business
    const attRows: any[] = [];
    for (let i = 1; i <= 5; i++) {
      const d = addDays(today, -i);
      if (d.getDay() === 0 || d.getDay() === 6) continue; // Skip weekends
      const date = fmt(d);
      empIds.forEach((eid) => {
        const inH = 7 + Math.floor(Math.random() * 2); // 7am or 8am
        const outH = 15 + Math.floor(Math.random() * 2); // 3pm or 4pm
        attRows.push({
          business_id: biz.id,
          employee_id: eid,
          user_id: employeeUserIds.get(eid),
          date,
          check_in_time: new Date(`${date}T0${inH}:00:00Z`).toISOString(),
          check_out_time: new Date(`${date}T${outH}:00:00Z`).toISOString(),
          status: "completed",
        });
      });
    }
    if (attRows.length) await supabaseAdmin.from("attendance_records").insert(attRows);
  }

  // ---------- holidays ----------
  const { data: existingHolidays } = await supabaseAdmin
    .from("holidays")
    .select("id")
    .eq("business_id", biz.id)
    .limit(1);
  if (!existingHolidays?.length) {
    await supabaseAdmin.from("holidays").insert([
      {
        business_id: biz.id,
        holiday_date: "2026-01-01",
        holiday_name: "New Year's Day",
        country: "AU",
        state: "NSW",
        is_national: true,
        is_paid: true,
        is_custom: false,
      },
      {
        business_id: biz.id,
        holiday_date: "2026-01-26",
        holiday_name: "Australia Day",
        country: "AU",
        state: "NSW",
        is_national: true,
        is_paid: true,
        is_custom: false,
      },
      {
        business_id: biz.id,
        holiday_date: "2026-04-10",
        holiday_name: "Good Friday",
        country: "AU",
        state: "NSW",
        is_national: true,
        is_paid: true,
        is_custom: false,
      },
      {
        business_id: biz.id,
        holiday_date: "2026-06-08",
        holiday_name: "King's Birthday",
        country: "AU",
        state: "NSW",
        is_national: false,
        is_paid: true,
        is_custom: false,
      },
      {
        business_id: biz.id,
        holiday_date: "2026-12-25",
        holiday_name: "Christmas Day",
        country: "AU",
        state: "NSW",
        is_national: true,
        is_paid: true,
        is_custom: false,
      },
      {
        business_id: biz.id,
        holiday_date: "2026-03-17",
        holiday_name: "St. Patrick's Day Party",
        country: "AU",
        state: "NSW",
        is_national: false,
        is_paid: false,
        is_custom: true,
      },
    ]);
  }
  return { seeded: true, business: biz.name };
});
