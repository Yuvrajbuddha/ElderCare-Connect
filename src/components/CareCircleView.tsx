import React, { useState } from 'react';
import {
  Check,
  Clock,
  Copy,
  KeyRound,
  MailPlus,
  SlidersHorizontal,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import { useCare } from '../context/CareContext';
import { parseReadableError } from '../lib/utils';
import {
  DEFAULT_PERMISSIONS_BY_ROLE,
  PERMISSION_DEFINITIONS,
  createSecureInvitation,
  removeCircleMember,
  revokeInvitation,
  updateMemberPermissions,
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
    isCircleOwner,
    ownerInvitations,
    refreshOwnerInvitations,
    pushToast,
  } = useCare();

  // Invite Modal
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

  // Manage Member Access Modal
  const [permTarget, setPermTarget] = useState<CircleMember | null>(null);
  const [editPerms, setEditPerms] = useState<MemberPermissions>(DEFAULT_PERMISSIONS_BY_ROLE.family);
  const [editRelation, setEditRelation] = useState('');
  const [savingPerms, setSavingPerms] = useState(false);

  if (!firebaseUser || !profile || !activeCircle) return null;

  const isElderly = profile.accountType === 'elderly';
  const pendingInvites = ownerInvitations.filter((inv) => inv.status === 'pending');

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
      pushToast('success', 'Invitation code created.');
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
      `CareConnect AI Invite for ${activeCircle.patientName}`,
      `Email: ${issuedCredentials.invitedEmail}`,
      `Invite Code: ${issuedCredentials.inviteCode}`,
      `Passcode: ${issuedCredentials.passcode}`,
      `Link: ${origin}/accept-invite?code=${issuedCredentials.inviteCode}`,
    ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopiedCreds(true);
      pushToast('success', 'Invite details copied.');
      setTimeout(() => setCopiedCreds(false), 2500);
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
    setEditPerms({ ...(member.permissions ?? DEFAULT_PERMISSIONS_BY_ROLE.family) });
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
      pushToast('success', `Updated access for ${permTarget.displayName}.`);
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
      setPermTarget(null);
      pushToast('info', `${targetName} has been removed.`);
    } catch (error) {
      pushToast('error', parseReadableError(error));
    }
  };

  const countPermissions = (perms?: MemberPermissions) => {
    if (!perms) return 0;
    return PERMISSION_DEFINITIONS.filter((p) => perms[p.key]).length;
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className={`font-display font-bold text-[#1F2937] ${isElderly ? 'text-3xl' : 'text-2xl'}`}>
            Family &amp; Care Team
          </h1>
          <p className={`mt-1 text-[#6B7280] ${isElderly ? 'text-base' : 'text-sm'}`}>
            Choose which family members and caretakers can see your health updates.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {isCircleOwner && (
            <button
              type="button"
              onClick={openInviteModal}
              className="inline-flex min-h-[48px] items-center gap-2 rounded-xl bg-[#065F46] px-5 text-sm font-bold text-white hover:bg-[#047857]"
            >
              <MailPlus className="h-4 w-4" />
              <span>Invite Someone</span>
            </button>
          )}
          {onNavigate && !isElderly && (
            <button
              type="button"
              onClick={() => onNavigate('/accept-invite')}
              className="inline-flex min-h-[46px] items-center gap-2 rounded-xl border border-[#D1D5DB] bg-white px-4 text-sm font-semibold text-[#1F2937] hover:bg-[#F3F4F6]"
            >
              <UserPlus className="h-4 w-4" />
              <span>Accept Invite Code</span>
            </button>
          )}
        </div>
      </div>

      {/* Connected Members */}
      <section className="rounded-2xl border border-[#E5E7EB] bg-white">
        <div className="flex items-center gap-2.5 border-b border-[#E5E7EB] px-6 py-4">
          <Users className="h-5 w-5 text-[#065F46]" />
          <h2 className={`font-display font-bold text-[#1F2937] ${isElderly ? 'text-xl' : 'text-base'}`}>
            Connected People ({members.length})
          </h2>
        </div>

        <div className="divide-y divide-[#E5E7EB]">
          {members.map((member) => {
            const isOwnerRow = member.uid === activeCircle.ownerId;
            return (
              <div
                key={member.uid}
                className="flex flex-col justify-between gap-3 px-6 py-4 sm:flex-row sm:items-center"
              >
                <div className="min-w-0">
                  <p className={`font-bold text-[#1F2937] ${isElderly ? 'text-lg' : 'text-base'}`}>
                    {member.displayName}{' '}
                    <span className="text-sm font-normal text-[#6B7280]">
                      ({isOwnerRow ? 'Profile Owner' : member.relation || member.memberRole})
                    </span>
                  </p>
                  <p className="mt-0.5 text-sm text-[#6B7280]">
                    {member.email}
                    {!isOwnerRow &&
                      ` · ${countPermissions(member.permissions)} of ${PERMISSION_DEFINITIONS.length} permissions`}
                  </p>
                </div>

                {isCircleOwner && !isOwnerRow && (
                  <button
                    type="button"
                    onClick={() => openPermissionsEditor(member)}
                    className="inline-flex min-h-[44px] shrink-0 items-center gap-2 rounded-xl border border-[#D1D5DB] bg-white px-4 text-sm font-semibold text-[#1F2937] hover:bg-[#F3F4F6]"
                  >
                    <SlidersHorizontal className="h-4 w-4 text-[#065F46]" />
                    <span>Manage Access</span>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Pending Invitations (Owner Only) */}
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
                      ({inv.invitedRole})
                    </span>
                  </p>
                  <p className="mt-0.5 font-mono text-sm text-[#065F46]">Code: {inv.inviteCode}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleRevokeInvitation(inv)}
                  className="min-h-[44px] shrink-0 rounded-xl border border-red-200 px-4 text-sm font-semibold text-[#B91C1C] hover:bg-red-50"
                >
                  Cancel Invite
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Create Invitation Modal */}
      <Modal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="Invite Family Member or Caretaker"
        subtitle="They will receive an invite code and passcode to join safely."
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
              placeholder="family@example.com"
              className="mt-1 w-full rounded-xl border border-[#D1D5DB] px-3.5 py-2.5 text-base"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="inv-role" className="block text-sm font-semibold text-[#1F2937]">
                Role
              </label>
              <select
                id="inv-role"
                value={invRole}
                onChange={(e) => handleInvRoleChange(e.target.value as 'family' | 'caretaker')}
                className="mt-1 w-full rounded-xl border border-[#D1D5DB] bg-white px-3.5 py-2.5 text-base"
              >
                <option value="family">Family Member</option>
                <option value="caretaker">Caretaker</option>
              </select>
            </div>
            <div>
              <label htmlFor="inv-rel" className="block text-sm font-semibold text-[#1F2937]">
                Relationship
              </label>
              <input
                id="inv-rel"
                type="text"
                value={invRelation}
                onChange={(e) => setInvRelation(e.target.value)}
                placeholder="e.g. Daughter or Nurse"
                className="mt-1 w-full rounded-xl border border-[#D1D5DB] px-3.5 py-2.5 text-base"
              />
            </div>
          </div>

          <div>
            <p className="text-sm font-semibold text-[#1F2937]">What they can see and do:</p>
            <div className="mt-2 space-y-2">
              {PERMISSION_DEFINITIONS.map((perm) => (
                <label
                  key={perm.key}
                  className="flex items-start gap-3 rounded-xl border border-[#E5E7EB] p-3 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={invPermissions[perm.key]}
                    onChange={() => toggleInvitePerm(perm.key)}
                    className="mt-0.5 h-4 w-4 rounded border-[#D1D5DB] text-[#065F46]"
                  />
                  <div>
                    <p className="font-semibold text-[#1F2937]">{perm.label}</p>
                    <p className="text-xs text-[#6B7280]">{perm.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 border-t border-[#E5E7EB] pt-4">
            <button
              type="button"
              onClick={() => setInviteOpen(false)}
              className="min-h-[44px] rounded-xl border border-[#D1D5DB] px-4 text-sm font-medium text-[#374151]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={issuingInvite}
              className="min-h-[44px] rounded-xl bg-[#065F46] px-5 text-sm font-bold text-white hover:bg-[#047857] disabled:opacity-60"
            >
              {issuingInvite ? 'Creating...' : 'Create Invite Code'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Generated Invite Credentials Modal */}
      <Modal
        open={Boolean(issuedCredentials)}
        onClose={() => setIssuedCredentials(null)}
        title="Invitation Ready to Share"
        subtitle="Share this code and passcode with your family member or caretaker."
      >
        {issuedCredentials && (
          <div className="space-y-4">
            <div className="rounded-xl border border-[#065F46]/30 bg-[#ECFDF5] p-5 space-y-2">
              <p className="text-sm text-[#374151]">
                For: <span className="font-semibold">{issuedCredentials.invitedEmail}</span>
              </p>
              <p className="font-mono text-xl font-bold text-[#065F46]">
                Code: {issuedCredentials.inviteCode}
              </p>
              <p className="font-mono text-xl font-bold text-[#065F46]">
                Passcode: {issuedCredentials.passcode}
              </p>
            </div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setIssuedCredentials(null)}
                className="min-h-[44px] rounded-xl border border-[#D1D5DB] px-4 text-sm font-medium text-[#374151]"
              >
                Done
              </button>
              <button
                type="button"
                onClick={handleCopyCredentials}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#065F46] px-5 text-sm font-bold text-white hover:bg-[#047857]"
              >
                {copiedCreds ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                <span>{copiedCreds ? 'Copied' : 'Copy Invite Details'}</span>
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Manage Access / Permissions Modal */}
      <Modal
        open={Boolean(permTarget)}
        onClose={() => setPermTarget(null)}
        title={`Manage Access: ${permTarget?.displayName || ''}`}
      >
        {permTarget && (
          <form onSubmit={handleSavePermissions} className="space-y-4">
            <div>
              <label htmlFor="ed-rel" className="block text-sm font-semibold text-[#1F2937]">
                Relationship
              </label>
              <input
                id="ed-rel"
                type="text"
                value={editRelation}
                onChange={(e) => setEditRelation(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[#D1D5DB] px-3.5 py-2.5 text-base"
              />
            </div>

            <div className="space-y-2">
              {PERMISSION_DEFINITIONS.map((perm) => (
                <label
                  key={perm.key}
                  className="flex items-start gap-3 rounded-xl border border-[#E5E7EB] p-3 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={editPerms[perm.key]}
                    onChange={() =>
                      setEditPerms((prev) => ({ ...prev, [perm.key]: !prev[perm.key] }))
                    }
                    className="mt-0.5 h-4 w-4 rounded border-[#D1D5DB] text-[#065F46]"
                  />
                  <div>
                    <p className="font-semibold text-[#1F2937]">{perm.label}</p>
                    <p className="text-xs text-[#6B7280]">{perm.description}</p>
                  </div>
                </label>
              ))}
            </div>

            <div className="flex flex-wrap justify-between gap-3 border-t border-[#E5E7EB] pt-4">
              <button
                type="button"
                onClick={() => handleRemoveMember(permTarget.uid, permTarget.displayName)}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-red-200 px-4 text-sm font-semibold text-[#B91C1C] hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4" />
                <span>Remove Access</span>
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPermTarget(null)}
                  className="min-h-[44px] rounded-xl border border-[#D1D5DB] px-4 text-sm font-medium text-[#374151]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingPerms}
                  className="min-h-[44px] rounded-xl bg-[#065F46] px-5 text-sm font-bold text-white hover:bg-[#047857] disabled:opacity-60"
                >
                  {savingPerms ? 'Saving...' : 'Save Access'}
                </button>
              </div>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
