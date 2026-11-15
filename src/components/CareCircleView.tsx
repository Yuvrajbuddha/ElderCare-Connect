import React, { useMemo, useState } from 'react';
import {
  Activity,
  Check,
  Clock,
  Copy,
  Link2,
  ShieldCheck,
  SlidersHorizontal,
  Stethoscope,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import { useCare } from '../context/CareContext';
import { formatTimestampRelative, parseReadableError } from '../lib/utils';
import {
  DEFAULT_SIMPLE_PERMISSIONS_BY_ROLE,
  SIMPLE_PERMISSION_DEFINITIONS,
  type SimplePermissionKey,
  type SimplePermissions,
  createSecureInvitation,
  formatMemberRoleLabel,
  fromSimplePermissions,
  removeCircleMember,
  revokeInvitation,
  summarizeSimplePermissions,
  toSimplePermissions,
  updateMemberPermissions,
} from '../services/careService';
import type { CircleInvite, CircleMember } from '../types/healthcare';
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
    activityLogs,
    isCircleOwner,
    ownerInvitations,
    refreshOwnerInvitations,
    refreshCircleMembers,
    pushToast,
  } = useCare();

  // Invite Modal state
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invEmail, setInvEmail] = useState('');
  const [invRole, setInvRole] = useState<'family' | 'caretaker'>('family');
  const [invRelation, setInvRelation] = useState('');
  const [invSimplePerms, setInvSimplePerms] = useState<SimplePermissions>(
    DEFAULT_SIMPLE_PERMISSIONS_BY_ROLE.family,
  );
  const [issuingInvite, setIssuingInvite] = useState(false);
  const [issuedCredentials, setIssuedCredentials] = useState<{
    inviteCode: string;
    passcode: string;
    invitedEmail: string;
    invitedRole: 'family' | 'caretaker';
  } | null>(null);
  const [copiedType, setCopiedType] = useState<'link' | 'details' | null>(null);

  // Manage Permissions Modal
  const [permTarget, setPermTarget] = useState<CircleMember | null>(null);
  const [editSimplePerms, setEditSimplePerms] = useState<SimplePermissions>(
    DEFAULT_SIMPLE_PERMISSIONS_BY_ROLE.family,
  );
  const [editRelation, setEditRelation] = useState('');
  const [savingPerms, setSavingPerms] = useState(false);

  // Revoke Confirmation Modal
  const [revokeTarget, setRevokeTarget] = useState<CircleMember | null>(null);
  const [revokingMember, setRevokingMember] = useState(false);

  const familyMembers = useMemo(
    () => members.filter((m) => m.memberRole === 'family'),
    [members],
  );
  const caretakerMembers = useMemo(
    () => members.filter((m) => m.memberRole === 'caretaker'),
    [members],
  );

  if (!firebaseUser || !profile || !activeCircle) return null;

  const isElderly = profile.accountType === 'elderly';
  const pendingInvites = ownerInvitations.filter((inv) => inv.status === 'pending');

  const openInviteModal = (role: 'family' | 'caretaker') => {
    setInvRole(role);
    setInvEmail('');
    setInvRelation('');
    setInvSimplePerms({ ...DEFAULT_SIMPLE_PERMISSIONS_BY_ROLE[role] });
    setInviteOpen(true);
  };

  const toggleInvitePerm = (key: SimplePermissionKey) => {
    setInvSimplePerms((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleIssueInvitation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invEmail.trim()) {
      pushToast('error', 'Please enter their email address.');
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
        permissions: fromSimplePermissions(invSimplePerms),
        expiresInHours: 72,
      });
      setIssuedCredentials({
        inviteCode: issued.inviteCode,
        passcode: issued.passcode,
        invitedEmail: invEmail.trim().toLowerCase(),
        invitedRole: invRole,
      });
      setCopiedType(null);
      setInviteOpen(false);
      await refreshOwnerInvitations();
      pushToast('success', 'Secure invitation created.');
    } catch (error) {
      pushToast('error', parseReadableError(error));
    } finally {
      setIssuingInvite(false);
    }
  };

  const buildInviteLink = (inviteCode: string, passcode: string) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return `${origin}/accept-invite?code=${encodeURIComponent(inviteCode)}&p=${encodeURIComponent(passcode)}`;
  };

  const handleCopyInviteLink = async () => {
    if (!issuedCredentials) return;
    const link = buildInviteLink(issuedCredentials.inviteCode, issuedCredentials.passcode);
    try {
      await navigator.clipboard.writeText(link);
      setCopiedType('link');
      pushToast('success', 'Secure invitation link copied.');
      setTimeout(() => setCopiedType(null), 2500);
    } catch {
      pushToast('info', link);
    }
  };

  const handleCopyCredentials = async () => {
    if (!issuedCredentials) return;
    const link = buildInviteLink(issuedCredentials.inviteCode, issuedCredentials.passcode);
    const text = [
      `CareConnect AI Invitation for ${activeCircle.patientName}`,
      `Email: ${issuedCredentials.invitedEmail}`,
      `Invitation Code: ${issuedCredentials.inviteCode}`,
      `Passcode: ${issuedCredentials.passcode}`,
      `Secure Link: ${link}`,
    ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopiedType('details');
      pushToast('success', 'Invitation code and link copied.');
      setTimeout(() => setCopiedType(null), 2500);
    } catch {
      pushToast('info', `Code: ${issuedCredentials.inviteCode} · Passcode: ${issuedCredentials.passcode}`);
    }
  };

  const handleRevokeInvitation = async (inv: CircleInvite) => {
    try {
      await revokeInvitation(inv.inviteCode);
      await refreshOwnerInvitations();
      pushToast('info', 'Invitation cancelled.');
    } catch (error) {
      pushToast('error', parseReadableError(error));
    }
  };

  const openPermissionsEditor = (member: CircleMember) => {
    setPermTarget(member);
    setEditSimplePerms(toSimplePermissions(member.permissions));
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
        permissions: fromSimplePermissions(editSimplePerms),
        relation: editRelation,
      });
      await refreshCircleMembers();
      pushToast('success', `Updated permissions for ${permTarget.displayName}.`);
      setPermTarget(null);
    } catch (error) {
      pushToast('error', parseReadableError(error));
    } finally {
      setSavingPerms(false);
    }
  };

  const handleConfirmRevokeMember = async () => {
    if (!revokeTarget) return;
    setRevokingMember(true);
    const updatedMemberIds = activeCircle.memberIds.filter((id) => id !== revokeTarget.uid);
    try {
      await removeCircleMember({
        circleId: activeCircle.id,
        targetUid: revokeTarget.uid,
        updatedMemberIds,
      });
      await refreshCircleMembers();
      pushToast('info', `Access revoked for ${revokeTarget.displayName}.`);
      setRevokeTarget(null);
      setPermTarget(null);
    } catch (error) {
      pushToast('error', parseReadableError(error));
    } finally {
      setRevokingMember(false);
    }
  };

  const renderMemberRow = (member: CircleMember, emptyRoleText: string) => {
    const grantedLabels = summarizeSimplePermissions(member.permissions);
    return (
      <div
        key={member.uid}
        className="flex flex-col justify-between gap-4 px-6 py-4 sm:flex-row sm:items-center"
      >
        <div className="min-w-0 space-y-1">
          <p className={`font-bold text-[#1F2937] ${isElderly ? 'text-lg' : 'text-base'}`}>
            {member.displayName}{' '}
            <span className="text-sm font-normal text-[#6B7280]">
              ({member.relation || emptyRoleText})
            </span>
          </p>
          <p className="text-sm text-[#6B7280]">{member.email}</p>
          <p className="text-sm font-medium text-[#065F46]">
            {grantedLabels.length > 0 ? grantedLabels.join(' · ') : 'No permissions granted'}
          </p>
        </div>

        {isCircleOwner && (
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => openPermissionsEditor(member)}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-[#D1D5DB] bg-white px-4 text-sm font-semibold text-[#1F2937] hover:bg-[#F3F4F6]"
            >
              <SlidersHorizontal className="h-4 w-4 text-[#065F46]" />
              <span>Permissions</span>
            </button>
            <button
              type="button"
              onClick={() => setRevokeTarget(member)}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-red-200 bg-white px-4 text-sm font-semibold text-[#B91C1C] hover:bg-red-50"
            >
              <Trash2 className="h-4 w-4" />
              <span>Revoke Access</span>
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header & Invite Actions */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className={`font-display font-bold text-[#1F2937] ${isElderly ? 'text-3xl' : 'text-2xl'}`}>
            Family &amp; Caretakers
          </h1>
          <p className={`mt-1 text-[#4B5563] ${isElderly ? 'text-base' : 'text-sm'}`}>
            See who is connected to {activeCircle.patientName}&apos;s healthcare profile and control their permissions.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          {isCircleOwner && (
            <>
              <button
                type="button"
                onClick={() => openInviteModal('family')}
                className="inline-flex min-h-[48px] items-center gap-2 rounded-xl bg-[#065F46] px-5 text-sm font-bold text-white hover:bg-[#047857]"
              >
                <UserPlus className="h-4 w-4" />
                <span>Invite Family Member</span>
              </button>
              <button
                type="button"
                onClick={() => openInviteModal('caretaker')}
                className="inline-flex min-h-[48px] items-center gap-2 rounded-xl border border-[#065F46] bg-[#ECFDF5] px-5 text-sm font-bold text-[#065F46] hover:bg-[#D1FAE5]"
              >
                <Stethoscope className="h-4 w-4" />
                <span>Invite Caretaker</span>
              </button>
            </>
          )}
          {onNavigate && !isElderly && (
            <button
              type="button"
              onClick={() => onNavigate('/accept-invite')}
              className="inline-flex min-h-[46px] items-center gap-2 rounded-xl border border-[#D1D5DB] bg-white px-4 text-sm font-semibold text-[#1F2937] hover:bg-[#F3F4F6]"
            >
              <UserPlus className="h-4 w-4" />
              <span>Join with Invite Code</span>
            </button>
          )}
        </div>
      </div>

      {/* 1. Connected Family Members */}
      <section className="rounded-2xl border border-[#E5E7EB] bg-white">
        <div className="flex items-center justify-between gap-2 border-b border-[#E5E7EB] px-6 py-4">
          <div className="flex items-center gap-2.5">
            <Users className="h-5 w-5 text-[#065F46]" />
            <h2 className={`font-display font-bold text-[#1F2937] ${isElderly ? 'text-xl' : 'text-base'}`}>
              Connected Family Members ({familyMembers.length})
            </h2>
          </div>
        </div>

        {familyMembers.length === 0 ? (
          <div className="px-6 py-8 text-center">
            <p className={`text-[#6B7280] ${isElderly ? 'text-base' : 'text-sm'}`}>
              No family members connected yet.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#E5E7EB]">
            {familyMembers.map((member) => renderMemberRow(member, 'Family Member'))}
          </div>
        )}
      </section>

      {/* 2. Connected Caretakers */}
      <section className="rounded-2xl border border-[#E5E7EB] bg-white">
        <div className="flex items-center justify-between gap-2 border-b border-[#E5E7EB] px-6 py-4">
          <div className="flex items-center gap-2.5">
            <Stethoscope className="h-5 w-5 text-[#065F46]" />
            <h2 className={`font-display font-bold text-[#1F2937] ${isElderly ? 'text-xl' : 'text-base'}`}>
              Connected Caretakers ({caretakerMembers.length})
            </h2>
          </div>
        </div>

        {caretakerMembers.length === 0 ? (
          <div className="px-6 py-8 text-center">
            <p className={`text-[#6B7280] ${isElderly ? 'text-base' : 'text-sm'}`}>
              No caretakers connected yet.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#E5E7EB]">
            {caretakerMembers.map((member) => renderMemberRow(member, 'Caretaker'))}
          </div>
        )}
      </section>

      {/* 3. Pending Invitations (Owner Only) */}
      {isCircleOwner && pendingInvites.length > 0 && (
        <section className="rounded-2xl border border-[#E5E7EB] bg-white">
          <div className="flex items-center gap-2.5 border-b border-[#E5E7EB] px-6 py-4">
            <Clock className="h-5 w-5 text-[#065F46]" />
            <h2 className={`font-display font-bold text-[#1F2937] ${isElderly ? 'text-xl' : 'text-base'}`}>
              Pending Invitations ({pendingInvites.length})
            </h2>
          </div>

          <div className="divide-y divide-[#E5E7EB]">
            {pendingInvites.map((inv) => (
              <div
                key={inv.inviteCode}
                className="flex flex-col justify-between gap-3 px-6 py-4 sm:flex-row sm:items-center"
              >
                <div className="min-w-0">
                  <p className="text-base font-semibold text-[#1F2937]">
                    {inv.invitedEmail}{' '}
                    <span className="text-sm font-normal capitalize text-[#6B7280]">
                      ({inv.invitedRole === 'caretaker' ? 'Caretaker' : 'Family Member'})
                    </span>
                  </p>
                  <p className="mt-0.5 font-mono text-sm text-[#065F46]">
                    Invite Code: {inv.inviteCode}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleRevokeInvitation(inv)}
                  className="min-h-[44px] shrink-0 rounded-xl border border-red-200 px-4 text-sm font-semibold text-[#B91C1C] hover:bg-red-50"
                >
                  Revoke Invite
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 4. Recent Care Activities */}
      <section className="rounded-2xl border border-[#E5E7EB] bg-white">
        <div className="flex items-center gap-2.5 border-b border-[#E5E7EB] px-6 py-4">
          <Activity className="h-5 w-5 text-[#065F46]" />
          <div>
            <h2 className={`font-display font-bold text-[#1F2937] ${isElderly ? 'text-xl' : 'text-base'}`}>
              Recent Care Activities
            </h2>
            <p className="text-sm text-[#6B7280]">
              See who added or updated medicines, appointments, and care logs.
            </p>
          </div>
        </div>

        {activityLogs.length === 0 ? (
          <div className="px-6 py-8 text-center text-sm text-[#6B7280]">
            No care activities recorded yet.
          </div>
        ) : (
          <ul className="divide-y divide-[#E5E7EB]">
            {activityLogs.slice(0, 12).map((act) => (
              <li key={act.id} className="px-6 py-4">
                <p className={`font-semibold text-[#1F2937] ${isElderly ? 'text-base' : 'text-sm'}`}>
                  {act.action}
                </p>
                {act.detail && (
                  <p className="mt-0.5 text-sm text-[#4B5563]">{act.detail}</p>
                )}
                <p className="mt-1 text-sm text-[#6B7280]">
                  By <span className="font-semibold text-[#065F46]">{act.actorName}</span> (
                  {formatMemberRoleLabel(act.actorRole)}) · {formatTimestampRelative(act.timestamp)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Invite Family Member / Caretaker Modal */}
      <Modal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title={invRole === 'caretaker' ? 'Invite a Caretaker' : 'Invite a Family Member'}
        subtitle="Create a secure, email-verified invitation code and link."
      >
        <form onSubmit={handleIssueInvitation} className="space-y-4">
          <div>
            <label htmlFor="inv-email" className="block text-sm font-semibold text-[#1F2937]">
              Their Email Address *
            </label>
            <input
              id="inv-email"
              type="email"
              required
              value={invEmail}
              onChange={(e) => setInvEmail(e.target.value)}
              placeholder={invRole === 'caretaker' ? 'caretaker@example.com' : 'family@example.com'}
              className="mt-1 min-h-[46px] w-full rounded-xl border border-[#D1D5DB] px-3.5 py-2.5 text-base focus:border-[#065F46] focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="inv-rel" className="block text-sm font-semibold text-[#1F2937]">
              Relationship / Care Role
            </label>
            <input
              id="inv-rel"
              type="text"
              value={invRelation}
              onChange={(e) => setInvRelation(e.target.value)}
              placeholder={invRole === 'caretaker' ? 'e.g. Home Nurse' : 'e.g. Daughter'}
              className="mt-1 min-h-[46px] w-full rounded-xl border border-[#D1D5DB] px-3.5 py-2.5 text-base focus:border-[#065F46] focus:outline-none"
            />
          </div>

          <div>
            <p className="text-sm font-semibold text-[#1F2937]">Permissions</p>
            <div className="mt-2 space-y-2.5">
              {SIMPLE_PERMISSION_DEFINITIONS.map((perm) => (
                <label
                  key={perm.key}
                  className="flex cursor-pointer items-start gap-3 rounded-xl border border-[#E5E7EB] p-3.5 text-sm hover:bg-[#F9FAFB]"
                >
                  <input
                    type="checkbox"
                    checked={invSimplePerms[perm.key]}
                    onChange={() => toggleInvitePerm(perm.key)}
                    className="mt-0.5 h-5 w-5 rounded border-[#D1D5DB] text-[#065F46]"
                  />
                  <div>
                    <p className="text-base font-semibold text-[#1F2937]">{perm.label}</p>
                    <p className="text-sm text-[#6B7280]">{perm.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 border-t border-[#E5E7EB] pt-4">
            <button
              type="button"
              onClick={() => setInviteOpen(false)}
              className="min-h-[46px] rounded-xl border border-[#D1D5DB] px-5 text-sm font-semibold text-[#374151]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={issuingInvite}
              className="min-h-[46px] rounded-xl bg-[#065F46] px-6 text-sm font-bold text-white hover:bg-[#047857] disabled:opacity-60"
            >
              {issuingInvite ? 'Creating...' : 'Create Invitation'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Invitation Ready to Share Modal */}
      <Modal
        open={Boolean(issuedCredentials)}
        onClose={() => setIssuedCredentials(null)}
        title="Invitation Ready to Share"
        subtitle="Share this secure link or invitation code. Only the invited verified email can accept."
      >
        {issuedCredentials && (
          <div className="space-y-4">
            <div className="space-y-2.5 rounded-xl border border-[#065F46]/30 bg-[#ECFDF5] p-5">
              <p className="text-sm text-[#374151]">
                Invited {issuedCredentials.invitedRole === 'caretaker' ? 'Caretaker' : 'Family Member'}:{' '}
                <span className="font-semibold text-[#1F2937]">{issuedCredentials.invitedEmail}</span>
              </p>
              <p className="font-mono text-xl font-bold text-[#065F46]">
                Code: {issuedCredentials.inviteCode}
              </p>
              <p className="font-mono text-xl font-bold text-[#065F46]">
                Passcode: {issuedCredentials.passcode}
              </p>
              <p className="break-all rounded-lg border border-[#A7F3D0] bg-white px-3 py-2 font-mono text-xs text-[#374151]">
                {buildInviteLink(issuedCredentials.inviteCode, issuedCredentials.passcode)}
              </p>
            </div>

            <div className="flex flex-wrap justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setIssuedCredentials(null)}
                className="min-h-[44px] rounded-xl border border-[#D1D5DB] px-4 text-sm font-semibold text-[#374151]"
              >
                Done
              </button>
              <button
                type="button"
                onClick={handleCopyCredentials}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-[#065F46] bg-white px-4 text-sm font-semibold text-[#065F46] hover:bg-[#ECFDF5]"
              >
                {copiedType === 'details' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                <span>{copiedType === 'details' ? 'Copied' : 'Copy Code'}</span>
              </button>
              <button
                type="button"
                onClick={handleCopyInviteLink}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#065F46] px-5 text-sm font-bold text-white hover:bg-[#047857]"
              >
                {copiedType === 'link' ? <Check className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
                <span>{copiedType === 'link' ? 'Link Copied' : 'Copy Invite Link'}</span>
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Manage Simple Permissions Modal */}
      <Modal
        open={Boolean(permTarget)}
        onClose={() => setPermTarget(null)}
        title={`Permissions: ${permTarget?.displayName || ''}`}
        subtitle="Choose what this person can view and manage."
      >
        {permTarget && (
          <form onSubmit={handleSavePermissions} className="space-y-4">
            <div>
              <label htmlFor="ed-rel" className="block text-sm font-semibold text-[#1F2937]">
                Relationship / Role
              </label>
              <input
                id="ed-rel"
                type="text"
                value={editRelation}
                onChange={(e) => setEditRelation(e.target.value)}
                className="mt-1 min-h-[46px] w-full rounded-xl border border-[#D1D5DB] px-3.5 py-2.5 text-base focus:border-[#065F46] focus:outline-none"
              />
            </div>

            <div className="space-y-2.5">
              {SIMPLE_PERMISSION_DEFINITIONS.map((perm) => (
                <label
                  key={perm.key}
                  className="flex cursor-pointer items-start gap-3 rounded-xl border border-[#E5E7EB] p-3.5 text-sm hover:bg-[#F9FAFB]"
                >
                  <input
                    type="checkbox"
                    checked={editSimplePerms[perm.key]}
                    onChange={() =>
                      setEditSimplePerms((prev) => ({ ...prev, [perm.key]: !prev[perm.key] }))
                    }
                    className="mt-0.5 h-5 w-5 rounded border-[#D1D5DB] text-[#065F46]"
                  />
                  <div>
                    <p className="text-base font-semibold text-[#1F2937]">{perm.label}</p>
                    <p className="text-sm text-[#6B7280]">{perm.description}</p>
                  </div>
                </label>
              ))}
            </div>

            <div className="flex flex-wrap justify-between gap-3 border-t border-[#E5E7EB] pt-4">
              <button
                type="button"
                onClick={() => setRevokeTarget(permTarget)}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-red-200 px-4 text-sm font-semibold text-[#B91C1C] hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4" />
                <span>Revoke Access</span>
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPermTarget(null)}
                  className="min-h-[44px] rounded-xl border border-[#D1D5DB] px-4 text-sm font-semibold text-[#374151]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingPerms}
                  className="min-h-[44px] rounded-xl bg-[#065F46] px-5 text-sm font-bold text-white hover:bg-[#047857] disabled:opacity-60"
                >
                  {savingPerms ? 'Saving...' : 'Save Permissions'}
                </button>
              </div>
            </div>
          </form>
        )}
      </Modal>

      {/* Confirm Revoke Access Modal */}
      <Modal
        open={Boolean(revokeTarget)}
        onClose={() => setRevokeTarget(null)}
        title="Revoke Access?"
      >
        {revokeTarget && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-[#991B1B]">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
              <p>
                <span className="font-bold">{revokeTarget.displayName}</span> will immediately lose access to{' '}
                {activeCircle.patientName}&apos;s healthcare profile, medicines, and appointments.
              </p>
            </div>
            <div className="flex justify-end gap-3 border-t border-[#E5E7EB] pt-4">
              <button
                type="button"
                onClick={() => setRevokeTarget(null)}
                className="min-h-[44px] rounded-xl border border-[#D1D5DB] px-4 text-sm font-semibold text-[#374151]"
              >
                Keep Access
              </button>
              <button
                type="button"
                disabled={revokingMember}
                onClick={handleConfirmRevokeMember}
                className="min-h-[44px] rounded-xl bg-[#B91C1C] px-5 text-sm font-bold text-white hover:bg-[#991B1B] disabled:opacity-60"
              >
                {revokingMember ? 'Revoking...' : 'Yes, Revoke Access'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
