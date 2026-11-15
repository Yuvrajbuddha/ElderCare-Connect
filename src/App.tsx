import { useEffect } from 'react';
import { HeartPulse } from 'lucide-react';
import { AcceptInviteView } from './components/AcceptInviteView';
import { AuthRouteView } from './components/AuthRouteView';
import { LandingView } from './components/LandingView';
import { OnboardingView } from './components/OnboardingView';
import { ToastStack } from './components/ui/ToastStack';
import { WorkspaceShell } from './components/WorkspaceShell';
import { CareProvider, useCare } from './context/CareContext';
import { routeToSection, useAppRouter } from './lib/router';

function CareAppRouter() {
  const {
    firebaseUser,
    authReady,
    emailVerified,
    profile,
    profileLoading,
    circles,
    circlesLoading,
  } = useCare();
  const { route, navigate } = useAppRouter();

  const isAuthFormRoute =
    route === '/login' ||
    route === '/signup' ||
    route === '/get-started' ||
    route === '/forgot-password';
  const workspaceSection = routeToSection(route);

  // Redirect verified authenticated users away from auth/verification routes to workspace
  useEffect(() => {
    if (!authReady || !firebaseUser || !emailVerified) return;
    if (isAuthFormRoute || route === '/verify-email') {
      navigate('/dashboard', { replace: true });
    }
  }, [authReady, firebaseUser, emailVerified, isAuthFormRoute, route, navigate]);

  // Redirect authenticated but unverified users trying to access protected routes to /verify-email
  useEffect(() => {
    if (!authReady || !firebaseUser || emailVerified) return;
    if (workspaceSection !== null || route === '/accept-invite' || isAuthFormRoute) {
      navigate('/verify-email', { replace: true });
    }
  }, [authReady, firebaseUser, emailVerified, workspaceSection, route, isAuthFormRoute, navigate]);

  // Redirect unauthenticated users trying to open protected workspace routes directly to /login
  useEffect(() => {
    if (!authReady || firebaseUser) return;
    if (workspaceSection !== null || route === '/verify-email') {
      navigate('/login', { replace: true });
    }
  }, [authReady, firebaseUser, workspaceSection, route, navigate]);

  if (!authReady || (firebaseUser && emailVerified && (profileLoading || circlesLoading))) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#F7F7F5] px-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#ECFDF5] text-[#065F46]">
          <HeartPulse className="h-6 w-6" />
        </div>
        <p className="font-display mt-4 text-base font-semibold text-[#1F2937]">CareConnect AI</p>
        <p className="mt-1 text-sm text-[#6B7280]">Loading your Care Circle workspace...</p>
      </div>
    );
  }

  if (!firebaseUser) {
    if (route === '/login') {
      return <AuthRouteView mode="login" onNavigate={navigate} />;
    }
    if (route === '/signup' || route === '/get-started') {
      return <AuthRouteView mode="signup" onNavigate={navigate} />;
    }
    if (route === '/forgot-password') {
      return <AuthRouteView mode="forgot-password" onNavigate={navigate} />;
    }
    if (route === '/accept-invite') {
      return <AcceptInviteView onNavigate={navigate} />;
    }
    return <LandingView onNavigate={navigate} isAuthenticated={false} />;
  }

  // Signed in, but email not yet verified
  if (!emailVerified) {
    if (route === '/') {
      return <LandingView onNavigate={navigate} isAuthenticated={false} />;
    }
    return <AuthRouteView mode="verify-email" onNavigate={navigate} />;
  }

  // Verified authenticated routes
  if (route === '/') {
    return <LandingView onNavigate={navigate} isAuthenticated={true} />;
  }

  if (route === '/accept-invite') {
    return <AcceptInviteView onNavigate={navigate} />;
  }

  if (!profile || circles.length === 0) {
    return <OnboardingView />;
  }

  return (
    <WorkspaceShell
      activeSection={workspaceSection ?? 'overview'}
      onNavigate={navigate}
    />
  );
}

export default function App() {
  return (
    <CareProvider>
      <CareAppRouter />
      <ToastStack />
    </CareProvider>
  );
}
