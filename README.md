# SchoolHub

Secondary school management: classes, subjects, teachers, timetables, daily attendance, CA and exam results, and printable report cards.

Built with React, TypeScript, Vite, Tailwind/shadcn-ui and Supabase (Postgres, Auth).

## Roles

| Role | Can do |
|---|---|
| **Admin** | Manage users and roles, students (class, admission number, guardian), teachers, classes, subjects, subject teachers, the timetable and terms |
| **Teacher** | See today's lessons, mark attendance for their classes, enter CA (out of 40) and exam (out of 60) scores for the subjects they teach, view their timetable |
| **Student** | See their report card (printable), attendance record and class timetable |

Everyone signs up as a student. An admin makes staff teachers under **Users & Roles**.

## Rules the database enforces

- Teachers only see students in classes they teach, and can only enter results for **their own subjects**, for students who are in that class.
- Students only see their own records and the names of their own teachers.
- Totals and grades are calculated automatically (A ≥ 70, B ≥ 60, C ≥ 50, D ≥ 40, F below).
- The timetable can't double-book a class or a teacher.
- Only one term is active at a time.
- Classes, subjects and terms that have results or attendance can't be deleted, so records are never lost by accident.
- Attendance can't be recorded for future dates.

## Setting up a school

The admin dashboard shows a checklist. In order:

1. **Classes:** create them (e.g. JSS1A).
2. **Subjects:** add the subject catalogue.
3. **Users & Roles:** once staff have signed up, make them teachers.
4. **Subject Teachers:** choose each class's subjects and who teaches them. This is what lets a teacher mark attendance and enter results.
5. **Timetable:** add lessons.
6. **Terms:** add terms and set the active one.
7. **Students:** place each student in a class and add their admission number.

## Running locally

Requires Node.js 18+.

```sh
npm install
cp .env.example .env   # then fill in your Supabase values
npm run dev            # http://localhost:8080
```

Other scripts: `npm run build`, `npm run preview`, `npm run lint`, `npm test`.

## Environment variables

| Variable | Where to find it |
|---|---|
| `VITE_SUPABASE_URL` | Supabase dashboard → Project Settings → API → Project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Same page → the publishable / `anon` key (safe to expose in the browser; data is protected by row-level security) |
| `VITE_SUPABASE_PROJECT_ID` | The project ref (the subdomain in the URL) |

Never put the `service_role` / secret key in this app.

## Setting up Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Apply the database schema in `supabase/migrations/` with the [Supabase CLI](https://supabase.com/docs/guides/cli):
   ```sh
   supabase link --project-ref <your-project-ref>
   supabase db push
   ```
3. **Authentication → URL Configuration:** set the Site URL to where the app is hosted, and add `https://<your-domain>/reset-password` (and `http://localhost:8080/reset-password` for local development) to the Redirect URLs.
4. Create the first administrator. Sign up in the app, then run this in the SQL editor:
   ```sql
   SELECT id FROM auth.users WHERE email = 'you@example.com';  -- copy the id
   UPDATE public.user_roles SET role = 'admin' WHERE user_id = '<that id>';
   DELETE FROM public.students WHERE user_id = '<that id>';
   ```
   After that, manage roles from **Users & Roles** in the app.

## Demo mode

For showing the project to others, the sign-in page can show **Try the demo** buttons that sign in as a sample **Admin**, **Teacher** or **Student**, with a placeholder school: classes, subjects, two terms, teachers, a class of students, a timetable, first-term results, second-term scores still to enter, and recent attendance.

1. Create or reset the demo accounts and placeholder data (safe to re-run at any time):
   ```sh
   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SECRET_KEY=<secret key> npm run seed:demo
   ```
   The secret key is in Supabase → Project Settings → API Keys. Never put it in `.env` or commit it.
2. Set `VITE_DEMO_MODE=true` in `.env` (or in your host's settings) and restart or redeploy.

Demo accounts are walled off at the database level: they only see and change placeholder data, and real accounts never see it. Visitors share the demo accounts, so they can see each other's changes; re-run the seed script to reset the demo.

## Deploying

`npm run build` produces a static site in `dist/` that can be hosted on any static host (Vercel, Netlify, Cloudflare Pages, etc.). Configure the host to serve `index.html` for unknown paths (single-page app routing), and set the environment variables in the host's build settings.
