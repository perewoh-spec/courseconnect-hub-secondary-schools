-- ============================================================
-- 1. Link students and teachers to their profiles. Without these links the API can't
--    fetch names, so teachers saw empty student lists and the timetable had no teachers.
-- ============================================================
DELETE FROM public.students s WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = s.user_id);
DELETE FROM public.teachers t WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = t.user_id);

ALTER TABLE public.students DROP CONSTRAINT IF EXISTS students_user_id_fkey;
ALTER TABLE public.students ADD CONSTRAINT students_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;
ALTER TABLE public.teachers DROP CONSTRAINT IF EXISTS teachers_user_id_fkey;
ALTER TABLE public.teachers ADD CONSTRAINT teachers_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;

-- ============================================================
-- 2. Privacy. People see only what their role needs:
--    profiles (names, emails): yourself; admins; teachers see colleagues and students in
--    their classes; students see the teachers of their class.
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_teacher_of_subject(_user_id uuid, _class_id uuid, _subject_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.class_subjects cs
    JOIN public.teachers t ON t.id = cs.teacher_id
    WHERE t.user_id = _user_id AND cs.class_id = _class_id AND cs.subject_id = _subject_id
  )
$$;

-- Does the signed-in student have this teacher (by teachers.id) for any subject or lesson?
CREATE OR REPLACE FUNCTION public.teaches_my_class(_teacher_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.user_id = auth.uid() AND s.class_id IS NOT NULL
      AND (
        EXISTS (SELECT 1 FROM public.class_subjects cs WHERE cs.class_id = s.class_id AND cs.teacher_id = _teacher_id)
        OR EXISTS (SELECT 1 FROM public.timetable_entries te WHERE te.class_id = s.class_id AND te.teacher_id = _teacher_id)
      )
  )
$$;

CREATE OR REPLACE FUNCTION public.profile_visible(_target_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    _target_user = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    -- teachers: colleagues, and students in classes they teach
    OR (public.has_role(auth.uid(), 'teacher') AND (
          EXISTS (SELECT 1 FROM public.teachers t WHERE t.user_id = _target_user)
          OR EXISTS (SELECT 1 FROM public.students s WHERE s.user_id = _target_user AND public.is_teacher_of_class(auth.uid(), s.class_id))
        ))
    -- students: the teachers of their own class
    OR EXISTS (SELECT 1 FROM public.teachers t WHERE t.user_id = _target_user AND public.teaches_my_class(t.id))
$$;

DROP POLICY IF EXISTS "Profiles viewable by authenticated" ON public.profiles;
DROP POLICY IF EXISTS "Profiles visible by role" ON public.profiles;
CREATE POLICY "Profiles visible by role" ON public.profiles
  FOR SELECT TO authenticated USING (public.profile_visible(user_id));

-- Teacher records (staff ID, phone): admins, the teacher, colleagues, and their own students.
DROP POLICY IF EXISTS "Teachers viewable by authenticated" ON public.teachers;
DROP POLICY IF EXISTS "Teachers visible by role" ON public.teachers;
CREATE POLICY "Teachers visible by role" ON public.teachers
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'teacher')
    OR public.teaches_my_class(id)
  );

-- Student records (guardian details): only teachers of the student's class, not every teacher.
DROP POLICY IF EXISTS "Teachers view students" ON public.students;
DROP POLICY IF EXISTS "Teachers view students in their classes" ON public.students;
CREATE POLICY "Teachers view students in their classes" ON public.students
  FOR SELECT TO authenticated
  USING (class_id IS NOT NULL AND public.is_teacher_of_class(auth.uid(), class_id));

-- ============================================================
-- 3. Results: teachers enter scores only for subjects they teach, and only for
--    students currently in that class. Attendance: only for students in the class.
-- ============================================================
DROP POLICY IF EXISTS "Teachers insert results for their classes" ON public.results;
DROP POLICY IF EXISTS "Teachers update results for their classes" ON public.results;
DROP POLICY IF EXISTS "Teachers insert results for their subjects" ON public.results;
DROP POLICY IF EXISTS "Teachers update results for their subjects" ON public.results;
CREATE POLICY "Teachers insert results for their subjects" ON public.results
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_teacher_of_subject(auth.uid(), class_id, subject_id)
    AND EXISTS (SELECT 1 FROM public.students s WHERE s.id = student_id AND s.class_id = results.class_id)
  );
CREATE POLICY "Teachers update results for their subjects" ON public.results
  FOR UPDATE TO authenticated
  USING (public.is_teacher_of_subject(auth.uid(), class_id, subject_id))
  WITH CHECK (
    public.is_teacher_of_subject(auth.uid(), class_id, subject_id)
    AND EXISTS (SELECT 1 FROM public.students s WHERE s.id = student_id AND s.class_id = results.class_id)
  );

DROP POLICY IF EXISTS "Teachers insert attendance for their classes" ON public.attendance;
DROP POLICY IF EXISTS "Teachers update attendance for their classes" ON public.attendance;
CREATE POLICY "Teachers insert attendance for their classes" ON public.attendance
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_teacher_of_class(auth.uid(), class_id)
    AND EXISTS (SELECT 1 FROM public.students s WHERE s.id = student_id AND s.class_id = attendance.class_id)
  );
CREATE POLICY "Teachers update attendance for their classes" ON public.attendance
  FOR UPDATE TO authenticated
  USING (public.is_teacher_of_class(auth.uid(), class_id))
  WITH CHECK (
    public.is_teacher_of_class(auth.uid(), class_id)
    AND EXISTS (SELECT 1 FROM public.students s WHERE s.id = student_id AND s.class_id = attendance.class_id)
  );

-- Attendance can't be recorded for future days (one day of slack for time zones).
CREATE OR REPLACE FUNCTION public.check_attendance_date()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.date > current_date + 1 THEN
    RAISE EXCEPTION 'Attendance can''t be recorded for a future date';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_check_attendance_date ON public.attendance;
CREATE TRIGGER trg_check_attendance_date
BEFORE INSERT OR UPDATE ON public.attendance
FOR EACH ROW EXECUTE FUNCTION public.check_attendance_date();

-- ============================================================
-- 4. Deleting a class, subject or term no longer silently erases results and attendance;
--    the database refuses while records depend on it.
-- ============================================================
ALTER TABLE public.results DROP CONSTRAINT IF EXISTS results_class_id_fkey;
ALTER TABLE public.results ADD CONSTRAINT results_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE RESTRICT;
ALTER TABLE public.results DROP CONSTRAINT IF EXISTS results_subject_id_fkey;
ALTER TABLE public.results ADD CONSTRAINT results_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subjects(id) ON DELETE RESTRICT;
ALTER TABLE public.results DROP CONSTRAINT IF EXISTS results_term_id_fkey;
ALTER TABLE public.results ADD CONSTRAINT results_term_id_fkey FOREIGN KEY (term_id) REFERENCES public.terms(id) ON DELETE RESTRICT;
ALTER TABLE public.attendance DROP CONSTRAINT IF EXISTS attendance_class_id_fkey;
ALTER TABLE public.attendance ADD CONSTRAINT attendance_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE RESTRICT;

-- ============================================================
-- 5. Terms: exactly one active term at a time; sensible dates.
-- ============================================================
UPDATE public.terms SET is_active = false
WHERE is_active AND id <> (SELECT id FROM public.terms WHERE is_active ORDER BY start_date DESC NULLS LAST, created_at DESC LIMIT 1);
CREATE UNIQUE INDEX IF NOT EXISTS terms_single_active ON public.terms (is_active) WHERE is_active;

ALTER TABLE public.terms DROP CONSTRAINT IF EXISTS terms_date_order;
ALTER TABLE public.terms ADD CONSTRAINT terms_date_order CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date) NOT VALID;

CREATE OR REPLACE FUNCTION public.set_active_term(_term_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only administrators can change the active term';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.terms WHERE id = _term_id) THEN
    RAISE EXCEPTION 'Term not found';
  END IF;
  UPDATE public.terms SET is_active = false WHERE is_active AND id <> _term_id;
  UPDATE public.terms SET is_active = true WHERE id = _term_id;
END;
$$;

-- ============================================================
-- 6. Timetable: valid days and times, and no class or teacher double-booked.
-- ============================================================
CREATE OR REPLACE FUNCTION public.check_timetable_entry()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clash text;
BEGIN
  IF NEW.day_of_week NOT IN ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday') THEN
    RAISE EXCEPTION 'Day must be Monday to Friday';
  END IF;
  IF NEW.end_time <= NEW.start_time THEN
    RAISE EXCEPTION 'End time must be after start time';
  END IF;

  SELECT s.name || ' ' || to_char(te.start_time, 'HH24:MI') || '–' || to_char(te.end_time, 'HH24:MI') INTO v_clash
  FROM public.timetable_entries te JOIN public.subjects s ON s.id = te.subject_id
  WHERE te.class_id = NEW.class_id AND te.day_of_week = NEW.day_of_week AND te.id <> NEW.id
    AND te.start_time < NEW.end_time AND te.end_time > NEW.start_time
  LIMIT 1;
  IF v_clash IS NOT NULL THEN
    RAISE EXCEPTION 'This class already has % on %', v_clash, NEW.day_of_week;
  END IF;

  IF NEW.teacher_id IS NOT NULL THEN
    SELECT c.name || ' ' || to_char(te.start_time, 'HH24:MI') || '–' || to_char(te.end_time, 'HH24:MI') INTO v_clash
    FROM public.timetable_entries te JOIN public.classes c ON c.id = te.class_id
    WHERE te.teacher_id = NEW.teacher_id AND te.day_of_week = NEW.day_of_week AND te.id <> NEW.id
      AND te.start_time < NEW.end_time AND te.end_time > NEW.start_time
    LIMIT 1;
    IF v_clash IS NOT NULL THEN
      RAISE EXCEPTION 'This teacher is already teaching % on %', v_clash, NEW.day_of_week;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_check_timetable_entry ON public.timetable_entries;
CREATE TRIGGER trg_check_timetable_entry
BEFORE INSERT OR UPDATE ON public.timetable_entries
FOR EACH ROW EXECUTE FUNCTION public.check_timetable_entry();

-- ============================================================
-- 7. Roles: one role per user, changed atomically by admins; changing a role creates the
--    matching teacher or student record. The system always keeps an administrator.
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_user_role(_user_id uuid, _role app_role)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only administrators can change roles';
  END IF;
  IF _user_id = auth.uid() AND _role <> 'admin' THEN
    RAISE EXCEPTION 'You can''t remove your own admin role. Ask another administrator.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = _user_id) THEN
    RAISE EXCEPTION 'User not found';
  END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (_user_id, _role) ON CONFLICT (user_id, role) DO NOTHING;
  DELETE FROM public.user_roles WHERE user_id = _user_id AND role <> _role;
  IF _role = 'teacher' THEN
    INSERT INTO public.teachers (user_id) VALUES (_user_id) ON CONFLICT (user_id) DO NOTHING;
  ELSIF _role = 'student' THEN
    INSERT INTO public.students (user_id) VALUES (_user_id) ON CONFLICT (user_id) DO NOTHING;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_removing_last_admin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.role = 'admin'
     AND (TG_OP = 'DELETE' OR NEW.role <> 'admin' OR NEW.user_id <> OLD.user_id)
     AND NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin' AND id <> OLD.id) THEN
    RAISE EXCEPTION 'Cannot remove the last administrator';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
DROP TRIGGER IF EXISTS trg_prevent_removing_last_admin ON public.user_roles;
CREATE TRIGGER trg_prevent_removing_last_admin
BEFORE UPDATE OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.prevent_removing_last_admin();

-- ============================================================
-- 8. New sign-ups get a student record straight away, so admins can place them in a class
--    (before, nothing existed until an admin saved one by hand).
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), NEW.email);
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'student');
  INSERT INTO public.students (user_id) VALUES (NEW.id) ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

INSERT INTO public.students (user_id)
SELECT ur.user_id FROM public.user_roles ur
JOIN public.profiles p ON p.user_id = ur.user_id
WHERE ur.role = 'student'
ON CONFLICT (user_id) DO NOTHING;

-- ============================================================
-- Permissions on the new functions.
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.check_attendance_date() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_timetable_entry() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_removing_last_admin() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_teacher_of_subject(uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.teaches_my_class(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.profile_visible(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_active_term(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_user_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_teacher_of_subject(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.teaches_my_class(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.profile_visible(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_active_term(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_user_role(uuid, app_role) TO authenticated;
