import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  HeartHandshake,
  KeyRound,
  LogOut,
  Mail,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import { useCare } from '../context/CareContext';
import { parseReadableError } from '../lib/utils';
import {
  PERMISSION_DEFINITIONS,
  acceptInvitationWithPasscode,
  createCareCircle,
  createUserProfile,
} from '../services/careService';
import type { AccountType } from '../types/healthcare';

export function OnboardingView() {
  const {
    firebaseUser,
    profile,
    circles,
    pendingInvitesForMe,
    refreshPendingInvites,
    logout,
    pushToast,
    selectActiveCircle,
  } = useCare();

  const [displayName, setDisplayName] = useState(firebaseUser?.displayName || '');
  const [accountType, setAccountType] = useState<AccountType>(() => {
    if (typeof window !== 'undefined') {
      const saved = window.sessionStorage.getItem('careconnect_preferred_role');
      if (saved === 'elderly' || saved === 'family' || saved === 'caretaker') {
        return saved;
      }
    }
    return 'elderly';
  });
  const [phone, setPhone] = useState('');
  const [emergencyContact, setEmergencyContact] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  // Elderly Profile Creation
  const [circleName, setCircleName] = useState('');
  const [patientName, setPatientName] = useState('');
  const [patientAge, setPatientAge] = useState('76');
  const [bloodType, setBloodType] = useState('');
  const [allergies, setAllergies] = useState('');
  const [primaryPhysician, setPrimaryPhysician] = useState('');
  const [submittingCircle, setSubmittingCircle] = useState(false);

  // Family / Caretaker Invitation Acceptance
  const [inviteCode, setInviteCode] = useState('');
  const [passcode, setPasscode] = useState('');
  const [relation, setRelation] = useState('');
  const [joiningInvite, setJoiningInvite] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  useEffect(() => {
    if (profile?.accountType === 'elderly' && !patientName) {
      setPatientName(profile.displayName);
      setCircleName(`${profile.displayName.split(' ')[0]}'s Care Circle`);
    }
  }, [profile, patientName]);

  useEffect(() => {
    if (profile && profile.accountType !== 'elderly') {
      void refreshPendingInvites();
    }
  }, [profile, refreshPendingInvites]);

  if (!firebaseUser) return null;

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) {
      pushToast('error', 'Please enter your full name.');
      return;
    }
    setSavingProfile(true);
    try {
      await createUserProfile({
        uid: firebaseUser.uid,
        displayName: displayName.trim(),
        email: firebaseUser.email || '',
        accountType,
        phone,
        emergencyContact,
      });
      if (accountType === 'elderly') {
        setPatientName(displayName.trim());
        setCircleName(`${displayName.trim().split(' ')[0]}'s Care Circle`);
      }
      pushToast('success', 'Profile saved.');
    } catch (error) {
      pushToast('error', parseReadableError(error));
    } finally {
      setSavingProfile(false);
    }
  };

  const handleCreateCircle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    if (!circleName.trim() || !patientName.trim()) {
      pushToast('error', 'Please enter both a Care Circle name and patient name.');
      return;
    }
    setSubmittingCircle(true);
    try {
      const circleId = await createCareCircle({
        ownerUid: firebaseUser.uid,
        ownerName: profile.displayName,
        ownerEmail: firebaseUser.email || profile.email,
        circleName: circleName.trim(),
        patientName: patientName.trim(),
        patientAge: Number(patientAge) || 75,
        bloodType,
        allergies,
        primaryPhysician,
        relation: 'Self (Owner)',
      });
      await selectActiveCircle(circleId);
      pushToast('success', 'Healthcare profile and Care Circle created.');
    } catch (error) {
      pushToast('error', parseReadableError(error));
    } finally {
      setSubmittingCircle(false);
    }
  };

  const handleAcceptInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setJoinError(null);
    if (!inviteCode.trim() || !passcode.trim()) {
      setJoinError('Enter both your invitation code and the 6-character security passcode.');
      return;
    }
    setJoiningInvite(true);
    try {
      const result = await acceptInvitationWithPasscode({
        inviteCode,
        passcode,
        uid: firebaseUser.uid,
        displayName: profile.displayName,
        email: firebaseUser.email || profile.email,
        relationOverride: relation,
        existingCircleIds: circles.map((c) => c.id),
      });
      await selectActiveCircle(result.circleId);
      pushToast('success', `Connected to ${result.circleName}.`);
    } catch (error) {
      const msg = parseReadableError(error);
      setJoinError(msg);
      pushToast('error', msg);
    } finally {
      setJoiningInvite(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F7F5] text-[#1F2937]">
      <header className="border-b border-[#E5E7EB] bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <span className="font-display text-lg font-bold text-[#064E3B]">CareConnect AI</span>
          <div className="flex items-center gap-4">
            <span className="hidden text-sm text-[#6B7280] sm:inline">{firebaseUser.email}</span>
            <button
              type="button"
              onClick={logout}
              className="inline-flex min-h-[38px] items-center gap-2 rounded-lg border border-[#D1D5DB] bg-white px-3 py-1.5 text-xs font-medium text-[#374151] transition-colors hover:bg-[#F3F4F6]"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Sign out</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12">
        {!profile ? (
          <div className="rounded-2xl border border-[#E5E7EB] bg-white p-8 shadow-sm">
            <div className="flex items-center gap-3 text-xs font-medium text-[#0D9488]">
              <ShieldCheck className="h-4 w-4" />
              <span>Step 1 of 2 · Role &amp; Profile Setup</span>
            </div>
            <h1 className="font-display mt-2 text-2xl font-bold text-[#1F2937]">
              Complete your CareConnect AI profile
            </h1>
            <p className="mt-1.5 text-sm text-[#6B7280]">
              Elderly individuals own and manage their healthcare profile. Family members and caretakers connect
              only through authorized, time-limited invitations.
            </p>

            <form onSubmit={handleSaveProfile} className="mt-6 space-y-5">
              <div>
                <label className="block text-sm font-medium text-[#1F2937]">Your Role *</label>
                <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {(
                    [
                      {
                        id: 'elderly',
                        title: 'Elderly Individual',
                        desc: 'Create & own my healthcare profile and invite caregivers',
                      },
                      {
                        id: 'family',
                        title: 'Family Member',
                        desc: 'Accept an invitation from an elderly loved one',
                      },
                      {
                        id: 'caretaker',
                        title: 'Caretaker / Nurse',
                        desc: 'Accept a caregiver invitation to log doses & vitals',
                      },
                    ] as const
                  ).map((role) => (
                    <button
                      key={role.id}
                      type="button"
                      onClick={() => setAccountType(role.id)}
                      className={`rounded-xl border p-4 text-left transition-colors ${
                        accountType === role.id
                          ? 'border-[#065F46] bg-[#ECFDF5]'
                          : 'border-[#E5E7EB] bg-white hover:bg-[#F9FAFB]'
                      }`}
                    >
                      <div className="font-display text-sm font-semibold text-[#1F2937]">{role.title}</div>
                      <div className="mt-1 text-xs text-[#6B7280]">{role.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="onb-name" className="block text-sm font-medium text-[#1F2937]">
                    Full Name *
                  </label>
                  <input
                    id="onb-name"
                    type="text"
                    required
                    maxLength={100}
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="e.g. Margaret Vance"
                    className="mt-1.5 w-full rounded-lg border border-[#D1D5DB] bg-white px-3.5 py-2.5 text-sm text-[#1F2937] focus:border-[#065F46] focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="onb-phone" className="block text-sm font-medium text-[#1F2937]">
                    Phone Number (Optional)
                  </label>
                  <input
                    id="onb-phone"
                    type="tel"
                    maxLength={40}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="(555) 234-5678"
                    className="mt-1.5 w-full rounded-lg border border-[#D1D5DB] bg-white px-3.5 py-2.5 text-sm text-[#1F2937] focus:border-[#065F46] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="onb-emergency" className="block text-sm font-medium text-[#1F2937]">
                  Emergency Contact (Optional)
                </label>
                <input
                  id="onb-emergency"
                  type="text"
                  maxLength={160}
                  value={emergencyContact}
                  onChange={(e) => setEmergencyContact(e.target.value)}
                  placeholder="e.g. Sarah Vance (Daughter) · (555) 987-6543"
                  className="mt-1.5 w-full rounded-lg border border-[#D1D5DB] bg-white px-3.5 py-2.5 text-sm text-[#1F2937] focus:border-[#065F46] focus:outline-none"
                />
              </div>

              <div className="flex justify-end border-t border-[#E5E7EB] pt-5">
                <button
                  type="submit"
                  disabled={savingProfile}
                  className="inline-flex min-h-[42px] items-center justify-center rounded-lg bg-[#065F46] px-6 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#047857] disabled:opacity-60"
                >
                  {savingProfile ? 'Saving Profile...' : 'Continue'}
                </button>
              </div>
            </form>
          </div>
        ) : profile.accountType === 'elderly' ? (
          <div className="rounded-2xl border border-[#E5E7EB] bg-white p-8 shadow-sm">
            <div className="flex items-center gap-3 text-xs font-medium text-[#0D9488]">
              <HeartHandshake className="h-4 w-4" />
              <span>Step 2 of 2 · Initialize Your Healthcare Profile</span>
            </div>
            <h1 className="font-display mt-2 text-2xl font-bold text-[#1F2937]">
              Create your Care Circle
            </h1>
            <p className="mt-1.5 text-sm text-[#6B7280]">
              You remain the owner of your healthcare profile. Once created, you can send time-limited,
              passcode-protected invitations to trusted family members and caretakers.
            </p>

            <form onSubmit={handleCreateCircle} className="mt-6 space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="cc-name" className="block text-sm font-medium text-[#1F2937]">
                    Care Circle Name *
                  </label>
                  <input
                    id="cc-name"
                    type="text"
                    required
                    maxLength={120}
                    value={circleName}
                    onChange={(e) => setCircleName(e.target.value)}
                    placeholder="e.g. Eleanor's Care Circle"
                    className="mt-1.5 w-full rounded-lg border border-[#D1D5DB] px-3.5 py-2.5 text-sm focus:border-[#065F46] focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="cc-patient" className="block text-sm font-medium text-[#1F2937]">
                    Patient Full Name *
                  </label>
                  <input
                    id="cc-patient"
                    type="text"
                    required
                    maxLength={120}
                    value={patientName}
                    onChange={(e) => setPatientName(e.target.value)}
                    placeholder="e.g. Eleanor Bennett"
                    className="mt-1.5 w-full rounded-lg border border-[#D1D5DB] px-3.5 py-2.5 text-sm focus:border-[#065F46] focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="cc-age" className="block text-sm font-medium text-[#1F2937]">
                    Age *
                  </label>
                  <input
                    id="cc-age"
                    type="number"
                    min={1}
                    max={125}
                    required
                    value={patientAge}
                    onChange={(e) => setPatientAge(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-[#D1D5DB] px-3.5 py-2.5 font-mono text-sm tabular-nums focus:border-[#065F46] focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="cc-blood" className="block text-sm font-medium text-[#1F2937]">
                    Blood Type
                  </label>
                  <input
                    id="cc-blood"
                    type="text"
                    maxLength={16}
                    value={bloodType}
                    onChange={(e) => setBloodType(e.target.value)}
                    placeholder="e.g. O+"
                    className="mt-1.5 w-full rounded-lg border border-[#D1D5DB] px-3.5 py-2.5 text-sm focus:border-[#065F46] focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="cc-doc" className="block text-sm font-medium text-[#1F2937]">
                    Primary Physician
                  </label>
                  <input
                    id="cc-doc"
                    type="text"
                    maxLength={120}
                    value={primaryPhysician}
                    onChange={(e) => setPrimaryPhysician(e.target.value)}
                    placeholder="e.g. Dr. Elena Rostova"
                    className="mt-1.5 w-full rounded-lg border border-[#D1D5DB] px-3.5 py-2.5 text-sm focus:border-[#065F46] focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="cc-allergies" className="block text-sm font-medium text-[#1F2937]">
                    Known Allergies
                  </label>
                  <input
                    id="cc-allergies"
                    type="text"
                    maxLength={500}
                    value={allergies}
                    onChange={(e) => setAllergies(e.target.value)}
                    placeholder="e.g. Penicillin, Sulfa drugs"
                    className="mt-1.5 w-full rounded-lg border border-[#D1D5DB] px-3.5 py-2.5 text-sm focus:border-[#065F46] focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end border-t border-[#E5E7EB] pt-5">
                <button
                  type="submit"
                  disabled={submittingCircle}
                  className="inline-flex min-h-[42px] items-center justify-center rounded-lg bg-[#065F46] px-6 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#047857] disabled:opacity-60"
                >
                  {submittingCircle ? 'Creating Care Circle...' : 'Create My Care Circle'}
                </button>
              </div>
            </form>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="rounded-2xl border border-[#E5E7EB] bg-white p-8 shadow-sm">
              <div className="flex items-center gap-3 text-xs font-medium text-[#0D9488]">
                <KeyRound className="h-4 w-4" />
                <span>Step 2 of 2 · Accept Care Circle Invitation</span>
              </div>
              <h1 className="font-display mt-2 text-2xl font-bold text-[#1F2937]">
                Connect via verified invitation
              </h1>
              <p className="mt-1.5 text-sm text-[#6B7280]">
                As a <span className="capitalize font-semibold text-[#1F2937]">{profile.accountType}</span>,
                you can only access an elderly individual&apos;s healthcare profile after accepting an invitation
                issued specifically to <span className="font-semibold text-[#1F2937]">{firebaseUser.email}</span>{' '}
                and verifying the 6-character security passcode.
              </p>

              {pendingInvitesForMe.length > 0 && (
                <div className="mt-6 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[#065F46]">
                    <Mail className="h-3.5 w-3.5" />
                    <span>Pending Invitations for {firebaseUser.email}</span>
                  </div>
                  {pendingInvitesForMe.map((inv) => (
                    <div
                      key={inv.inviteCode}
                      className="flex flex-col justify-between gap-3 rounded-xl border border-emerald-200 bg-[#ECFDF5]/60 p-4 sm:flex-row sm:items-center"
                    >
                      <div>
                        <p className="font-display text-sm font-bold text-[#1F2937]">
                          {inv.circleName} · Patient: {inv.patientName}
                        </p>
                        <p className="mt-0.5 text-xs text-[#4B5563]">
                          Invited by {inv.ownerName} as <span className="capitalize">{inv.invitedRole}</span> (
                          {inv.relation}) ·{' '}
                          {PERMISSION_DEFINITIONS.filter((p) => inv.permissions[p.key]).length} permissions granted
                        </p>
                        <p className="mt-1 inline-flex items-center gap-1 font-mono text-xs text-[#065F46]">
                          <Clock className="h-3 w-3" />
                          Code: {inv.inviteCode}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setInviteCode(inv.inviteCode);
                          setRelation(inv.relation);
                          setJoinError(null);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[#065F46] px-4 py-2 text-xs font-semibold text-white hover:bg-[#047857] shrink-0"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        <span>Select Code</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {joinError && (
                <div
                  role="alert"
                  className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs leading-relaxed text-[#B91C1C]"
                >
                  {joinError}
                </div>
              )}

              <form onSubmit={handleAcceptInvite} className="mt-6 space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="onb-code" className="block text-sm font-medium text-[#1F2937]">
                      Invitation Code *
                    </label>
                    <input
                      id="onb-code"
                      type="text"
                      required
                      maxLength={20}
                      value={inviteCode}
                      onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                      placeholder="CARE-XXXXXX"
                      className="mt-1.5 w-full rounded-lg border border-[#D1D5DB] px-3.5 py-2.5 font-mono text-sm uppercase tracking-wider focus:border-[#065F46] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label htmlFor="onb-passcode" className="block text-sm font-medium text-[#1F2937]">
                      6-Character Security Passcode *
                    </label>
                    <input
                      id="onb-passcode"
                      type="text"
                      required
                      maxLength={16}
                      value={passcode}
                      onChange={(e) => setPasscode(e.target.value.toUpperCase())}
                      placeholder="X7K9M2"
                      className="mt-1.5 w-full rounded-lg border border-[#D1D5DB] px-3.5 py-2.5 font-mono text-sm uppercase tracking-widest focus:border-[#065F46] focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="onb-rel" className="block text-sm font-medium text-[#1F2937]">
                    Your Relation / Care Title
                  </label>
                  <input
                    id="onb-rel"
                    type="text"
                    maxLength={80}
                    value={relation}
                    onChange={(e) => setRelation(e.target.value)}
                    placeholder="e.g. Daughter, Daytime Caretaker, Visiting Nurse"
                    className="mt-1.5 w-full rounded-lg border border-[#D1D5DB] px-3.5 py-2.5 text-sm focus:border-[#065F46] focus:outline-none"
                  />
                </div>

                <div className="flex items-center justify-between border-t border-[#E5E7EB] pt-5">
                  <button
                    type="button"
                    onClick={() => void refreshPendingInvites()}
                    className="text-xs font-semibold text-[#065F46] hover:underline"
                  >
                    Check again for invitations
                  </button>
                  <button
                    type="submit"
                    disabled={joiningInvite}
                    className="inline-flex min-h-[42px] items-center gap-2 rounded-lg bg-[#065F46] px-6 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#047857] disabled:opacity-60"
                  >
                    <UserCheck className="h-4 w-4" />
                    <span>{joiningInvite ? 'Verifying Passcode...' : 'Verify & Accept Invitation'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
