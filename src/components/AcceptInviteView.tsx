import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  KeyRound,
  Lock,
  Mail,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import { useCare } from '../context/CareContext';
import { parseReadableError } from '../lib/utils';
import {
  SIMPLE_PERMISSION_DEFINITIONS,
  acceptInvitationWithPasscode,
  createUserProfile,
  toSimplePermissions,
  verifyInvitationWithServer,
} from '../services/careService';
import type { CircleInvite, MemberPermissions } from '../types/healthcare';

interface AcceptInviteViewProps {
  onNavigate: (path: string) => void;
}

interface VerifiedPreview {
  inviteCode: string;
  circleId: string;
  circleName: string;
  patientName: string;
  ownerName: string;
  invitedEmail: string;
  invitedRole: 'family' | 'caretaker';
  relation: string;
  permissions: MemberPermissions;
  expiresAt: string;
}

function formatExpiryCountdown(expiresMs: number): string {
  const diffMs = expiresMs - Date.now();
  if (diffMs <= 0) return 'Expired';
  const hours = Math.floor(diffMs / 3600000);
  const mins = Math.floor((diffMs % 3600000) / 60000);
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `Expires in ${days}d ${hours % 24}h`;
  }
  if (hours > 0) return `Expires in ${hours}h ${mins}m`;
  return `Expires in ${mins}m`;
}

export function AcceptInviteView({ onNavigate }: AcceptInviteViewProps) {
  const {
    firebaseUser,
    emailVerified,
    profile,
    circles,
    pendingInvitesForMe,
    refreshPendingInvites,
    selectActiveCircle,
    pushToast,
    logout,
  } = useCare();

  const [inviteCode, setInviteCode] = useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return (params.get('code') || '').toUpperCase();
    }
    return '';
  });
  const [passcode, setPasscode] = useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return (params.get('p') || '').toUpperCase();
    }
    return '';
  });
  const [relationOverride, setRelationOverride] = useState('');
  const [displayNameInput, setDisplayNameInput] = useState(
    profile?.displayName || firebaseUser?.displayName || '',
  );

  const [verifying, setVerifying] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [verifiedPreview, setVerifiedPreview] = useState<VerifiedPreview | null>(null);

  useEffect(() => {
    if (profile?.displayName) {
      setDisplayNameInput(profile.displayName);
    } else if (firebaseUser?.displayName) {
      setDisplayNameInput((prev) => prev || firebaseUser.displayName || '');
    }
  }, [profile?.displayName, firebaseUser?.displayName]);

  useEffect(() => {
    if (firebaseUser && emailVerified) {
      void refreshPendingInvites();
    }
  }, [firebaseUser, emailVerified, refreshPendingInvites]);

  if (!firebaseUser) {
    return (
      <div className="min-h-screen bg-[#F7F7F5] text-[#1F2937]">
        <header className="border-b border-[#E5E7EB] bg-white">
          <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
            <button
              type="button"
              onClick={() => onNavigate('/')}
              className="font-display text-lg font-bold text-[#064E3B]"
            >
              CareConnect AI
            </button>
            <button
              type="button"
              onClick={() => onNavigate('/login')}
              className="text-sm font-semibold text-[#065F46] hover:underline"
            >
              Sign In
            </button>
          </div>
        </header>
        <main className="mx-auto max-w-xl px-6 py-16">
          <div className="rounded-2xl border border-[#E5E7EB] bg-white p-8 shadow-sm text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-[#ECFDF5] text-[#065F46]">
              <Lock className="h-6 w-6" />
            </div>
            <h1 className="font-display mt-4 text-2xl font-bold text-[#1F2937]">
              Sign in to accept your Care Circle invitation
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-[#4B5563]">
              Invitations are bound strictly to your verified email address. Please sign in or create an account
              with the exact email that received the invitation.
            </p>
            <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => onNavigate('/login')}
                className="min-h-[44px] rounded-lg bg-[#065F46] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#047857]"
              >
                Sign In to Accept
              </button>
              <button
                type="button"
                onClick={() => onNavigate('/signup')}
                className="min-h-[44px] rounded-lg border border-[#D1D5DB] bg-white px-6 py-2.5 text-sm font-semibold text-[#1F2937] hover:bg-[#F3F4F6]"
              >
                Create Account
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  const handleSelectPendingInvite = (inv: CircleInvite) => {
    setInviteCode(inv.inviteCode);
    setRelationOverride(inv.relation);
    setErrorMsg(null);
    setVerifiedPreview({
      inviteCode: inv.inviteCode,
      circleId: inv.circleId,
      circleName: inv.circleName,
      patientName: inv.patientName,
      ownerName: inv.ownerName,
      invitedEmail: inv.invitedEmail,
      invitedRole: inv.invitedRole,
      relation: inv.relation,
      permissions: inv.permissions,
      expiresAt: inv.expiresAt.toDate().toISOString(),
    });
  };

  const handleVerifyPreview = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!inviteCode.trim() || !passcode.trim()) {
      setErrorMsg('Enter both the invitation code and the 6-character security passcode.');
      return;
    }
    setVerifying(true);
    try {
      const res = await verifyInvitationWithServer({ inviteCode, passcode });
      setVerifiedPreview(res.invite);
      if (!relationOverride) {
        setRelationOverride(res.invite.relation);
      }
      pushToast('info', 'Invitation details verified. Review granted permissions and click Accept.');
    } catch (err) {
      setVerifiedPreview(null);
      setErrorMsg(parseReadableError(err));
    } finally {
      setVerifying(false);
    }
  };

  const handleAcceptInvitation = async () => {
    setErrorMsg(null);
    if (!inviteCode.trim() || !passcode.trim()) {
      setErrorMsg('Please enter the 6-character security passcode shared by the elderly Care Circle owner.');
      return;
    }
    const finalName = displayNameInput.trim() || firebaseUser.displayName || 'Care Member';
    setAccepting(true);
    try {
      // Ensure user profile exists before batch-updating activeCircleId
      if (!profile) {
        const previewRole = verifiedPreview?.invitedRole ?? 'family';
        await createUserProfile({
          uid: firebaseUser.uid,
          displayName: finalName,
          email: firebaseUser.email || '',
          accountType: previewRole,
        });
      }

      const result = await acceptInvitationWithPasscode({
        inviteCode,
        passcode,
        uid: firebaseUser.uid,
        displayName: finalName,
        email: firebaseUser.email || '',
        relationOverride,
        existingCircleIds: circles.map((c) => c.id),
      });

      await selectActiveCircle(result.circleId);
      await refreshPendingInvites();
      pushToast('success', `Invitation accepted. Connected to ${result.circleName}.`);
      onNavigate('/dashboard');
    } catch (err) {
      setErrorMsg(parseReadableError(err));
    } finally {
      setAccepting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F7F5] text-[#1F2937]">
      <header className="border-b border-[#E5E7EB] bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-4">
          <button
            type="button"
            onClick={() => onNavigate('/')}
            className="font-display text-lg font-bold text-[#064E3B]"
          >
            CareConnect AI
          </button>
          <div className="flex items-center gap-4">
            <span className="hidden text-xs text-[#6B7280] sm:inline">
              Verified as <span className="font-semibold text-[#1F2937]">{firebaseUser.email}</span>
            </span>
            {circles.length > 0 && (
              <button
                type="button"
                onClick={() => onNavigate('/dashboard')}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#065F46] hover:underline"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Back to Dashboard</span>
              </button>
            )}
            <button
              type="button"
              onClick={logout}
              className="rounded-lg border border-[#D1D5DB] bg-white px-3 py-1.5 text-xs font-medium text-[#374151] hover:bg-[#F3F4F6]"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-10 space-y-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[#0D9488]">
            Secure Invitation Verification
          </p>
          <h1 className="font-display mt-1 text-2xl font-bold text-[#1F2937]">
            Accept a Care Circle Invitation
          </h1>
          <p className="mt-1.5 text-sm text-[#4B5563]">
            Access is granted only when an invitation matches your verified email address, has not expired, and
            passes server-side security passcode verification.
          </p>
        </div>

        {/* Pending Invitations Addressed to Caller's Verified Email */}
        <section className="rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between border-b border-[#E5E7EB] pb-3.5">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-[#065F46]" />
              <h2 className="font-display text-base font-semibold text-[#1F2937]">
                Invitations Issued to {firebaseUser.email}
              </h2>
            </div>
            <span className="text-xs text-[#6B7280] tabular-nums">
              {pendingInvitesForMe.length} active
            </span>
          </div>

          {pendingInvitesForMe.length === 0 ? (
            <p className="mt-4 text-sm text-[#6B7280]">
              No pending invitations were found automatically for{' '}
              <span className="font-medium text-[#1F2937]">{firebaseUser.email}</span>. Ask the elderly Care
              Circle owner to issue an invitation to this exact email address, or enter your invitation code and
              passcode below.
            </p>
          ) : (
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              {pendingInvitesForMe.map((inv) => {
                const isSelected = verifiedPreview?.inviteCode === inv.inviteCode;
                const expiryMs = inv.expiresAt?.toMillis?.() ?? 0;
                return (
                  <div
                    key={inv.inviteCode}
                    className={`rounded-xl border p-4 transition-colors ${
                      isSelected ? 'border-[#065F46] bg-[#ECFDF5]/60' : 'border-[#E5E7EB] bg-[#F9FAFB]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-display text-sm font-bold text-[#1F2937]">{inv.circleName}</p>
                        <p className="text-xs text-[#4B5563]">
                          Patient: <span className="font-medium">{inv.patientName}</span> · Owner: {inv.ownerName}
                        </p>
                      </div>
                      <span className="font-mono text-xs font-semibold text-[#065F46]">{inv.inviteCode}</span>
                    </div>

                    <div className="mt-2.5 flex flex-wrap items-center gap-3 text-xs text-[#6B7280]">
                      <span className="capitalize">
                        Role: <strong className="text-[#1F2937]">{inv.invitedRole}</strong> ({inv.relation})
                      </span>
                      <span className="inline-flex items-center gap-1 text-[#0D9488]">
                        <Clock className="h-3 w-3" />
                        {formatExpiryCountdown(expiryMs)}
                      </span>
                    </div>

                    <div className="mt-3 flex justify-end">
                      <button
                        type="button"
                        onClick={() => handleSelectPendingInvite(inv)}
                        className="rounded-lg bg-[#065F46] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#047857]"
                      >
                        {isSelected ? 'Selected Below' : 'Review & Enter Passcode'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Passcode Verification & Acceptance Panel */}
        <section className="rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2 border-b border-[#E5E7EB] pb-3.5">
            <KeyRound className="h-4 w-4 text-[#065F46]" />
            <h2 className="font-display text-base font-semibold text-[#1F2937]">
              Verify Code &amp; Security Passcode
            </h2>
          </div>

          {errorMsg && (
            <div
              role="alert"
              className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs leading-relaxed text-[#B91C1C]"
            >
              {errorMsg}
            </div>
          )}

          <form onSubmit={handleVerifyPreview} className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="acc-code" className="block text-xs font-semibold text-[#1F2937]">
                Invitation Code *
              </label>
              <input
                id="acc-code"
                type="text"
                required
                maxLength={20}
                value={inviteCode}
                onChange={(e) => {
                  setInviteCode(e.target.value.toUpperCase());
                  setVerifiedPreview(null);
                }}
                placeholder="CARE-XXXXXX"
                className="mt-1 w-full rounded-lg border border-[#D1D5DB] px-3.5 py-2.5 font-mono text-sm uppercase tracking-wider focus:border-[#065F46] focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="acc-pass" className="block text-xs font-semibold text-[#1F2937]">
                6-Character Security Passcode *
              </label>
              <input
                id="acc-pass"
                type="text"
                required
                maxLength={16}
                value={passcode}
                onChange={(e) => setPasscode(e.target.value.toUpperCase())}
                placeholder="e.g. X7K9M2"
                className="mt-1 w-full rounded-lg border border-[#D1D5DB] px-3.5 py-2.5 font-mono text-sm uppercase tracking-widest focus:border-[#065F46] focus:outline-none"
              />
            </div>

            {!profile && (
              <div>
                <label htmlFor="acc-name" className="block text-xs font-semibold text-[#1F2937]">
                  Your Full Name *
                </label>
                <input
                  id="acc-name"
                  type="text"
                  required
                  maxLength={100}
                  value={displayNameInput}
                  onChange={(e) => setDisplayNameInput(e.target.value)}
                  placeholder="Sarah Bennett"
                  className="mt-1 w-full rounded-lg border border-[#D1D5DB] px-3.5 py-2.5 text-sm focus:border-[#065F46] focus:outline-none"
                />
              </div>
            )}

            <div className={!profile ? '' : 'sm:col-span-2'}>
              <label htmlFor="acc-rel" className="block text-xs font-semibold text-[#1F2937]">
                Your Relation / Care Title
              </label>
              <input
                id="acc-rel"
                type="text"
                maxLength={80}
                value={relationOverride}
                onChange={(e) => setRelationOverride(e.target.value)}
                placeholder="e.g. Daughter, Home Caregiver, Visiting Nurse"
                className="mt-1 w-full rounded-lg border border-[#D1D5DB] px-3.5 py-2.5 text-sm focus:border-[#065F46] focus:outline-none"
              />
            </div>

            <div className="sm:col-span-2 flex flex-wrap items-center justify-end gap-3 border-t border-[#E5E7EB] pt-4">
              <button
                type="submit"
                disabled={verifying || accepting}
                className="inline-flex min-h-[42px] items-center gap-2 rounded-lg border border-[#065F46] bg-white px-5 py-2 text-xs font-semibold text-[#065F46] hover:bg-[#ECFDF5] disabled:opacity-60"
              >
                <ShieldCheck className="h-4 w-4" />
                <span>{verifying ? 'Verifying Invitation...' : 'Check Invitation Details'}</span>
              </button>
              <button
                type="button"
                onClick={handleAcceptInvitation}
                disabled={accepting || verifying}
                className="inline-flex min-h-[42px] items-center gap-2 rounded-lg bg-[#065F46] px-6 py-2 text-sm font-semibold text-white hover:bg-[#047857] disabled:opacity-60"
              >
                <UserCheck className="h-4 w-4" />
                <span>{accepting ? 'Verifying & Joining...' : 'Verify Passcode & Accept'}</span>
              </button>
            </div>
          </form>

          {verifiedPreview && (
            <div className="mt-6 rounded-xl border border-emerald-200 bg-[#ECFDF5]/50 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#065F46]">
                    Invitation Permission Scope
                  </p>
                  <h3 className="font-display mt-0.5 text-base font-bold text-[#1F2937]">
                    {verifiedPreview.circleName} · Patient: {verifiedPreview.patientName}
                  </h3>
                  <p className="text-xs text-[#4B5563]">
                    Profile Owner: {verifiedPreview.ownerName} · Assigned Role:{' '}
                    <span className="capitalize font-semibold">{verifiedPreview.invitedRole}</span>
                  </p>
                </div>
                <span className="font-mono text-xs text-[#065F46]">
                  {formatExpiryCountdown(Date.parse(verifiedPreview.expiresAt))}
                </span>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
                {(() => {
                  const simplePerms = toSimplePermissions(verifiedPreview.permissions);
                  return SIMPLE_PERMISSION_DEFINITIONS.map((perm) => {
                    const granted = simplePerms[perm.key];
                    return (
                      <div
                        key={perm.key}
                        className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${
                          granted
                            ? 'border-emerald-200 bg-white text-[#1F2937]'
                            : 'border-[#E5E7EB] bg-[#F3F4F6] text-[#6B7280]'
                        }`}
                      >
                        <CheckCircle2
                          className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${
                            granted ? 'text-[#065F46]' : 'text-[#9CA3AF]'
                          }`}
                        />
                        <div>
                          <p className="font-semibold">{perm.label}</p>
                          <p className="text-[11px]">{granted ? 'Granted' : 'Restricted'}</p>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
