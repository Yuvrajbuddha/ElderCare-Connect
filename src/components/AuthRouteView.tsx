import React, { useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  HeartHandshake,
  Lock,
  MailCheck,
  RefreshCw,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { useCare } from '../context/CareContext';
import type { AccountType } from '../types/healthcare';

export type AuthViewMode = 'login' | 'signup' | 'forgot-password' | 'verify-email';

interface AuthRouteViewProps {
  mode: AuthViewMode;
  onNavigate: (path: string) => void;
}

export function AuthRouteView({ mode, onNavigate }: AuthRouteViewProps) {
  const {
    firebaseUser,
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    sendResetPassword,
    resendVerificationEmail,
    refreshVerificationStatus,
    logout,
    pushToast,
  } = useCare();

  // Shared state
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Login & Forgot Password
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Signup
  const [selectedRole, setSelectedRole] = useState<AccountType>('elderly');
  const [fullName, setFullName] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [phone, setPhone] = useState('');

  // Reset confirmation
  const [resetSent, setResetSent] = useState(false);
  const [checkingVerification, setCheckingVerification] = useState(false);

  const handleGoogleAuth = async () => {
    setErrorMsg(null);
    setBusy(true);
    try {
      if (typeof window !== 'undefined' && mode === 'signup') {
        window.sessionStorage.setItem('careconnect_preferred_role', selectedRole);
      }
      await signInWithGoogle();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to complete Google sign-in.');
    } finally {
      setBusy(false);
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!email.trim() || !password) {
      setErrorMsg('Please enter both your email address and password.');
      return;
    }
    setBusy(true);
    try {
      await signInWithEmail(email, password);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Sign-in failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleSignupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!fullName.trim()) {
      setErrorMsg('Please enter your full name.');
      return;
    }
    if (!email.trim()) {
      setErrorMsg('Please enter a valid email address.');
      return;
    }
    if (password.length < 8) {
      setErrorMsg('Password must be at least 8 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match. Please re-enter carefully.');
      return;
    }
    setBusy(true);
    try {
      await signUpWithEmail({
        email,
        password,
        displayName: fullName,
        accountType: selectedRole,
        phone,
      });
      onNavigate('/verify-email');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to create account.');
    } finally {
      setBusy(false);
    }
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!email.trim()) {
      setErrorMsg('Enter the email address associated with your CareConnect AI account.');
      return;
    }
    setBusy(true);
    try {
      await sendResetPassword(email);
      setResetSent(true);
      setInfoMsg(`Password reset link sent to ${email.trim()}. Check your inbox and spam folder.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to send password reset email.');
    } finally {
      setBusy(false);
    }
  };

  const handleCheckVerification = async () => {
    setErrorMsg(null);
    setInfoMsg(null);
    setCheckingVerification(true);
    try {
      const verified = await refreshVerificationStatus();
      if (verified) {
        pushToast('success', 'Email verified successfully.');
        onNavigate('/dashboard');
      } else {
        setErrorMsg(
          'Your email is not marked as verified yet. Click the link in your verification email first, then click Refresh Status.',
        );
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to check verification status.');
    } finally {
      setCheckingVerification(false);
    }
  };

  const handleResendVerification = async () => {
    setErrorMsg(null);
    setInfoMsg(null);
    setBusy(true);
    try {
      await resendVerificationEmail();
      setInfoMsg(`A fresh verification link was sent to ${firebaseUser?.email}.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to resend verification email.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F7F5] text-[#1F2937]">
      <header className="border-b border-[#E5E7EB] bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-4">
          <button
            type="button"
            onClick={() => onNavigate('/')}
            className="font-display text-lg font-bold tracking-tight text-[#064E3B] whitespace-nowrap"
          >
            CareConnect AI
          </button>
          <div className="flex items-center gap-4">
            {mode !== 'verify-email' && (
              <button
                type="button"
                onClick={() => onNavigate('/accept-invite')}
                className="text-xs font-semibold text-[#065F46] hover:underline whitespace-nowrap"
              >
                Have an Invitation?
              </button>
            )}
            <button
              type="button"
              onClick={() => onNavigate('/')}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-[#4B5563] hover:text-[#064E3B]"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back to Home</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-5xl flex-col items-center justify-center px-6 py-10 lg:py-14">
        <div className="grid w-full grid-cols-1 gap-8 rounded-2xl border border-[#E5E7EB] bg-white p-7 shadow-sm lg:grid-cols-12 lg:p-10">
          {/* Left Context Column */}
          <div className="flex flex-col justify-between lg:col-span-5 lg:border-r lg:border-[#E5E7EB] lg:pr-8">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[#0D9488]">
                {mode === 'login'
                  ? 'Member Sign In'
                  : mode === 'signup'
                    ? 'Create CareConnect Account'
                    : mode === 'forgot-password'
                      ? 'Account Recovery'
                      : 'Email Verification Required'}
              </p>
              <h1 className="font-display mt-2 text-2xl font-bold text-[#1F2937]">
                {mode === 'login'
                  ? 'Welcome back to CareConnect AI'
                  : mode === 'signup'
                    ? 'Set up your role-protected care account'
                    : mode === 'forgot-password'
                      ? 'Reset your account password'
                      : 'Confirm your email address'}
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-[#4B5563]">
                {mode === 'login'
                  ? 'Sign in with your verified email and password or Google account to access your Care Circle.'
                  : mode === 'signup'
                    ? 'Elderly individuals retain full ownership of their healthcare profile and authorize family or caretakers with scoped, time-limited invitations.'
                    : mode === 'forgot-password'
                      ? 'Enter the email address on your account and we will send a secure Firebase password reset link.'
                      : 'For health privacy protection, every user must verify ownership of their email address before accessing or joining any Care Circle.'}
              </p>
            </div>

            <div className="mt-8 space-y-4 border-t border-[#E5E7EB] pt-6 text-xs text-[#6B7280]">
              <div className="flex items-start gap-2.5">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#065F46]" />
                <span>Verified identity enforced on both database rules and API routes</span>
              </div>
              <div className="flex items-start gap-2.5">
                <Lock className="mt-0.5 h-4 w-4 shrink-0 text-[#065F46]" />
                <span>Email-bound, time-limited invitations with SHA-256 passcode verification</span>
              </div>
              <div className="flex items-start gap-2.5">
                <Users className="mt-0.5 h-4 w-4 shrink-0 text-[#065F46]" />
                <span>Elderly profile owner controls granular member permissions &amp; revocation</span>
              </div>
            </div>
          </div>

          {/* Right Form Column */}
          <div className="flex flex-col justify-center lg:col-span-7 lg:pl-2">
            {errorMsg && (
              <div
                role="alert"
                className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs leading-relaxed text-[#B91C1C]"
              >
                {errorMsg}
              </div>
            )}
            {infoMsg && (
              <div
                role="status"
                className="mb-5 rounded-xl border border-emerald-200 bg-[#ECFDF5] px-4 py-3 text-xs leading-relaxed text-[#065F46]"
              >
                {infoMsg}
              </div>
            )}

            {/* VERIFY EMAIL GATE */}
            {mode === 'verify-email' && (
              <div className="rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] p-6">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#ECFDF5] text-[#065F46]">
                    <MailCheck className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="font-display text-base font-bold text-[#1F2937]">
                      Verification link sent
                    </h2>
                    <p className="text-xs text-[#6B7280]">{firebaseUser?.email}</p>
                  </div>
                </div>

                <p className="mt-4 text-sm leading-relaxed text-[#4B5563]">
                  Open the verification email sent to{' '}
                  <span className="font-semibold text-[#1F2937]">{firebaseUser?.email}</span> and click the
                  verification link. Once confirmed, click the button below to continue.
                </p>

                <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={handleCheckVerification}
                    disabled={checkingVerification}
                    className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-lg bg-[#065F46] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#047857] disabled:opacity-60"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    <span>{checkingVerification ? 'Checking Status...' : "I've Verified My Email"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleResendVerification}
                    disabled={busy}
                    className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-[#D1D5DB] bg-white px-4 py-2.5 text-xs font-semibold text-[#374151] hover:bg-[#F3F4F6] disabled:opacity-60"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    <span>Resend Link</span>
                  </button>
                </div>

                <div className="mt-5 flex items-center justify-between border-t border-[#E5E7EB] pt-4 text-xs text-[#6B7280]">
                  <span>Wrong email address?</span>
                  <button
                    type="button"
                    onClick={async () => {
                      await logout();
                      onNavigate('/login');
                    }}
                    className="font-semibold text-[#065F46] hover:underline"
                  >
                    Sign out and use another account
                  </button>
                </div>
              </div>
            )}

            {/* FORGOT PASSWORD */}
            {mode === 'forgot-password' && (
              <form onSubmit={handleForgotSubmit} className="space-y-4">
                <div>
                  <label htmlFor="reset-email" className="block text-sm font-medium text-[#1F2937]">
                    Account Email Address *
                  </label>
                  <input
                    id="reset-email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    className="mt-1.5 w-full rounded-lg border border-[#D1D5DB] bg-white px-3.5 py-2.5 text-sm focus:border-[#065F46] focus:outline-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={busy}
                  className="inline-flex min-h-[44px] w-full items-center justify-center rounded-lg bg-[#065F46] px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#047857] disabled:opacity-60"
                >
                  {busy
                    ? 'Sending Reset Link...'
                    : resetSent
                      ? 'Resend Password Reset Email'
                      : 'Send Password Reset Email'}
                </button>

                <div className="flex items-center justify-between border-t border-[#E5E7EB] pt-4 text-xs text-[#6B7280]">
                  <button
                    type="button"
                    onClick={() => onNavigate('/login')}
                    className="font-semibold text-[#065F46] hover:underline"
                  >
                    ← Return to Sign In
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate('/signup')}
                    className="font-semibold text-[#065F46] hover:underline"
                  >
                    Create a new account
                  </button>
                </div>
              </form>
            )}

            {/* LOGIN */}
            {mode === 'login' && (
              <div className="space-y-5">
                <form onSubmit={handleLoginSubmit} className="space-y-4">
                  <div>
                    <label htmlFor="login-email" className="block text-sm font-medium text-[#1F2937]">
                      Email Address
                    </label>
                    <input
                      id="login-email"
                      type="email"
                      required
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="mt-1.5 w-full rounded-lg border border-[#D1D5DB] bg-white px-3.5 py-2.5 text-sm focus:border-[#065F46] focus:outline-none"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between">
                      <label htmlFor="login-password" className="block text-sm font-medium text-[#1F2937]">
                        Password
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setErrorMsg(null);
                          onNavigate('/forgot-password');
                        }}
                        className="text-xs font-semibold text-[#065F46] hover:underline"
                      >
                        Forgot password?
                      </button>
                    </div>
                    <div className="relative mt-1.5">
                      <input
                        id="login-password"
                        type={showPassword ? 'text' : 'password'}
                        required
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter your password"
                        className="w-full rounded-lg border border-[#D1D5DB] bg-white py-2.5 pr-10 pl-3.5 text-sm focus:border-[#065F46] focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        className="absolute top-2.5 right-3 text-[#6B7280] hover:text-[#1F2937]"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={busy}
                    className="inline-flex min-h-[44px] w-full items-center justify-center rounded-lg bg-[#065F46] px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#047857] disabled:opacity-60"
                  >
                    {busy ? 'Signing In...' : 'Sign In'}
                  </button>
                </form>

                <div className="relative flex items-center py-1">
                  <div className="flex-grow border-t border-[#E5E7EB]" />
                  <span className="mx-3 text-xs text-[#6B7280]">or</span>
                  <div className="flex-grow border-t border-[#E5E7EB]" />
                </div>

                <button
                  type="button"
                  onClick={handleGoogleAuth}
                  disabled={busy}
                  className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg border border-[#D1D5DB] bg-white px-5 py-2.5 text-sm font-semibold text-[#1F2937] transition-colors hover:bg-[#F3F4F6] disabled:opacity-60"
                >
                  <HeartHandshake className="h-4 w-4 text-[#065F46]" />
                  <span>Continue with Google</span>
                </button>

                <div className="flex items-center justify-between border-t border-[#E5E7EB] pt-4 text-xs text-[#6B7280]">
                  <span>New to CareConnect AI?</span>
                  <button
                    type="button"
                    onClick={() => {
                      setErrorMsg(null);
                      onNavigate('/signup');
                    }}
                    className="font-semibold text-[#065F46] hover:underline"
                  >
                    Create an account →
                  </button>
                </div>
              </div>
            )}

            {/* SIGN UP */}
            {mode === 'signup' && (
              <div className="space-y-5">
                <div>
                  <p className="text-sm font-semibold text-[#1F2937]">Select your primary role *</p>
                  <div className="mt-2.5 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                    {(
                      [
                        {
                          id: 'elderly',
                          title: 'Elderly Individual',
                          desc: 'Own my profile & invite caregivers',
                        },
                        {
                          id: 'family',
                          title: 'Family Member',
                          desc: 'Join via secure family invitation',
                        },
                        {
                          id: 'caretaker',
                          title: 'Caretaker',
                          desc: 'Join via caregiver invitation',
                        },
                      ] as const
                    ).map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setSelectedRole(item.id)}
                        className={`rounded-xl border p-3 text-left transition-colors ${
                          selectedRole === item.id
                            ? 'border-[#065F46] bg-[#ECFDF5]'
                            : 'border-[#E5E7EB] bg-white hover:bg-[#F9FAFB]'
                        }`}
                      >
                        <div className="font-display text-xs font-bold text-[#1F2937]">{item.title}</div>
                        <div className="mt-1 text-[11px] leading-snug text-[#6B7280]">{item.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <form onSubmit={handleSignupSubmit} className="space-y-3.5">
                  <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                    <div>
                      <label htmlFor="su-name" className="block text-xs font-semibold text-[#1F2937]">
                        Full Name *
                      </label>
                      <input
                        id="su-name"
                        type="text"
                        required
                        maxLength={100}
                        autoComplete="name"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="Eleanor Bennett"
                        className="mt-1 w-full rounded-lg border border-[#D1D5DB] px-3 py-2 text-sm focus:border-[#065F46] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label htmlFor="su-phone" className="block text-xs font-semibold text-[#1F2937]">
                        Phone (Optional)
                      </label>
                      <input
                        id="su-phone"
                        type="tel"
                        maxLength={40}
                        autoComplete="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="(555) 234-5678"
                        className="mt-1 w-full rounded-lg border border-[#D1D5DB] px-3 py-2 text-sm focus:border-[#065F46] focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="su-email" className="block text-xs font-semibold text-[#1F2937]">
                      Email Address *
                    </label>
                    <input
                      id="su-email"
                      type="email"
                      required
                      maxLength={160}
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="eleanor@example.com"
                      className="mt-1 w-full rounded-lg border border-[#D1D5DB] px-3 py-2 text-sm focus:border-[#065F46] focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                    <div>
                      <label htmlFor="su-pw" className="block text-xs font-semibold text-[#1F2937]">
                        Password (8+ chars) *
                      </label>
                      <input
                        id="su-pw"
                        type="password"
                        required
                        minLength={8}
                        autoComplete="new-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Create strong password"
                        className="mt-1 w-full rounded-lg border border-[#D1D5DB] px-3 py-2 text-sm focus:border-[#065F46] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label htmlFor="su-pw2" className="block text-xs font-semibold text-[#1F2937]">
                        Confirm Password *
                      </label>
                      <input
                        id="su-pw2"
                        type="password"
                        required
                        minLength={8}
                        autoComplete="new-password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Repeat password"
                        className="mt-1 w-full rounded-lg border border-[#D1D5DB] px-3 py-2 text-sm focus:border-[#065F46] focus:outline-none"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={busy}
                    className="inline-flex min-h-[44px] w-full items-center justify-center rounded-lg bg-[#065F46] px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#047857] disabled:opacity-60"
                  >
                    {busy ? 'Creating Account...' : 'Create Account & Send Verification'}
                  </button>
                </form>

                <div className="relative flex items-center py-0.5">
                  <div className="flex-grow border-t border-[#E5E7EB]" />
                  <span className="mx-3 text-xs text-[#6B7280]">or</span>
                  <div className="flex-grow border-t border-[#E5E7EB]" />
                </div>

                <button
                  type="button"
                  onClick={handleGoogleAuth}
                  disabled={busy}
                  className="inline-flex min-h-[42px] w-full items-center justify-center gap-2 rounded-lg border border-[#D1D5DB] bg-white px-5 py-2 text-sm font-semibold text-[#1F2937] transition-colors hover:bg-[#F3F4F6] disabled:opacity-60"
                >
                  <HeartHandshake className="h-4 w-4 text-[#065F46]" />
                  <span>Continue with Google</span>
                </button>

                <div className="flex items-center justify-between border-t border-[#E5E7EB] pt-3 text-xs text-[#6B7280]">
                  <span>Already have an account?</span>
                  <button
                    type="button"
                    onClick={() => {
                      setErrorMsg(null);
                      onNavigate('/login');
                    }}
                    className="font-semibold text-[#065F46] hover:underline"
                  >
                    Sign in →
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
