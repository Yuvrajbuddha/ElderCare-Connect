import React, { useEffect, useState } from 'react';
import {
  Check,
  Clock,
  Copy,
  KeyRound,
  MailPlus,
  Plus,
  Shield,
  ShieldAlert,
  SlidersHorizontal,
  Trash2,
  UserPlus,
  Users,
  XCircle,
} from 'lucide-react';
import { useCare } from '../context/CareContext';
import { parseReadableError } from '../lib/utils';
import {
  DEFAULT_PERMISSIONS_BY_ROLE,
  PERMISSION_DEFINITIONS,
  createCareCircle,
  createSecureInvitation,
  removeCircleMember,
  revokeInvitation,
  updateCareCircleDetails,
  updateMemberPermissions,
  updateUserProfile,
} from '../services/careService';
import type {
  CircleInvite,
  CircleMember,
  MemberPermissions,
  PermissionKey,
} from '../types/healthcare';
import { Modal } from './ui/Modal';

interface CareCircleViewProps {
  onNavigate?: (path: string) => void;
}

export function CareCircleView({ onNavigate }: CareCircleViewProps) {
  const {
    firebaseUser,
    profile,
    activeCircle,
    members,
    currentMember,
    isCircleOwner,
    ownerInvitations,
    refreshOwnerInvitations,
    selectActiveCircle,
    pushToast,
  } = useCare();

  // Edit Circle Modal
  const [editCircleOpen, setEditCircleOpen] = useState(false);
  const [cName, setCName] = useState('');
  const [cPatient, setCPatient] = useState('');
  const [cAge, setCAge] = useState('75');
  const [cBlood, setCBlood] = useState('');
  const [cAllergies, setCAllergies] = useState('');
  const [cDoc, setCDoc] = useState('');
  const [savingCircle, setSavingCircle] = useState(false);

  // Create Secure Invitation Modal
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invEmail, setInvEmail] = useState('');
  const [invRole, setInvRole] = useState<'family' | 'caretaker'>('family');
  const [invRelation, setInvRelation] = useState('');
  const [invHours, setInvHours] = useState('72');
  const [invPermissions, setInvPermissions] = useState<MemberPermissions>(
    DEFAULT_PERMISSIONS_BY_ROLE.family,
  );
  const [issuingInvite, setIssuingInvite] = useState(false);
  const [issuedCredentials, setIssuedCredentials] = useState<{
    inviteCode: string;
    passcode: string;
    invitedEmail: string;
    expiresAt: Date;
  } | null>(null);
  const [copiedCreds, setCopiedCreds] = useState(false);

  // Edit Member Permissions Modal
  const [permTarget, setPermTarget] = useState<CircleMember | null>(null);
  const [editPerms, setEditPerms] = useState<MemberPermissions>(DEFAULT_PERMISSIONS_BY_ROLE.family);
  const [editRelation, setEditRelation] = useState('');
  const [savingPerms, setSavingPerms] = useState(false);

  // Create New Circle Modal (Elderly only)
  const [createOpen, setCreateOpen] = useState(false);
  const [newCircleName, setNewCircleName] = useState('');
  const [newPatientName, setNewPatientName] = useState('');
  const [newPatientAge, setNewPatientAge] = useState('76');
  const [newPrimaryDoc, setNewPrimaryDoc] = useState('');
  const [newAllergies, setNewAllergies] = useState('');
  const [creating, setCreating] = useState(false);

  // Personal profile editing
  const [myName, setMyName] = useState(profile?.displayName || '');
  const [myPhone, setMyPhone] = useState(profile?.phone || '');
  const [myEmergency, setMyEmergency] = useState(profile?.emergencyContact || '');
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    if (profile) {
      setMyName(profile.displayName);
      setMyPhone(profile.phone || '');
      setMyEmergency(profile.emergencyContact || '');
    }
  }, [profile]);

  if (!firebaseUser || !profile || !activeCircle) return null;

  const isElderlyAccount = profile.accountType === 'elderly';

  const openEditCircle = () => {
    setCName(activeCircle.name);
    setCPatient(activeCircle.patientName);
    setCAge(String(activeCircle.patientAge));
    setCBlood(activeCircle.bloodType || '');
    setCAllergies(activeCircle.allergies || '');
    setCDoc(activeCircle.primaryPhysician || '');
    setEditCircleOpen(true);
  };

  const handleSaveCircle = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingCircle(true);
    try {
      await updateCareCircleDetails(activeCircle.id, {
        name: cName.trim(),
        patientName: cPatient.trim(),
        patientAge: Number(cAge) || 75,
        bloodType: cBlood,
        allergies: cAllergies,
        primaryPhysician: cDoc,
      });
      pushToast('success', 'Patient & Care Circle details updated.');
      setEditCircleOpen(false);
    } catch (error) {
      pushToast('error', parseReadableError(error));
    } finally {
      setSavingCircle(false);
    }
  };

  const openInviteModal = () => {
    setInvEmail('');
    setInvRole('family');
    setInvRelation('');
    setInvHours('72');
    setInvPermissions({ ...DEFAULT_PERMISSIONS_BY_ROLE.family });
    setInviteOpen(true);
  };

  const handleInvRoleChange = (role: 'family' | 'caretaker') => {
    setInvRole(role);
    setInvPermissions({ ...DEFAULT_PERMISSIONS_BY_ROLE[role] });
  };

  const toggleInvitePerm = (key: PermissionKey) => {
    setInvPermissions((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleIssueInvitation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invEmail.trim()) {
      pushToast('error', 'Enter the email address of the person you are inviting.');
      return;
    }
    setIssuingInvite(true);
    try {
      const issued = await createSecureInvitation({
        circle: activeCircle,
        ownerUid: firebaseUser.uid,
        ownerName: profile.displayName,
        invitedEmail: invEmail,
        invitedRole: invRole,
        relation: invRelation,
        permissions: invPermissions,
        expiresInHours: Number(invHours) || 72,
      });
      setIssuedCredentials({
        inviteCode: issued.inviteCode,
        passcode: issued.passcode,
        invitedEmail: invEmail.trim().toLowerCase(),
        expiresAt: issued.expiresAt,
      });
      setInviteOpen(false);
      await refreshOwnerInvitations();
      pushToast('success', `Time-limited invitation created for ${invEmail.trim().toLowerCase()}.`);
    } catch (error) {
      pushToast('error', parseReadableError(error));
    } finally {
      setIssuingInvite(false);
    }
  };

  const handleCopyCredentials = async () => {
    if (!issuedCredentials) return;
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const text = [
      `CareConnect AI Care Circle Invitation (${activeCircle.name})`,
      `Invited Email: ${issuedCredentials.invitedEmail}`,
      `Invitation Code: ${issuedCredentials.inviteCode}`,
      `Security Passcode: ${issuedCredentials.passcode}`,
      `Expires: ${issuedCredentials.expiresAt.toLocaleString()}`,
      `Accept Link: ${origin}/accept-invite?code=${issuedCredentials.inviteCode}`,
    ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopiedCreds(true);
      pushToast('success', 'Invitation code, passcode, and link copied.');
      setTimeout(() => setCopiedCreds(false), 2500);
    } catch {
      pushToast('info', `Code: ${issuedCredentials.inviteCode} · Passcode: ${issuedCredentials.passcode}`);
    }
  };

  const handleRevokeInvitation = async (inv: CircleInvite) => {
    try {
      await revokeInvitation(inv.inviteCode);
      await refreshOwnerInvitations();
      pushToast('info', `Invitation ${inv.inviteCode} for ${inv.invitedEmail} revoked.`);
    } catch (error) {
      pushToast('error', parseReadableError(error));
    }
  };

  const openPermissionsEditor = (member: CircleMember) => {
    setPermTarget(member);
    setEditPerms({
      ...(member.permissions ?? DEFAULT_PERMISSIONS_BY_ROLE.family),
    });
    setEditRelation(member.relation);
  };

  const handleSavePermissions = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!permTarget) return;
    setSavingPerms(true);
    try {
      await updateMemberPermissions({
        circleId: activeCircle.id,
        memberUid: permTarget.uid,
        permissions: editPerms,
        relation: editRelation,
      });
      pushToast('success', `Updated permissions for ${permTarget.displayName}.`);
      setPermTarget(null);
    } catch (error) {
      pushToast('error', parseReadableError(error));
    } finally {
      setSavingPerms(false);
    }
  };

  const handleRemoveMember = async (targetUid: string, targetName: string) => {
    const updatedMemberIds = activeCircle.memberIds.filter((id) => id !== targetUid);
    try {
      await removeCircleMember({
        circleId: activeCircle.id,
        targetUid,
        updatedMemberIds,
      });
      pushToast('info', `${targetName} access revoked and removed from Care Circle.`);
    } catch (error) {
      pushToast('error', parseReadableError(error));
    }
  };

  const handleCreateNewCircle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCircleName.trim() || !newPatientName.trim()) return;
    setCreating(true);
    try {
      const circleId = await createCareCircle({
        ownerUid: firebaseUser.uid,
        ownerName: profile.displayName,
        ownerEmail: firebaseUser.email || profile.email,
        circleName: newCircleName.trim(),
        patientName: newPatientName.trim(),
        patientAge: Number(newPatientAge) || 75,
        primaryPhysician: newPrimaryDoc,
        allergies: newAllergies,
      });
      await selectActiveCircle(circleId);
      setCreateOpen(false);
      setNewCircleName('');
      setNewPatientName('');
      pushToast('success', 'New Care Circle created.');
    } catch (error) {
      pushToast('error', parseReadableError(error));
    } finally {
      setCreating(false);
    }
  };

  const handleSaveMyProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!myName.trim()) return;
    setSavingProfile(true);
    try {
      await updateUserProfile(firebaseUser.uid, {
        displayName: myName.trim(),
        phone: myPhone,
        emergencyContact: myEmergency,
      });
      pushToast('success', 'Your personal profile was updated.');
    } catch (error) {
      pushToast('error', parseReadableError(error));
    } finally {
      setSavingProfile(false);
    }
  };

  const countPermissions = (perms?: MemberPermissions) => {
    if (!perms) return 0;
    return PERMISSION_DEFINITIONS.filter((p) => perms[p.key]).length;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#1F2937]">
            Care Circle, Invitations &amp; Access Control
          </h1>
          <p className="mt-0.5 text-sm text-[#6B7280]">
            Manage patient profile details, time-limited family invitations, security passcodes, and per-member
            permissions.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {onNavigate && (
            <button
              type="button"
              onClick={() => onNavigate('/accept-invite')}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-[#D1D5DB] bg-white px-4 py-2 text-xs font-semibold text-[#1F2937] hover:bg-[#F3F4F6]"
            >
              <UserPlus className="h-4 w-4" />
              <span>Accept Another Invitation</span>
            </button>
          )}
          {isCircleOwner && (
            <button
              type="button"
              onClick={openInviteModal}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-[#065F46] px-4 py-2 text-xs font-semibold text-white hover:bg-[#047857]"
            >
              <MailPlus className="h-4 w-4" />
              <span>Invite Family / Caretaker</span>
            </button>
          )}
          {isElderlyAccount && (
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-[#065F46] bg-[#ECFDF5] px-4 py-2 text-xs font-semibold text-[#065F46] hover:bg-[#D1FAE5]"
            >
              <Plus className="h-4 w-4" />
              <span>New Care Circle</span>
            </button>
          )}
        </div>
      </div>

      {/* Newly Issued Invitation Credentials (shown once after creation) */}
      {issuedCredentials && (
        <section className="rounded-xl border border-emerald-300 bg-[#ECFDF5] p-6">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[#065F46]">
                <KeyRound className="h-4 w-4" />
                <span>Invitation Created · Share Passcode Privately</span>
              </div>
              <h2 className="font-display mt-1 text-base font-bold text-[#1F2937]">
                Bound strictly to {issuedCredentials.invitedEmail}
              </h2>
              <p className="mt-1 text-xs text-[#4B5563]">
                For security, only the SHA-256 hash of this passcode is stored in the database. Share both the
                invitation code and security passcode with the recipient before{' '}
                <span className="font-medium">{issuedCredentials.expiresAt.toLocaleString()}</span>.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIssuedCredentials(null)}
              className="text-xs font-medium text-[#4B5563] hover:text-[#1F2937]"
            >
              Dismiss
            </button>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-emerald-200 bg-white px-4 py-3">
              <p className="text-[11px] font-medium text-[#6B7280]">Invitation Code</p>
              <p className="font-mono mt-0.5 text-base font-bold tracking-wider text-[#064E3B]">
                {issuedCredentials.inviteCode}
              </p>
            </div>
            <div className="rounded-lg border border-emerald-200 bg-white px-4 py-3">
              <p className="text-[11px] font-medium text-[#6B7280]">6-Char Security Passcode</p>
              <p className="font-mono mt-0.5 text-base font-bold tracking-widest text-[#064E3B]">
                {issuedCredentials.passcode}
              </p>
            </div>
            <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={handleCopyCredentials}
                className="inline-flex min-h-[42px] w-full items-center justify-center gap-2 rounded-lg bg-[#065F46] px-4 py-2 text-xs font-semibold text-white hover:bg-[#047857]"
              >
                {copiedCreds ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                <span>{copiedCreds ? 'Copied Details' : 'Copy Code, Passcode & Link'}</span>
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Patient Profile & Current Permissions Summary */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <section className="rounded-xl border border-[#E5E7EB] bg-white p-6 lg:col-span-6">
          <div className="flex items-start justify-between gap-4 border-b border-[#E5E7EB] pb-4">
            <div>
              <h2 className="font-display text-base font-semibold text-[#1F2937]">
                Elderly Patient Care Profile
              </h2>
              <p className="text-xs text-[#6B7280]">
                {activeCircle.name} · Owned by {isCircleOwner ? 'You' : 'Elderly Account Holder'}
              </p>
            </div>
            {isCircleOwner && (
              <button
                type="button"
                onClick={openEditCircle}
                className="rounded-lg border border-[#D1D5DB] px-3 py-1.5 text-xs font-medium text-[#1F2937] hover:bg-[#F3F4F6]"
              >
                Edit Details
              </button>
            )}
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-xs text-[#6B7280]">Patient Name</dt>
              <dd className="mt-0.5 font-semibold text-[#1F2937]">{activeCircle.patientName}</dd>
            </div>
            <div>
              <dt className="text-xs text-[#6B7280]">Age &amp; Blood Type</dt>
              <dd className="mt-0.5 font-mono text-[#1F2937] tabular-nums">
                {activeCircle.patientAge} yrs {activeCircle.bloodType ? `· ${activeCircle.bloodType}` : ''}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[#6B7280]">Primary Physician</dt>
              <dd className="mt-0.5 text-[#1F2937]">{activeCircle.primaryPhysician || 'Not listed'}</dd>
            </div>
            <div>
              <dt className="text-xs text-[#6B7280]">Known Allergies</dt>
              <dd className="mt-0.5 text-[#1F2937]">{activeCircle.allergies || 'None listed'}</dd>
            </div>
          </dl>
        </section>

        <section className="rounded-xl border border-[#E5E7EB] bg-white p-6 lg:col-span-6">
          <div className="flex items-start justify-between gap-4 border-b border-[#E5E7EB] pb-4">
            <div>
              <h2 className="font-display text-base font-semibold text-[#1F2937]">
                {isCircleOwner ? 'Zero-Trust Access Governance' : 'Your Granted Care Permissions'}
              </h2>
              <p className="text-xs text-[#6B7280]">
                {isCircleOwner
                  ? 'You control who joins via email-bound, time-limited passcode invitations.'
                  : 'Permissions assigned to your account by the elderly profile owner.'}
              </p>
            </div>
            <Shield className="h-5 w-5 text-[#065F46]" />
          </div>

          {isCircleOwner ? (
            <div className="mt-4 space-y-3 text-xs text-[#4B5563]">
              <p>
                Every invitation is locked to one verified email address, expires automatically after your chosen
                window, and requires a 6-character security passcode validated both server-side and in Firestore
                security rules.
              </p>
              <button
                type="button"
                onClick={openInviteModal}
                className="inline-flex min-h-[38px] items-center gap-2 rounded-lg bg-[#065F46] px-4 py-2 text-xs font-semibold text-white hover:bg-[#047857]"
              >
                <MailPlus className="h-4 w-4" />
                <span>Create Secure Invitation</span>
              </button>
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {PERMISSION_DEFINITIONS.map((perm) => {
                const allowed = Boolean(currentMember?.permissions?.[perm.key]);
                return (
                  <div
                    key={perm.key}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${
                      allowed
                        ? 'border-emerald-200 bg-[#ECFDF5]/60 text-[#065F46]'
                        : 'border-[#E5E7EB] bg-[#F9FAFB] text-[#9CA3AF]'
                    }`}
                  >
                    {allowed ? <Check className="h-3.5 w-3.5 shrink-0" /> : <XCircle className="h-3.5 w-3.5 shrink-0" />}
                    <span className="font-medium">{perm.label}</span>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Owner Invitations Ledger */}
      {isCircleOwner && (
        <section className="rounded-xl border border-[#E5E7EB] bg-white">
          <div className="flex items-center justify-between border-b border-[#E5E7EB] px-6 py-4">
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-[#065F46]" />
              <h2 className="font-display text-base font-semibold text-[#1F2937]">
                Issued Invitations ({ownerInvitations.length})
              </h2>
            </div>
            <button
              type="button"
              onClick={openInviteModal}
              className="text-xs font-semibold text-[#065F46] hover:underline"
            >
              + New Invitation
            </button>
          </div>

          {ownerInvitations.length === 0 ? (
            <div className="px-6 py-8 text-center text-xs text-[#6B7280]">
              No invitations issued yet. Invite a family member or caretaker using their verified email address.
            </div>
          ) : (
            <div className="divide-y divide-[#E5E7EB]">
              {ownerInvitations.map((inv) => {
                const expMs = inv.expiresAt?.toMillis?.() ?? 0;
                const isExpired = inv.status === 'pending' && expMs > 0 && expMs <= Date.now();
                const displayStatus = isExpired ? 'expired' : inv.status;
                return (
                  <div
                    key={inv.inviteCode}
                    className="flex flex-col justify-between gap-3 px-6 py-3.5 sm:flex-row sm:items-center"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                        <span className="text-sm font-semibold text-[#1F2937]">{inv.invitedEmail}</span>
                        <span className="font-mono text-xs font-semibold text-[#065F46]">
                          {inv.inviteCode}
                        </span>
                        <span
                          className={`text-xs font-semibold capitalize ${
                            displayStatus === 'accepted'
                              ? 'text-[#15803D]'
                              : displayStatus === 'pending'
                                ? 'text-[#0D9488]'
                                : 'text-[#B91C1C]'
                          }`}
                        >
                          · {displayStatus}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-[#6B7280]">
                        Role: <span className="capitalize">{inv.invitedRole}</span> ({inv.relation}) ·{' '}
                        {countPermissions(inv.permissions)}/6 permissions ·{' '}
                        <Clock className="inline h-3 w-3" />{' '}
                        {expMs ? `Expires ${new Date(expMs).toLocaleString()}` : 'Time-limited'}
                      </p>
                    </div>
                    {inv.status === 'pending' && !isExpired && (
                      <button
                        type="button"
                        onClick={() => handleRevokeInvitation(inv)}
                        className="inline-flex items-center gap-1.5 self-start rounded-lg border border-[#E5E7EB] px-3 py-1.5 text-xs font-medium text-[#B91C1C] hover:bg-red-50 sm:self-center"
                      >
                        <ShieldAlert className="h-3.5 w-3.5" />
                        <span>Revoke Invite</span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Members Directory & Individual Permission Management */}
      <section className="rounded-xl border border-[#E5E7EB] bg-white">
        <div className="flex items-center justify-between border-b border-[#E5E7EB] px-6 py-4">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-[#065F46]" />
            <h2 className="font-display text-base font-semibold text-[#1F2937]">
              Authorized Circle Members &amp; Permissions
            </h2>
          </div>
          <span className="text-xs text-[#6B7280] tabular-nums">{members.length} / 15 max</span>
        </div>

        <div className="divide-y divide-[#E5E7EB]">
          {members.map((m) => {
            const isTargetOwner = m.uid === activeCircle.ownerId;
            return (
              <div
                key={m.uid}
                className="flex flex-col justify-between gap-3 px-6 py-4 sm:flex-row sm:items-center"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-[#1F2937]">{m.displayName}</span>
                    {m.uid === firebaseUser.uid && (
                      <span className="text-xs font-medium text-[#0D9488]">· You</span>
                    )}
                    {isTargetOwner && (
                      <span className="text-xs font-semibold text-[#065F46]">· Profile Owner</span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-[#6B7280]">
                    <span className="capitalize">{m.memberRole}</span> · {m.relation}
                    {m.email ? ` · ${m.email}` : ''}
                    {!isTargetOwner && ` · ${countPermissions(m.permissions)}/6 permissions enabled`}
                  </p>
                </div>

                {isCircleOwner && !isTargetOwner && (
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => openPermissionsEditor(m)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[#D1D5DB] bg-white px-3 py-1.5 text-xs font-semibold text-[#1F2937] hover:bg-[#F3F4F6]"
                    >
                      <SlidersHorizontal className="h-3.5 w-3.5 text-[#065F46]" />
                      <span>Permissions</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveMember(m.uid, m.displayName)}
                      className="inline-flex items-center gap-1 rounded-lg border border-[#E5E7EB] px-2.5 py-1.5 text-xs font-medium text-[#B91C1C] hover:bg-red-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Revoke Access</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Personal Account Settings */}
      <section className="rounded-xl border border-[#E5E7EB] bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-base font-semibold text-[#1F2937]">Your Account Profile</h2>
            <p className="mt-0.5 text-xs text-[#6B7280]">
              Signed in as {profile.email} · Verified Role:{' '}
              <span className="capitalize font-semibold text-[#065F46]">{profile.accountType}</span>
            </p>
          </div>
        </div>

        <form onSubmit={handleSaveMyProfile} className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="prof-name" className="block text-sm font-medium text-[#1F2937]">
              Display Name
            </label>
            <input
              id="prof-name"
              type="text"
              required
              maxLength={100}
              value={myName}
              onChange={(e) => setMyName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#D1D5DB] px-3 py-2 text-sm focus:border-[#065F46] focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="prof-phone" className="block text-sm font-medium text-[#1F2937]">
              Phone Number
            </label>
            <input
              id="prof-phone"
              type="tel"
              maxLength={40}
              value={myPhone}
              onChange={(e) => setMyPhone(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#D1D5DB] px-3 py-2 text-sm focus:border-[#065F46] focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="prof-emerg" className="block text-sm font-medium text-[#1F2937]">
              Emergency Contact
            </label>
            <input
              id="prof-emerg"
              type="text"
              maxLength={160}
              value={myEmergency}
              onChange={(e) => setMyEmergency(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#D1D5DB] px-3 py-2 text-sm focus:border-[#065F46] focus:outline-none"
            />
          </div>
          <div className="sm:col-span-3 flex justify-end pt-2">
            <button
              type="submit"
              disabled={savingProfile}
              className="rounded-lg bg-[#065F46] px-5 py-2 text-sm font-semibold text-white hover:bg-[#047857] disabled:opacity-60"
            >
              {savingProfile ? 'Saving...' : 'Update Profile'}
            </button>
          </div>
        </form>
      </section>

      {/* Create Secure Invitation Modal */}
      <Modal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="Invite Family Member or Caretaker"
        subtitle="Generates a time-limited, email-bound invitation code and security passcode."
      >
        <form onSubmit={handleIssueInvitation} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="inv-email" className="block text-sm font-medium text-[#1F2937]">
                Invitee Email Address *
              </label>
              <input
                id="inv-email"
                type="email"
                required
                maxLength={160}
                value={invEmail}
                onChange={(e) => setInvEmail(e.target.value)}
                placeholder="sarah.bennett@example.com"
                className="mt-1 w-full rounded-lg border border-[#D1D5DB] px-3 py-2 text-sm focus:border-[#065F46] focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="inv-role" className="block text-sm font-medium text-[#1F2937]">
                Role *
              </label>
              <select
                id="inv-role"
                value={invRole}
                onChange={(e) => handleInvRoleChange(e.target.value as 'family' | 'caretaker')}
                className="mt-1 w-full rounded-lg border border-[#D1D5DB] bg-white px-3 py-2 text-sm focus:border-[#065F46] focus:outline-none"
              >
                <option value="family">Family Member</option>
                <option value="caretaker">Caretaker / Nurse</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="inv-rel" className="block text-sm font-medium text-[#1F2937]">
                Relation / Title
              </label>
              <input
                id="inv-rel"
                type="text"
                maxLength={80}
                value={invRelation}
                onChange={(e) => setInvRelation(e.target.value)}
                placeholder={invRole === 'caretaker' ? 'Daytime Caretaker' : 'Daughter'}
                className="mt-1 w-full rounded-lg border border-[#D1D5DB] px-3 py-2 text-sm focus:border-[#065F46] focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="inv-exp" className="block text-sm font-medium text-[#1F2937]">
                Invitation Validity Window
              </label>
              <select
                id="inv-exp"
                value={invHours}
                onChange={(e) => setInvHours(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#D1D5DB] bg-white px-3 py-2 text-sm focus:border-[#065F46] focus:outline-none"
              >
                <option value="24">24 Hours</option>
                <option value="72">72 Hours (3 Days)</option>
                <option value="168">7 Days</option>
                <option value="336">14 Days</option>
              </select>
            </div>
          </div>

          <div className="border-t border-[#E5E7EB] pt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#065F46]">
              Individual Healthcare Permissions
            </p>
            <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {PERMISSION_DEFINITIONS.map((perm) => (
                <label
                  key={perm.key}
                  className="flex items-start gap-2.5 rounded-lg border border-[#E5E7EB] p-2.5 text-xs hover:bg-[#F9FAFB]"
                >
                  <input
                    type="checkbox"
                    checked={invPermissions[perm.key]}
                    onChange={() => toggleInvitePerm(perm.key)}
                    className="mt-0.5 h-4 w-4 rounded border-[#D1D5DB] text-[#065F46] focus:ring-[#065F46]"
                  />
                  <div>
                    <p className="font-semibold text-[#1F2937]">{perm.label}</p>
                    <p className="text-[11px] text-[#6B7280]">{perm.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 border-t border-[#E5E7EB] pt-4">
            <button
              type="button"
              onClick={() => setInviteOpen(false)}
              className="rounded-lg border border-[#D1D5DB] bg-white px-4 py-2 text-sm font-medium text-[#374151]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={issuingInvite}
              className="rounded-lg bg-[#065F46] px-5 py-2 text-sm font-semibold text-white hover:bg-[#047857] disabled:opacity-60"
            >
              {issuingInvite ? 'Generating...' : 'Generate Secure Invitation'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Manage Member Permissions Modal */}
      <Modal
        open={Boolean(permTarget)}
        onClose={() => setPermTarget(null)}
        title={permTarget ? `Permissions for ${permTarget.displayName}` : 'Member Permissions'}
        subtitle="Changes enforce immediately in both UI and Firestore security rules."
      >
        <form onSubmit={handleSavePermissions} className="space-y-4">
          <div>
            <label htmlFor="mp-rel" className="block text-sm font-medium text-[#1F2937]">
              Relation / Care Title
            </label>
            <input
              id="mp-rel"
              type="text"
              maxLength={80}
              value={editRelation}
              onChange={(e) => setEditRelation(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#D1D5DB] px-3 py-2 text-sm focus:border-[#065F46] focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {PERMISSION_DEFINITIONS.map((perm) => (
              <label
                key={perm.key}
                className="flex items-start gap-2.5 rounded-lg border border-[#E5E7EB] p-2.5 text-xs hover:bg-[#F9FAFB]"
              >
                <input
                  type="checkbox"
                  checked={editPerms[perm.key]}
                  onChange={() =>
                    setEditPerms((prev) => ({ ...prev, [perm.key]: !prev[perm.key] }))
                  }
                  className="mt-0.5 h-4 w-4 rounded border-[#D1D5DB] text-[#065F46] focus:ring-[#065F46]"
                />
                <div>
                  <p className="font-semibold text-[#1F2937]">{perm.label}</p>
                  <p className="text-[11px] text-[#6B7280]">{perm.description}</p>
                </div>
              </label>
            ))}
          </div>

          <div className="flex justify-end gap-3 border-t border-[#E5E7EB] pt-4">
            <button
              type="button"
              onClick={() => setPermTarget(null)}
              className="rounded-lg border border-[#D1D5DB] bg-white px-4 py-2 text-sm font-medium text-[#374151]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={savingPerms}
              className="rounded-lg bg-[#065F46] px-5 py-2 text-sm font-semibold text-white hover:bg-[#047857] disabled:opacity-60"
            >
              {savingPerms ? 'Saving...' : 'Save Permissions'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit Circle Modal */}
      <Modal
        open={editCircleOpen}
        onClose={() => setEditCircleOpen(false)}
        title="Edit Patient & Care Circle Details"
      >
        <form onSubmit={handleSaveCircle} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="ec-name" className="block text-sm font-medium text-[#1F2937]">
                Care Circle Name *
              </label>
              <input
                id="ec-name"
                type="text"
                required
                maxLength={120}
                value={cName}
                onChange={(e) => setCName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#D1D5DB] px-3 py-2 text-sm focus:border-[#065F46] focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="ec-patient" className="block text-sm font-medium text-[#1F2937]">
                Patient Full Name *
              </label>
              <input
                id="ec-patient"
                type="text"
                required
                maxLength={120}
                value={cPatient}
                onChange={(e) => setCPatient(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#D1D5DB] px-3 py-2 text-sm focus:border-[#065F46] focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="ec-age" className="block text-sm font-medium text-[#1F2937]">
                Age *
              </label>
              <input
                id="ec-age"
                type="number"
                min={0}
                max={130}
                required
                value={cAge}
                onChange={(e) => setCAge(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#D1D5DB] px-3 py-2 font-mono text-sm focus:border-[#065F46] focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="ec-blood" className="block text-sm font-medium text-[#1F2937]">
                Blood Type
              </label>
              <input
                id="ec-blood"
                type="text"
                maxLength={16}
                value={cBlood}
                onChange={(e) => setCBlood(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#D1D5DB] px-3 py-2 text-sm focus:border-[#065F46] focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label htmlFor="ec-doc" className="block text-sm font-medium text-[#1F2937]">
              Primary Physician
            </label>
            <input
              id="ec-doc"
              type="text"
              maxLength={120}
              value={cDoc}
              onChange={(e) => setCDoc(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#D1D5DB] px-3 py-2 text-sm focus:border-[#065F46] focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="ec-all" className="block text-sm font-medium text-[#1F2937]">
              Known Allergies
            </label>
            <input
              id="ec-all"
              type="text"
              maxLength={500}
              value={cAllergies}
              onChange={(e) => setCAllergies(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#D1D5DB] px-3 py-2 text-sm focus:border-[#065F46] focus:outline-none"
            />
          </div>

          <div className="flex justify-end gap-3 border-t border-[#E5E7EB] pt-4">
            <button
              type="button"
              onClick={() => setEditCircleOpen(false)}
              className="rounded-lg border border-[#D1D5DB] bg-white px-4 py-2 text-sm font-medium text-[#374151] hover:bg-[#F3F4F6]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={savingCircle}
              className="rounded-lg bg-[#065F46] px-5 py-2 text-sm font-semibold text-white hover:bg-[#047857] disabled:opacity-60"
            >
              {savingCircle ? 'Saving...' : 'Save Details'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Create New Circle Modal (Elderly only) */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create New Care Circle">
        <form onSubmit={handleCreateNewCircle} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="nc-name" className="block text-sm font-medium text-[#1F2937]">
                Care Circle Name *
              </label>
              <input
                id="nc-name"
                type="text"
                required
                maxLength={120}
                value={newCircleName}
                onChange={(e) => setNewCircleName(e.target.value)}
                placeholder="e.g. Personal Recovery Plan"
                className="mt-1 w-full rounded-lg border border-[#D1D5DB] px-3 py-2 text-sm focus:border-[#065F46] focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="nc-patient" className="block text-sm font-medium text-[#1F2937]">
                Patient Name *
              </label>
              <input
                id="nc-patient"
                type="text"
                required
                maxLength={120}
                value={newPatientName}
                onChange={(e) => setNewPatientName(e.target.value)}
                placeholder="e.g. Eleanor Bennett"
                className="mt-1 w-full rounded-lg border border-[#D1D5DB] px-3 py-2 text-sm focus:border-[#065F46] focus:outline-none"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="nc-age" className="block text-sm font-medium text-[#1F2937]">
                Age *
              </label>
              <input
                id="nc-age"
                type="number"
                min={1}
                max={125}
                required
                value={newPatientAge}
                onChange={(e) => setNewPatientAge(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#D1D5DB] px-3 py-2 font-mono text-sm focus:border-[#065F46] focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="nc-doc" className="block text-sm font-medium text-[#1F2937]">
                Primary Physician
              </label>
              <input
                id="nc-doc"
                type="text"
                maxLength={120}
                value={newPrimaryDoc}
                onChange={(e) => setNewPrimaryDoc(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#D1D5DB] px-3 py-2 text-sm focus:border-[#065F46] focus:outline-none"
              />
            </div>
          </div>
          <div>
            <label htmlFor="nc-all" className="block text-sm font-medium text-[#1F2937]">
              Known Allergies
            </label>
            <input
              id="nc-all"
              type="text"
              maxLength={500}
              value={newAllergies}
              onChange={(e) => setNewAllergies(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#D1D5DB] px-3 py-2 text-sm focus:border-[#065F46] focus:outline-none"
            />
          </div>
          <div className="flex justify-end gap-3 border-t border-[#E5E7EB] pt-4">
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              className="rounded-lg border border-[#D1D5DB] bg-white px-4 py-2 text-sm font-medium text-[#374151]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creating}
              className="rounded-lg bg-[#065F46] px-5 py-2 text-sm font-semibold text-white hover:bg-[#047857] disabled:opacity-60"
            >
              {creating ? 'Creating...' : 'Create Care Circle'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
