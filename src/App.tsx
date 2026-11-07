import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { AppLayout } from "@/components/AppLayout";
import { Loader2 } from "lucide-react";
import { lazy, Suspense } from "react";
import NotFound from "./pages/NotFound";

// Pages are loaded on demand to keep the initial download small.
const Index = lazy(() => import("./pages/Index"));
const Auth = lazy(() => import("./pages/Auth"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const Profile = lazy(() => import("./pages/Profile"));
const StudentDashboard = lazy(() => import("./pages/StudentDashboard"));
const StudentAttendance = lazy(() => import("./pages/student/StudentAttendance"));
const StudentResults = lazy(() => import("./pages/student/StudentResults"));
const StudentTimetable = lazy(() => import("./pages/student/StudentTimetable"));
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
const ManageUsers = lazy(() => import("./pages/admin/ManageUsers"));
const ManageStudents = lazy(() => import("./pages/admin/ManageStudents"));
const ManageTeachers = lazy(() => import("./pages/admin/ManageTeachers"));
const ManageClasses = lazy(() => import("./pages/admin/ManageClasses"));
const ManageSubjects = lazy(() => import("./pages/admin/ManageSubjects"));
const ManageAssignments = lazy(() => import("./pages/admin/ManageAssignments"));
const ManageTimetable = lazy(() => import("./pages/admin/ManageTimetable"));
const ManageTerms = lazy(() => import("./pages/admin/ManageTerms"));
const TeacherDashboard = lazy(() => import("./pages/teacher/TeacherDashboard"));
const TeacherAttendance = lazy(() => import("./pages/teacher/TeacherAttendance"));
const TeacherResults = lazy(() => import("./pages/teacher/TeacherResults"));
const TeacherTimetable = lazy(() => import("./pages/teacher/TeacherTimetable"));

const queryClient = new QueryClient();

type Role = "admin" | "student" | "teacher";

const PageLoader = () => (
  <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
);

function ProtectedRoute({ children, allow }: { children: React.ReactNode; allow?: Role[] }) {
  const { user, role, loading } = useAuth();
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/auth" replace />;
  // No role yet (or it failed to load) never unlocks a role-restricted page.
  if (allow && (!role || !allow.includes(role))) return <Navigate to="/dashboard" replace />;
  return <AppLayout><Suspense fallback={<PageLoader />}>{children}</Suspense></AppLayout>;
}

function HomeRedirect() {
  const { role } = useAuth();
  if (role === "admin") return <Navigate to="/admin" replace />;
  if (role === "teacher") return <Navigate to="/teacher" replace />;
  return <StudentDashboard />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Suspense fallback={<PageLoader />}><Index /></Suspense>} />
            <Route path="/auth" element={<Suspense fallback={<PageLoader />}><Auth /></Suspense>} />
            <Route path="/reset-password" element={<Suspense fallback={<PageLoader />}><ResetPassword /></Suspense>} />
            <Route path="/dashboard" element={<ProtectedRoute><HomeRedirect /></ProtectedRoute>} />
            <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />

            {/* Student */}
            <Route path="/attendance" element={<ProtectedRoute allow={["student"]}><StudentAttendance /></ProtectedRoute>} />
            <Route path="/results" element={<ProtectedRoute allow={["student"]}><StudentResults /></ProtectedRoute>} />
            <Route path="/timetable" element={<ProtectedRoute allow={["student"]}><StudentTimetable /></ProtectedRoute>} />

            {/* Teacher */}
            <Route path="/teacher" element={<ProtectedRoute allow={["teacher"]}><TeacherDashboard /></ProtectedRoute>} />
            <Route path="/teacher/attendance" element={<ProtectedRoute allow={["teacher"]}><TeacherAttendance /></ProtectedRoute>} />
            <Route path="/teacher/results" element={<ProtectedRoute allow={["teacher"]}><TeacherResults /></ProtectedRoute>} />
            <Route path="/teacher/timetable" element={<ProtectedRoute allow={["teacher"]}><TeacherTimetable /></ProtectedRoute>} />

            {/* Admin */}
            <Route path="/admin" element={<ProtectedRoute allow={["admin"]}><AdminDashboard /></ProtectedRoute>} />
            <Route path="/admin/users" element={<ProtectedRoute allow={["admin"]}><ManageUsers /></ProtectedRoute>} />
            <Route path="/admin/students" element={<ProtectedRoute allow={["admin"]}><ManageStudents /></ProtectedRoute>} />
            <Route path="/admin/teachers" element={<ProtectedRoute allow={["admin"]}><ManageTeachers /></ProtectedRoute>} />
            <Route path="/admin/classes" element={<ProtectedRoute allow={["admin"]}><ManageClasses /></ProtectedRoute>} />
            <Route path="/admin/subjects" element={<ProtectedRoute allow={["admin"]}><ManageSubjects /></ProtectedRoute>} />
            <Route path="/admin/assignments" element={<ProtectedRoute allow={["admin"]}><ManageAssignments /></ProtectedRoute>} />
            <Route path="/admin/timetable" element={<ProtectedRoute allow={["admin"]}><ManageTimetable /></ProtectedRoute>} />
            <Route path="/admin/terms" element={<ProtectedRoute allow={["admin"]}><ManageTerms /></ProtectedRoute>} />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
