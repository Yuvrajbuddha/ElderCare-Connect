import React, { useEffect, useState } from 'react';
import {
  Check,
  KeyRound,
  LogOut,
  Phone,
  ShieldCheck,
  User,
  Users,
  Volume2,
} from 'lucide-react';
import { useCare } from '../context/CareContext';
import { parseReadableError } from '../lib/utils';
import { updateCareCircleDetails, updateUserProfile } from '../services/careService';
import type { AppSection } from '../types/healthcare';
import { Modal } from './ui/Modal';

interface SettingsViewProps {
  onNavigateSection: (section: AppSection) => void;
  onNavigatePath?: (path: string) => void;
}

export function SettingsView({ onNavigateSection, onNavigatePath }: SettingsViewProps) {
  const {
    profile,
    firebaseUser,
    activeCircle,
    currentMember,
    can,
    logout,
    pushToast,
  } = useCare();

  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [emergencyContact, setEmergencyContact] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  const [voiceEnabled, setVoiceEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem('careconnect_voice_enabled') !== 'false';
    } catch {
      return true;
    }
  });

  // Edit Health Details modal (Elderly owner only)
  const [healthModalOpen, setHealthModalOpen] = useState(false);
  const [patientName, setPatientName] = useState('');
  const [patientAge, setPatientAge] = useState('72');
  const [bloodType, setBloodType] = useState('');
  const [allergies, setAllergies] = useState('');
  const [primaryPhysician, setPrimaryPhysician] = useState('');
  const [savingHealth, setSavingHealth] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.displayName || '');
    setPhone(profile.phone || '');
    setEmergencyContact(profile.emergencyContact || activeCircle?.emergencyContact || '');
  }, [profile, activeCircle]);

  if (!profile || !firebaseUser || !activeCircle) return null;

  const isElderly = profile.accountType === 'elderly';
  const isOwner = activeCircle.ownerId === firebaseUser.uid;

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) {
      pushToast('error', 'Please enter your name.');
      return;
    }
    setSavingProfile(true);
    try {
      await updateUserProfile(firebaseUser.uid, {
        displayName: displayName.trim(),
        phone: phone.trim(),
        emergencyContact: emergencyContact.trim(),
      });
      if (isOwner && emergencyContact.trim() !== (activeCircle.emergencyContact || '')) {
        await updateCareCircleDetails(activeCircle.id, {
          name: activeCircle.name,
          patientName: activeCircle.patientName,
          patientAge: activeCircle.patientAge,
          bloodType: activeCircle.bloodType,
          allergies: activeCircle.allergies,
          primaryPhysician: activeCircle.primaryPhysician,
          emergencyContact: emergencyContact.trim(),
        });
      }
      pushToast('success', 'Your settings have been saved.');
    } catch (error) {
      pushToast('error', parseReadableError(error));
    } finally {
      setSavingProfile(false);
    }
  };

  const handleToggleVoice = () => {
    const next = !voiceEnabled;
    setVoiceEnabled(next);
    try {
      localStorage.setItem('careconnect_voice_enabled', String(next));
    } catch {
      // Ignore storage errors
    }
    pushToast('info', next ? 'Voice reading turned on.' : 'Voice reading turned off.');
  };

  const openHealthModal = () => {
    setPatientName(activeCircle.patientName);
    setPatientAge(String(activeCircle.patientAge));
    setBloodType(activeCircle.bloodType || '');
    setAllergies(activeCircle.allergies || '');
    setPrimaryPhysician(activeCircle.primaryPhysician || '');
    setHealthModalOpen(true);
  };

  const handleSaveHealth = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingHealth(true);
    try {
      await updateCareCircleDetails(activeCircle.id, {
        name: activeCircle.name,
        patientName: patientName.trim() || activeCircle.patientName,
        patientAge: Number(patientAge) || activeCircle.patientAge,
        bloodType: bloodType.trim(),
        allergies: allergies.trim(),
        primaryPhysician: primaryPhysician.trim(),
        emergencyContact: emergencyContact.trim() || activeCircle.emergencyContact,
      });
      pushToast('success', 'Health profile updated.');
      setHealthModalOpen(false);
    } catch (error) {
      pushToast('error', parseReadableError(error));
    } finally {
      setSavingHealth(false);
    }
  };

  const grantedList = [
    can('viewHealthInfo') && 'View health info & records',
    can('viewMedications') && 'View medicine schedule',
    can('addMedications') && 'Add medicines & mark doses',
    can('editMedications') && 'Edit medicine details',
    can('manageAppointments') && 'Manage appointments',
    can('viewAdherenceReports') && 'View medicine reports',
  ].filter(Boolean) as string[];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className={`font-display font-bold text-[#1F2937] ${isElderly ? 'text-3xl' : 'text-2xl'}`}>
          Settings
        </h1>
        <p className={`mt-1 text-[#6B7280] ${isElderly ? 'text-base' : 'text-sm'}`}>
          Update your contact details, emergency contact, and account preferences.
        </p>
      </div>

      {/* 1. My Details */}
      <section className="rounded-2xl border border-[#E5E7EB] bg-white p-6">
        <div className="flex items-center gap-3 border-b border-[#E5E7EB] pb-4">
          <User className="h-5 w-5 text-[#065F46]" />
          <div>
            <h2 className={`font-display font-semibold text-[#1F2937] ${isElderly ? 'text-xl' : 'text-base'}`}>
              My Details
            </h2>
            <p className="text-xs text-[#6B7280]">{profile.email}</p>
          </div>
        </div>

        <form onSubmit={handleSaveProfile} className="mt-5 space-y-4">
          <div>
            <label
              htmlFor="settings-name"
              className={`block font-semibold text-[#1F2937] ${isElderly ? 'text-base' : 'text-sm'}`}
            >
              Full Name
            </label>
            <input
              id="settings-name"
              type="text"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className={`mt-1.5 w-full rounded-xl border border-[#D1D5DB] px-4 py-2.5 text-[#1F2937] focus:border-[#065F46] focus:outline-none ${
                isElderly ? 'min-h-[48px] text-base' : 'text-sm'
              }`}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="settings-phone"
                className={`block font-semibold text-[#1F2937] ${isElderly ? 'text-base' : 'text-sm'}`}
              >
                Phone Number
              </label>
              <input
                id="settings-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. (555) 234-5678"
                className={`mt-1.5 w-full rounded-xl border border-[#D1D5DB] px-4 py-2.5 text-[#1F2937] focus:border-[#065F46] focus:outline-none ${
                  isElderly ? 'min-h-[48px] text-base' : 'text-sm'
                }`}
              />
            </div>

            <div>
              <label
                htmlFor="settings-emergency"
                className={`block font-semibold text-[#1F2937] ${isElderly ? 'text-base' : 'text-sm'}`}
              >
                Emergency Contact
              </label>
              <input
                id="settings-emergency"
                type="text"
                value={emergencyContact}
                onChange={(e) => setEmergencyContact(e.target.value)}
                placeholder="Name & phone number"
                className={`mt-1.5 w-full rounded-xl border border-[#D1D5DB] px-4 py-2.5 text-[#1F2937] focus:border-[#065F46] focus:outline-none ${
                  isElderly ? 'min-h-[48px] text-base' : 'text-sm'
                }`}
              />
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={savingProfile}
              className={`inline-flex items-center justify-center gap-2 rounded-xl bg-[#065F46] px-6 font-semibold text-white hover:bg-[#047857] disabled:opacity-60 ${
                isElderly ? 'min-h-[50px] text-base' : 'min-h-[44px] text-sm'
              }`}
            >
              <Check className="h-4 w-4" />
              <span>{savingProfile ? 'Saving...' : 'Save Changes'}</span>
            </button>
          </div>
        </form>
      </section>

      {/* 2. Role-specific Settings */}
      {isElderly ? (
        <>
          <section className="rounded-2xl border border-[#E5E7EB] bg-white p-6">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div className="flex items-start gap-3">
                <Volume2 className="mt-1 h-5 w-5 shrink-0 text-[#065F46]" />
                <div>
                  <h2 className="font-display text-xl font-semibold text-[#1F2937]">
                    Voice Read-Aloud
                  </h2>
                  <p className="mt-0.5 text-base text-[#6B7280]">
                    Hear your daily greeting and next medicine read out loud.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleToggleVoice}
                className={`min-h-[48px] shrink-0 rounded-xl px-5 font-semibold ${
                  voiceEnabled
                    ? 'bg-[#065F46] text-white hover:bg-[#047857]'
                    : 'border border-[#D1D5DB] bg-[#F9FAFB] text-[#374151] hover:bg-[#F3F4F6]'
                }`}
              >
                {voiceEnabled ? 'Voice On' : 'Voice Off'}
              </button>
            </div>
          </section>

          <section className="rounded-2xl border border-[#E5E7EB] bg-white p-6 space-y-4">
            <div className="flex flex-col justify-between gap-3 border-b border-[#E5E7EB] pb-4 sm:flex-row sm:items-center">
              <div>
                <h2 className="font-display text-xl font-semibold text-[#1F2937]">
                  My Health Profile
                </h2>
                <p className="text-sm text-[#6B7280]">
                  Basic details shared with your approved family and caretakers.
                </p>
              </div>
              {isOwner && (
                <button
                  type="button"
                  onClick={openHealthModal}
                  className="min-h-[44px] rounded-xl border border-[#065F46] bg-[#ECFDF5] px-4 text-sm font-semibold text-[#065F46] hover:bg-[#D1FAE5]"
                >
                  Edit Health Details
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3 text-base sm:grid-cols-2">
              <div>
                <p className="text-sm text-[#6B7280]">Age</p>
                <p className="font-semibold text-[#1F2937]">{activeCircle.patientAge} years</p>
              </div>
              <div>
                <p className="text-sm text-[#6B7280]">Blood Type</p>
                <p className="font-semibold text-[#1F2937]">{activeCircle.bloodType || 'Not listed'}</p>
              </div>
              <div>
                <p className="text-sm text-[#6B7280]">Primary Doctor</p>
                <p className="font-semibold text-[#1F2937]">
                  {activeCircle.primaryPhysician || 'Not listed'}
                </p>
              </div>
              <div>
                <p className="text-sm text-[#6B7280]">Allergies</p>
                <p className="font-semibold text-[#1F2937]">{activeCircle.allergies || 'None listed'}</p>
              </div>
            </div>

            <div className="border-t border-[#E5E7EB] pt-4">
              <button
                type="button"
                onClick={() => onNavigateSection('circle')}
                className="inline-flex min-h-[46px] items-center gap-2 rounded-xl border border-[#D1D5DB] bg-white px-5 text-base font-semibold text-[#065F46] hover:bg-[#ECFDF5]"
              >
                <Users className="h-5 w-5" />
                <span>Manage Family &amp; Caretaker Access</span>
              </button>
            </div>
          </section>
        </>
      ) : (
        <section className="rounded-2xl border border-[#E5E7EB] bg-white p-6 space-y-4">
          <div className="flex items-center gap-3 border-b border-[#E5E7EB] pb-4">
            <ShieldCheck className="h-5 w-5 text-[#065F46]" />
            <div>
              <h2 className="font-display text-base font-semibold text-[#1F2937]">
                Care Access &amp; Permissions
              </h2>
              <p className="text-xs text-[#6B7280]">
                Caring for <span className="font-semibold text-[#1F2937]">{activeCircle.patientName}</span> ·{' '}
                {currentMember?.relation || profile.accountType}
              </p>
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-[#1F2937]">What you can access:</p>
            {grantedList.length === 0 ? (
              <p className="mt-1 text-sm text-[#6B7280]">Basic daily care notes and messaging only.</p>
            ) : (
              <ul className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {grantedList.map((item) => (
                  <li key={item} className="flex items-center gap-2 text-sm text-[#374151]">
                    <Check className="h-4 w-4 shrink-0 text-[#065F46]" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {activeCircle.emergencyContact && (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-4 py-3">
              <div className="flex items-center gap-2.5 text-sm">
                <Phone className="h-4 w-4 text-[#065F46]" />
                <span className="text-[#4B5563]">Patient Emergency Contact:</span>
                <span className="font-semibold text-[#1F2937]">{activeCircle.emergencyContact}</span>
              </div>
            </div>
          )}

          {onNavigatePath && (
            <div className="border-t border-[#E5E7EB] pt-4">
              <button
                type="button"
                onClick={() => onNavigatePath('/accept-invite')}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-[#065F46] bg-[#ECFDF5] px-4 text-sm font-semibold text-[#065F46] hover:bg-[#D1FAE5]"
              >
                <KeyRound className="h-4 w-4" />
                <span>Join Another Care Circle</span>
              </button>
            </div>
          )}
        </section>
      )}

      {/* 3. Sign Out */}
      <section className="rounded-2xl border border-[#E5E7EB] bg-white p-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h2 className={`font-display font-semibold text-[#1F2937] ${isElderly ? 'text-xl' : 'text-base'}`}>
              Account Sign Out
            </h2>
            <p className="text-sm text-[#6B7280]">Safely sign out of CareConnect AI on this device.</p>
          </div>
          <button
            type="button"
            onClick={logout}
            className={`inline-flex items-center justify-center gap-2 rounded-xl border border-[#D1D5DB] bg-white px-5 font-semibold text-[#374151] hover:bg-[#F3F4F6] ${
              isElderly ? 'min-h-[48px] text-base' : 'min-h-[44px] text-sm'
            }`}
          >
            <LogOut className="h-4 w-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </section>

      {/* Edit Health Details Modal */}
      <Modal
        open={healthModalOpen}
        onClose={() => setHealthModalOpen(false)}
        title="Edit My Health Details"
        subtitle="Only you can edit these personal details."
      >
        <form onSubmit={handleSaveHealth} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="sh-name" className="block text-sm font-semibold text-[#1F2937]">
                Name
              </label>
              <input
                id="sh-name"
                type="text"
                required
                value={patientName}
                onChange={(e) => setPatientName(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[#D1D5DB] px-3.5 py-2.5 text-base focus:border-[#065F46] focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="sh-age" className="block text-sm font-semibold text-[#1F2937]">
                Age
              </label>
              <input
                id="sh-age"
                type="number"
                min={1}
                max={125}
                required
                value={patientAge}
                onChange={(e) => setPatientAge(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[#D1D5DB] px-3.5 py-2.5 text-base focus:border-[#065F46] focus:outline-none"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="sh-blood" className="block text-sm font-semibold text-[#1F2937]">
                Blood Type
              </label>
              <input
                id="sh-blood"
                type="text"
                value={bloodType}
                onChange={(e) => setBloodType(e.target.value)}
                placeholder="e.g. O+"
                className="mt-1 w-full rounded-xl border border-[#D1D5DB] px-3.5 py-2.5 text-base focus:border-[#065F46] focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="sh-doc" className="block text-sm font-semibold text-[#1F2937]">
                Primary Doctor
              </label>
              <input
                id="sh-doc"
                type="text"
                value={primaryPhysician}
                onChange={(e) => setPrimaryPhysician(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[#D1D5DB] px-3.5 py-2.5 text-base focus:border-[#065F46] focus:outline-none"
              />
            </div>
          </div>
          <div>
            <label htmlFor="sh-all" className="block text-sm font-semibold text-[#1F2937]">
              Allergies
            </label>
            <input
              id="sh-all"
              type="text"
              value={allergies}
              onChange={(e) => setAllergies(e.target.value)}
              placeholder="e.g. Penicillin, Peanuts"
              className="mt-1 w-full rounded-xl border border-[#D1D5DB] px-3.5 py-2.5 text-base focus:border-[#065F46] focus:outline-none"
            />
          </div>
          <div className="flex justify-end gap-3 border-t border-[#E5E7EB] pt-4">
            <button
              type="button"
              onClick={() => setHealthModalOpen(false)}
              className="min-h-[44px] rounded-xl border border-[#D1D5DB] px-4 text-sm font-medium text-[#374151]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={savingHealth}
              className="min-h-[44px] rounded-xl bg-[#065F46] px-5 text-sm font-semibold text-white hover:bg-[#047857] disabled:opacity-60"
            >
              {savingHealth ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
