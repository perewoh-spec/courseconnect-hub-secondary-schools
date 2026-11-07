-- ============================================================
-- Demo isolation: shared demo accounts (app_metadata.demo = true, which only the server
-- can set) see and change only placeholder data, and real accounts never see it.
-- One RESTRICTIVE policy per table, ANDed with the existing policies.
-- ============================================================

CREATE OR REPLACE FUNCTION public.current_user_is_demo()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT COALESCE((auth.jwt() -> 'app_metadata' ->> 'demo')::boolean, false)
$$;

CREATE OR REPLACE FUNCTION public.user_is_demo(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE((SELECT (raw_app_meta_data ->> 'demo')::boolean FROM auth.users WHERE id = _user_id), false)
$$;

-- School-level data carries its own flag; everything else follows its class or person.
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE public.subjects ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE public.terms ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE public.classes ALTER COLUMN is_demo SET DEFAULT public.current_user_is_demo();
ALTER TABLE public.subjects ALTER COLUMN is_demo SET DEFAULT public.current_user_is_demo();
ALTER TABLE public.terms ALTER COLUMN is_demo SET DEFAULT public.current_user_is_demo();

-- Names and codes only need to be unique within each side.
ALTER TABLE public.classes DROP CONSTRAINT IF EXISTS classes_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS classes_name_per_side ON public.classes (is_demo, name);
ALTER TABLE public.subjects DROP CONSTRAINT IF EXISTS subjects_code_key;
CREATE UNIQUE INDEX IF NOT EXISTS subjects_code_per_side ON public.subjects (is_demo, code);
-- One active term per side.
DROP INDEX IF EXISTS public.terms_single_active;
CREATE UNIQUE INDEX IF NOT EXISTS terms_single_active_per_side ON public.terms (is_demo) WHERE is_active;

CREATE OR REPLACE FUNCTION public.class_is_demo(_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT COALESCE((SELECT is_demo FROM public.classes WHERE id = _id), false) $$;
CREATE OR REPLACE FUNCTION public.subject_is_demo(_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT COALESCE((SELECT is_demo FROM public.subjects WHERE id = _id), false) $$;
CREATE OR REPLACE FUNCTION public.term_is_demo(_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT COALESCE((SELECT is_demo FROM public.terms WHERE id = _id), false) $$;
CREATE OR REPLACE FUNCTION public.teacher_is_demo(_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT COALESCE((SELECT public.user_is_demo(user_id) FROM public.teachers WHERE id = _id), false) $$;
CREATE OR REPLACE FUNCTION public.student_is_demo(_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT COALESCE((SELECT public.user_is_demo(user_id) FROM public.students WHERE id = _id), false) $$;

REVOKE EXECUTE ON FUNCTION public.user_is_demo(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.class_is_demo(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.subject_is_demo(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.term_is_demo(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.teacher_is_demo(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.student_is_demo(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_is_demo(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.class_is_demo(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.subject_is_demo(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.term_is_demo(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.teacher_is_demo(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.student_is_demo(uuid) TO authenticated;

-- ------------------------------------------------------------
-- The wall.
-- ------------------------------------------------------------
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN SELECT * FROM (VALUES
    ('classes',           'is_demo'),
    ('subjects',          'is_demo'),
    ('terms',             'is_demo'),
    ('profiles',          'public.user_is_demo(user_id)'),
    ('user_roles',        'public.user_is_demo(user_id)'),
    ('teachers',          'public.user_is_demo(user_id)'),
    ('students',          'public.user_is_demo(user_id)'),
    ('class_subjects',    'public.class_is_demo(class_id)'),
    ('timetable_entries', 'public.class_is_demo(class_id)'),
    ('attendance',        'public.class_is_demo(class_id)'),
    ('results',           'public.class_is_demo(class_id)')
  ) AS v(tbl, expr)
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Demo isolation" ON public.%I', t.tbl);
    EXECUTE format(
      'CREATE POLICY "Demo isolation" ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (%s = public.current_user_is_demo()) WITH CHECK (%s = public.current_user_is_demo())',
      t.tbl, t.expr, t.expr);
  END LOOP;
END;
$$;

-- ------------------------------------------------------------
-- Rows that link things must link things from the same side (server functions and
-- triggers bypass row security, so the data itself is checked too).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_same_side()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Read columns through JSON: the tables don't all have the same columns, and naming a
  -- missing one directly (NEW.student_id on class_subjects) would fail.
  v_row jsonb := to_jsonb(NEW);
  v_side boolean;
BEGIN
  IF TG_TABLE_NAME = 'students' THEN
    IF v_row ->> 'class_id' IS NOT NULL
       AND public.class_is_demo((v_row ->> 'class_id')::uuid) <> public.user_is_demo((v_row ->> 'user_id')::uuid) THEN
      RAISE EXCEPTION 'Class not found';
    END IF;
    RETURN NEW;
  END IF;

  v_side := public.class_is_demo((v_row ->> 'class_id')::uuid);
  IF v_row ? 'subject_id' AND public.subject_is_demo((v_row ->> 'subject_id')::uuid) <> v_side THEN
    RAISE EXCEPTION 'Subject not found';
  END IF;
  IF v_row ->> 'teacher_id' IS NOT NULL AND public.teacher_is_demo((v_row ->> 'teacher_id')::uuid) <> v_side THEN
    RAISE EXCEPTION 'Teacher not found';
  END IF;
  IF v_row ? 'student_id' AND public.student_is_demo((v_row ->> 'student_id')::uuid) <> v_side THEN
    RAISE EXCEPTION 'Student not found';
  END IF;
  IF v_row ? 'term_id' AND public.term_is_demo((v_row ->> 'term_id')::uuid) <> v_side THEN
    RAISE EXCEPTION 'Term not found';
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['students', 'class_subjects', 'timetable_entries', 'attendance', 'results'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_same_side ON public.%I', t);
    EXECUTE format('CREATE TRIGGER trg_same_side BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.check_same_side()', t);
  END LOOP;
END;
$$;

-- Admin functions act only on their own side.
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
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = _user_id)
     OR public.user_is_demo(_user_id) <> public.current_user_is_demo() THEN
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

CREATE OR REPLACE FUNCTION public.set_active_term(_term_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_side boolean := public.current_user_is_demo();
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only administrators can change the active term';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.terms WHERE id = _term_id AND is_demo = v_side) THEN
    RAISE EXCEPTION 'Term not found';
  END IF;
  UPDATE public.terms SET is_active = false WHERE is_active AND is_demo = v_side AND id <> _term_id;
  UPDATE public.terms SET is_active = true WHERE id = _term_id;
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
     AND NOT EXISTS (
       SELECT 1 FROM public.user_roles
       WHERE role = 'admin' AND id <> OLD.id
         AND public.user_is_demo(user_id) = public.user_is_demo(OLD.user_id)
     ) THEN
    RAISE EXCEPTION 'Cannot remove the last administrator';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_same_side() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_removing_last_admin() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_user_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_active_term(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_user_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_active_term(uuid) TO authenticated;
