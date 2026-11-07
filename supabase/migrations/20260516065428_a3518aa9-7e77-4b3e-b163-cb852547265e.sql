
DROP TABLE IF EXISTS public.completed_courses CASCADE;
DROP TABLE IF EXISTS public.registrations CASCADE;
DROP TABLE IF EXISTS public.prerequisites CASCADE;
DROP TABLE IF EXISTS public.courses CASCADE;

CREATE TABLE public.classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  level text NOT NULL,
  stream text,
  academic_year text NOT NULL DEFAULT '2025/2026',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Classes viewable by authenticated" ON public.classes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage classes" ON public.classes FOR ALL USING (has_role(auth.uid(),'admin'));

CREATE TABLE public.subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text NOT NULL UNIQUE,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Subjects viewable by authenticated" ON public.subjects FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage subjects" ON public.subjects FOR ALL USING (has_role(auth.uid(),'admin'));

CREATE TABLE public.teachers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  staff_id text UNIQUE,
  phone text,
  specialization text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.teachers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Teachers viewable by authenticated" ON public.teachers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage teachers" ON public.teachers FOR ALL USING (has_role(auth.uid(),'admin'));
CREATE POLICY "Teachers update own row" ON public.teachers FOR UPDATE USING (auth.uid() = user_id);

CREATE TABLE public.students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  admission_number text UNIQUE,
  class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  date_of_birth date,
  gender text,
  guardian_name text,
  guardian_phone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Students view own row" ON public.students FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins manage students" ON public.students FOR ALL USING (has_role(auth.uid(),'admin'));
CREATE POLICY "Teachers view students" ON public.students FOR SELECT USING (has_role(auth.uid(),'teacher'));

CREATE TABLE public.class_subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  teacher_id uuid REFERENCES public.teachers(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(class_id, subject_id)
);
ALTER TABLE public.class_subjects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Class subjects viewable by authenticated" ON public.class_subjects FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage class subjects" ON public.class_subjects FOR ALL USING (has_role(auth.uid(),'admin'));

CREATE TABLE public.terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  academic_year text NOT NULL,
  start_date date,
  end_date date,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.terms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Terms viewable by authenticated" ON public.terms FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage terms" ON public.terms FOR ALL USING (has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.is_teacher_of_class(_user_id uuid, _class_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.class_subjects cs
    JOIN public.teachers t ON t.id = cs.teacher_id
    WHERE t.user_id = _user_id AND cs.class_id = _class_id
  )
$$;

CREATE TABLE public.attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  date date NOT NULL DEFAULT current_date,
  status text NOT NULL CHECK (status IN ('present','absent','late','excused')),
  marked_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(student_id, date)
);
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage attendance" ON public.attendance FOR ALL USING (has_role(auth.uid(),'admin'));
CREATE POLICY "Teachers view attendance for their classes" ON public.attendance FOR SELECT USING (is_teacher_of_class(auth.uid(), class_id));
CREATE POLICY "Teachers insert attendance for their classes" ON public.attendance FOR INSERT WITH CHECK (is_teacher_of_class(auth.uid(), class_id));
CREATE POLICY "Teachers update attendance for their classes" ON public.attendance FOR UPDATE USING (is_teacher_of_class(auth.uid(), class_id));
CREATE POLICY "Students view own attendance" ON public.attendance FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.students s WHERE s.id = attendance.student_id AND s.user_id = auth.uid())
);

CREATE TABLE public.results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  term_id uuid NOT NULL REFERENCES public.terms(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  ca_score integer NOT NULL DEFAULT 0 CHECK (ca_score BETWEEN 0 AND 40),
  exam_score integer NOT NULL DEFAULT 0 CHECK (exam_score BETWEEN 0 AND 60),
  total integer GENERATED ALWAYS AS (ca_score + exam_score) STORED,
  grade text GENERATED ALWAYS AS (
    CASE
      WHEN ca_score + exam_score >= 70 THEN 'A'
      WHEN ca_score + exam_score >= 60 THEN 'B'
      WHEN ca_score + exam_score >= 50 THEN 'C'
      WHEN ca_score + exam_score >= 40 THEN 'D'
      ELSE 'F'
    END
  ) STORED,
  remarks text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(student_id, subject_id, term_id)
);
ALTER TABLE public.results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage results" ON public.results FOR ALL USING (has_role(auth.uid(),'admin'));
CREATE POLICY "Teachers view results for their classes" ON public.results FOR SELECT USING (is_teacher_of_class(auth.uid(), class_id));
CREATE POLICY "Teachers insert results for their classes" ON public.results FOR INSERT WITH CHECK (is_teacher_of_class(auth.uid(), class_id));
CREATE POLICY "Teachers update results for their classes" ON public.results FOR UPDATE USING (is_teacher_of_class(auth.uid(), class_id));
CREATE POLICY "Students view own results" ON public.results FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.students s WHERE s.id = results.student_id AND s.user_id = auth.uid())
);

CREATE TABLE public.timetable_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  teacher_id uuid REFERENCES public.teachers(id) ON DELETE SET NULL,
  day_of_week text NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  room text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.timetable_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Timetable viewable by authenticated" ON public.timetable_entries FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage timetable" ON public.timetable_entries FOR ALL USING (has_role(auth.uid(),'admin'));

CREATE TRIGGER classes_updated BEFORE UPDATE ON public.classes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER students_updated BEFORE UPDATE ON public.students FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER results_updated BEFORE UPDATE ON public.results FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
