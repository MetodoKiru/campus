CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  role text NOT NULL DEFAULT 'alumno'
    CHECK (role IN ('admin', 'mentor', 'padre', 'alumno')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.students (
  profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  level text NOT NULL DEFAULT 'Explorador'
    CHECK (level IN ('Explorador', 'Constructor', 'Líder', 'Maestro')),
  skill_coins integer NOT NULL DEFAULT 0 CHECK (skill_coins >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.student_mentors (
  student_id uuid PRIMARY KEY REFERENCES public.students(profile_id) ON DELETE CASCADE,
  mentor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT student_mentors_unique_pair UNIQUE (student_id, mentor_id)
);

CREATE TABLE public.student_guardians (
  student_id uuid NOT NULL REFERENCES public.students(profile_id) ON DELETE CASCADE,
  guardian_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  relationship text,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, guardian_id)
);

CREATE INDEX student_mentors_mentor_id_idx ON public.student_mentors(mentor_id);
CREATE INDEX student_guardians_guardian_id_idx ON public.student_guardians(guardian_id);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_mentors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_guardians ENABLE ROW LEVEL SECURITY;
