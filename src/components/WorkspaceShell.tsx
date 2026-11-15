import { useState } from 'react';
import {
  ArrowLeft,
  Bell,
  Calendar,
  ClipboardList,
  FileHeart,
  Home,
  LogOut,
  Menu,
  MessageCircle,
  Pill,
  Settings,
  Users,
  X,
} from 'lucide-react';
import { useCare } from '../context/CareContext';
import type { AccountType, AppSection } from '../types/healthcare';
import { AppointmentsView } from './AppointmentsView';
import { CareAssistantPanel } from './CareAssistantPanel';
import { CareCircleView } from './CareCircleView';
import { CaretakerDailyCareView } from './CaretakerDailyCareView';
import { CaretakerDashboardView } from './CaretakerDashboardView';
import { DashboardOverview } from './DashboardOverview';
import { ElderlyDashboardView } from './ElderlyDashboardView';
import { FamilyDashboardView } from './FamilyDashboardView';
import { FamilyHealthUpdatesView } from './FamilyHealthUpdatesView';
import { HealthRecordsView } from './HealthRecordsView';
import { MedicationsView } from './MedicationsView';
import { MessagesView } from './MessagesView';
import { NotificationsDrawer } from './NotificationsDrawer';
import { RoutinesView } from './RoutinesView';
import { SettingsView } from './SettingsView';
import { Modal } from './ui/Modal';

type NavItem = { id: AppSection; label: string; icon: typeof Home };

const ROLE_NAV_ITEMS: Record<AccountType, NavItem[]> = {
  elderly: [
    { id: 'overview', label: 'Home', icon: Home },
    { id: 'medications', label: 'My Medicines', icon: Pill },
    { id: 'appointments', label: 'Appointments', icon: Calendar },
    { id: 'circle', label: 'Family', icon: Users },
    { id: 'settings', label: 'Settings', icon: Settings },
  ],
  family: [
    { id: 'overview', label: 'Home', icon: Home },
    { id: 'records', label: 'Health Updates', icon: FileHeart },
    { id: 'medications', label: 'Medicines', icon: Pill },
    { id: 'appointments', label: 'Appointments', icon: Calendar },
    { id: 'settings', label: 'Settings', icon: Settings },
  ],
  caretaker: [
    { id: 'overview', label: 'Home', icon: Home },
    { id: 'routines', label: 'Daily Care', icon: ClipboardList },
    { id: 'medications', label: 'Medicines', icon: Pill },
    { id: 'appointments', label: 'Appointments', icon: Calendar },
    { id: 'settings', label: 'Settings', icon: Settings },
  ],
};

interface WorkspaceShellProps {
  activeSection?: AppSection;
  onNavigate?: (path: string) => void;
}

export function WorkspaceShell({ activeSection, onNavigate }: WorkspaceShellProps) {
  const {
    profile,
    circles,
    activeCircle,
    selectActiveCircle,
    unreadNotificationCount,
    logout,
  } = useCare();

  const [internalSection, setInternalSection] = useState<AppSection>('overview');
  const section = activeSection ?? internalSection;
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);

  if (!profile || !activeCircle) return null;

  const isElderlyAccount = profile.accountType === 'elderly';
  const visibleNavItems = ROLE_NAV_ITEMS[profile.accountType] ?? ROLE_NAV_ITEMS.elderly;
  const activeNav =
    visibleNavItems.find((item) => item.id === section) ?? visibleNavItems[0];

  const handleSelectSection = (next: AppSection) => {
    setInternalSection(next);
    if (onNavigate) {
      const map: Record<AppSection, string> = {
        overview: '/dashboard',
        medications: '/medications',
        appointments: '/appointments',
        records: '/records',
        routines: '/routines',
        messages: '/messages',
        circle: '/circle',
        settings: '/settings',
      };
      onNavigate(map[next]);
    }
    setMobileMenuOpen(false);
  };

  return (
    <div className="flex min-h-screen bg-[#F7F7F5] text-[#1F2937]">
      {/* Desktop Sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-[#E5E7EB] bg-white lg:flex">
        <div className="flex items-center justify-between border-b border-[#E5E7EB] px-6 py-5">
          <button
            type="button"
            onClick={() => handleSelectSection('overview')}
            className="font-display text-xl font-bold tracking-tight text-[#064E3B] whitespace-nowrap"
          >
            CareConnect AI
          </button>
        </div>

        {/* Care Circle Selector (only shown when managing more than 1 patient) */}
        {circles.length > 1 && (
          <div className="border-b border-[#E5E7EB] px-4 py-4">
            <label htmlFor="circle-switch-desktop" className="block px-1 text-xs font-semibold text-[#6B7280]">
              Caring For
            </label>
            <select
              id="circle-switch-desktop"
              value={activeCircle.id}
              onChange={(e) => selectActiveCircle(e.target.value)}
              className="mt-1.5 min-h-[42px] w-full rounded-xl border border-[#D1D5DB] bg-[#F9FAFB] px-3 py-2 text-sm font-semibold text-[#1F2937] focus:border-[#065F46] focus:outline-none"
            >
              {circles.map((circle) => (
                <option key={circle.id} value={circle.id}>
                  {circle.patientName}
                </option>
              ))}
            </select>
          </div>
        )}

        <nav aria-label="Workspace navigation" className="flex-1 space-y-2 px-3 py-5">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const active = section === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelectSection(item.id)}
                className={`flex min-h-[50px] w-full items-center gap-3.5 rounded-xl px-4 py-3 text-base whitespace-nowrap ${
                  active
                    ? 'bg-[#ECFDF5] font-bold text-[#065F46]'
                    : 'font-medium text-[#374151] hover:bg-[#F3F4F6] hover:text-[#111827]'
                }`}
              >
                <Icon
                  className={`h-5 w-5 shrink-0 ${active ? 'text-[#065F46]' : 'text-[#6B7280]'}`}
                />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="border-t border-[#E5E7EB] p-4">
          <div className="px-2">
            <p className="truncate text-base font-semibold text-[#1F2937]">{profile.displayName}</p>
            <p className="truncate text-xs capitalize text-[#6B7280]">
              {profile.accountType === 'elderly'
                ? 'My Health Account'
                : `${profile.accountType} Account`}
            </p>
          </div>
          <button
            type="button"
            onClick={logout}
            className="mt-3 flex min-h-[46px] w-full items-center gap-2 rounded-xl border border-[#D1D5DB] bg-white px-4 text-sm font-semibold text-[#374151] hover:bg-[#F3F4F6]"
          >
            <LogOut className="h-4 w-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-50 flex bg-slate-950/40 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        >
          <aside
            className="flex h-full w-72 flex-col bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#E5E7EB] px-5 py-4">
              <span className="font-display text-xl font-bold text-[#064E3B]">CareConnect AI</span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Close menu"
                className="flex h-11 w-11 items-center justify-center rounded-xl text-[#4B5563] hover:bg-[#F3F4F6]"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            {circles.length > 1 && (
              <div className="border-b border-[#E5E7EB] px-4 py-3">
                <select
                  aria-label="Select patient"
                  value={activeCircle.id}
                  onChange={(e) => selectActiveCircle(e.target.value)}
                  className="min-h-[44px] w-full rounded-xl border border-[#D1D5DB] bg-[#F9FAFB] px-3 text-sm font-semibold text-[#1F2937]"
                >
                  {circles.map((circle) => (
                    <option key={circle.id} value={circle.id}>
                      {circle.patientName}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <nav className="flex-1 space-y-2 p-3">
              {visibleNavItems.map((item) => {
                const Icon = item.icon;
                const active = section === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelectSection(item.id)}
                    className={`flex min-h-[52px] w-full items-center gap-3.5 rounded-xl px-4 text-base ${
                      active ? 'bg-[#ECFDF5] font-bold text-[#065F46]' : 'font-medium text-[#374151]'
                    }`}
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>

            <div className="border-t border-[#E5E7EB] p-4">
              <button
                type="button"
                onClick={logout}
                className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl border border-[#D1D5DB] px-4 text-sm font-semibold text-[#374151]"
              >
                <LogOut className="h-4 w-4" />
                <span>Sign Out</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-[#E5E7EB] bg-white px-4 py-3.5 sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open menu"
              className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[#D1D5DB] text-[#1F2937] hover:bg-[#F3F4F6] lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <span className="truncate font-display text-lg font-bold text-[#1F2937]">
              {activeNav.label}
            </span>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setAssistantOpen(true)}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-[#065F46]/30 bg-[#ECFDF5] px-4 py-2 text-sm font-bold text-[#065F46] hover:bg-[#D1FAE5] whitespace-nowrap"
            >
              <MessageCircle className="h-4 w-4" />
              <span>Ask Assistant</span>
            </button>

            <button
              type="button"
              onClick={() => setNotificationsOpen(true)}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-[#D1D5DB] bg-white px-4 py-2 text-sm font-semibold text-[#1F2937] hover:bg-[#F3F4F6] whitespace-nowrap"
            >
              <Bell className="h-4 w-4 text-[#065F46]" />
              <span>Alerts</span>
              {unreadNotificationCount > 0 && (
                <span className="font-mono text-sm font-bold text-[#B91C1C] tabular-nums">
                  ({unreadNotificationCount})
                </span>
              )}
            </button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-8 sm:py-8">
          {section !== 'overview' && (
            <div className="mb-5">
              <button
                type="button"
                onClick={() => handleSelectSection('overview')}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-[#D1D5DB] bg-white px-4 text-sm font-semibold text-[#065F46] hover:bg-[#ECFDF5]"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Back to Home</span>
              </button>
            </div>
          )}

          {section === 'overview' &&
            (isElderlyAccount ? (
              <ElderlyDashboardView onNavigate={handleSelectSection} />
            ) : profile.accountType === 'family' ? (
              <FamilyDashboardView onNavigate={handleSelectSection} />
            ) : profile.accountType === 'caretaker' ? (
              <CaretakerDashboardView
                onNavigate={handleSelectSection}
                onAcceptInvite={onNavigate ? () => onNavigate('/accept-invite') : undefined}
              />
            ) : (
              <DashboardOverview onNavigate={handleSelectSection} />
            ))}
          {section === 'medications' && <MedicationsView />}
          {section === 'appointments' && <AppointmentsView />}
          {section === 'records' &&
            (profile.accountType === 'family' ? <FamilyHealthUpdatesView /> : <HealthRecordsView />)}
          {section === 'routines' &&
            (profile.accountType === 'caretaker' ? <CaretakerDailyCareView /> : <RoutinesView />)}
          {section === 'messages' && <MessagesView />}
          {section === 'circle' && <CareCircleView onNavigate={onNavigate} />}
          {section === 'settings' && (
            <SettingsView onNavigateSection={handleSelectSection} onNavigatePath={onNavigate} />
          )}
        </main>
      </div>

      <NotificationsDrawer open={notificationsOpen} onClose={() => setNotificationsOpen(false)} />

      <Modal
        open={assistantOpen}
        onClose={() => setAssistantOpen(false)}
        title="Care Routine Assistant"
        subtitle={`Simple answers from ${activeCircle.patientName}'s saved schedule.`}
        maxWidthClass="max-w-2xl"
      >
        <CareAssistantPanel compact />
      </Modal>
    </div>
  );
}
