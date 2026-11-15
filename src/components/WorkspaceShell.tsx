import { useState } from 'react';
import {
  ArrowLeft,
  Bell,
  Calendar,
  ClipboardList,
  FileHeart,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Pill,
  Users,
  X,
} from 'lucide-react';
import { useCare } from '../context/CareContext';
import type { AppSection } from '../types/healthcare';
import { AppointmentsView } from './AppointmentsView';
import { CareCircleView } from './CareCircleView';
import { DashboardOverview } from './DashboardOverview';
import { ElderlyDashboardView } from './ElderlyDashboardView';
import { HealthRecordsView } from './HealthRecordsView';
import { MedicationsView } from './MedicationsView';
import { MessagesView } from './MessagesView';
import { NotificationsDrawer } from './NotificationsDrawer';
import { RoutinesView } from './RoutinesView';

const NAV_ITEMS: Array<{ id: AppSection; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'overview', label: 'Daily Overview', icon: LayoutDashboard },
  { id: 'medications', label: 'Medications', icon: Pill },
  { id: 'appointments', label: 'Appointments', icon: Calendar },
  { id: 'records', label: 'Health Records', icon: FileHeart },
  { id: 'routines', label: 'Care Routines', icon: ClipboardList },
  { id: 'messages', label: 'Care Messages', icon: MessageSquare },
  { id: 'circle', label: 'Care Circle', icon: Users },
];

const ELDERLY_NAV_ITEMS: Array<{ id: AppSection; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'overview', label: 'My Home', icon: LayoutDashboard },
  { id: 'medications', label: 'My Medicines', icon: Pill },
  { id: 'appointments', label: 'Appointments', icon: Calendar },
  { id: 'records', label: 'Health Records', icon: FileHeart },
  { id: 'circle', label: 'Family & Care', icon: Users },
];

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

  if (!profile || !activeCircle) return null;

  const isElderlyAccount = profile.accountType === 'elderly';
  const visibleNavItems = isElderlyAccount ? ELDERLY_NAV_ITEMS : NAV_ITEMS;
  const activeNav =
    visibleNavItems.find((item) => item.id === section) ??
    NAV_ITEMS.find((item) => item.id === section) ??
    visibleNavItems[0];

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
            onClick={() => (onNavigate ? onNavigate('/') : handleSelectSection('overview'))}
            className="font-display text-lg font-bold tracking-tight text-[#064E3B] whitespace-nowrap"
          >
            CareConnect AI
          </button>
        </div>

        {/* Care Circle Selector */}
        {(!isElderlyAccount || circles.length > 1) && (
          <div className="border-b border-[#E5E7EB] px-4 py-4">
            <label htmlFor="circle-switch-desktop" className="block px-2 text-xs font-medium text-[#6B7280]">
              Active Care Circle
            </label>
            <select
              id="circle-switch-desktop"
              value={activeCircle.id}
              onChange={(e) => selectActiveCircle(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-[#D1D5DB] bg-[#F9FAFB] px-2.5 py-2 text-xs font-semibold text-[#1F2937] focus:border-[#065F46] focus:outline-none"
            >
              {circles.map((circle) => (
                <option key={circle.id} value={circle.id}>
                  {circle.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <nav aria-label="Workspace navigation" className="flex-1 space-y-1.5 px-3 py-4">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const active = section === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelectSection(item.id)}
                className={`flex w-full items-center gap-3 rounded-xl px-3.5 transition-colors whitespace-nowrap ${
                  isElderlyAccount ? 'min-h-[50px] py-3 text-base' : 'py-2.5 text-sm'
                } ${
                  active
                    ? 'bg-[#ECFDF5] font-semibold text-[#065F46]'
                    : 'font-medium text-[#374151] hover:bg-[#F3F4F6] hover:text-[#111827]'
                }`}
              >
                <Icon
                  className={`shrink-0 ${isElderlyAccount ? 'h-5 w-5' : 'h-4 w-4'} ${
                    active ? 'text-[#065F46]' : 'text-[#6B7280]'
                  }`}
                />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="border-t border-[#E5E7EB] p-4">
          <div className="px-2">
            <p className={`truncate font-semibold text-[#1F2937] ${isElderlyAccount ? 'text-base' : 'text-sm'}`}>
              {profile.displayName}
            </p>
            <p className="truncate text-xs capitalize text-[#4B5563]">
              {profile.accountType === 'elderly' ? 'Personal Health Profile' : `${profile.accountType} account`}
            </p>
          </div>
          {onNavigate && !isElderlyAccount && (
            <button
              type="button"
              onClick={() => onNavigate('/accept-invite')}
              className="mt-3 flex w-full items-center gap-2 rounded-lg border border-[#D1D5DB] bg-[#F9FAFB] px-3 py-2 text-xs font-medium text-[#065F46] transition-colors hover:bg-[#ECFDF5]"
            >
              <KeyRound className="h-3.5 w-3.5" />
              <span>Accept Invite Code</span>
            </button>
          )}
          <button
            type="button"
            onClick={logout}
            className={`mt-2.5 flex w-full items-center gap-2 rounded-xl border border-[#D1D5DB] bg-white px-3.5 font-medium text-[#374151] transition-colors hover:bg-[#F3F4F6] hover:text-[#111827] ${
              isElderlyAccount ? 'min-h-[46px] py-2.5 text-sm font-semibold' : 'py-2 text-xs'
            }`}
          >
            <LogOut className={isElderlyAccount ? 'h-4 w-4' : 'h-3.5 w-3.5'} />
            <span>Sign out</span>
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
              <span className="font-display text-lg font-bold text-[#064E3B]">CareConnect AI</span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Close navigation"
                className="rounded-lg p-1.5 text-[#6B7280] hover:bg-[#F3F4F6]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {(!isElderlyAccount || circles.length > 1) && (
              <div className="border-b border-[#E5E7EB] px-4 py-3">
                <select
                  aria-label="Active Care Circle"
                  value={activeCircle.id}
                  onChange={(e) => selectActiveCircle(e.target.value)}
                  className="w-full rounded-lg border border-[#D1D5DB] bg-[#F9FAFB] px-3 py-2 text-xs font-semibold text-[#1F2937]"
                >
                  {circles.map((circle) => (
                    <option key={circle.id} value={circle.id}>
                      {circle.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <nav className="flex-1 space-y-1.5 p-3">
              {visibleNavItems.map((item) => {
                const Icon = item.icon;
                const active = section === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelectSection(item.id)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3.5 ${
                      isElderlyAccount ? 'min-h-[50px] py-3 text-base' : 'py-3 text-sm'
                    } ${
                      active ? 'bg-[#ECFDF5] font-semibold text-[#065F46]' : 'font-medium text-[#374151]'
                    }`}
                  >
                    <Icon className={isElderlyAccount ? 'h-5 w-5 shrink-0' : 'h-4 w-4 shrink-0'} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>

            <div className="space-y-2 border-t border-[#E5E7EB] p-4">
              {onNavigate && !isElderlyAccount && (
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onNavigate('/accept-invite');
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#065F46]/30 bg-[#ECFDF5] px-3 py-2 text-xs font-semibold text-[#065F46]"
                >
                  <KeyRound className="h-3.5 w-3.5" />
                  <span>Accept Invite Code</span>
                </button>
              )}
              <button
                type="button"
                onClick={logout}
                className={`flex w-full items-center justify-center gap-2 rounded-xl border border-[#D1D5DB] px-3 font-medium text-[#374151] ${
                  isElderlyAccount ? 'min-h-[48px] py-2.5 text-sm font-semibold' : 'py-2 text-xs'
                }`}
              >
                <LogOut className="h-4 w-4" />
                <span>Sign out</span>
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
              aria-label="Open navigation menu"
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[#E5E7EB] text-[#4B5563] hover:bg-[#F3F4F6] lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex min-w-0 items-center gap-2 text-sm">
              <span className="hidden text-[#6B7280] sm:inline">{activeCircle.name}</span>
              <span className="hidden text-[#9CA3AF] sm:inline" aria-hidden="true">
                /
              </span>
              <span className="truncate font-display font-semibold text-[#1F2937]">{activeNav.label}</span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setNotificationsOpen(true)}
              className="relative inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-[#D1D5DB] bg-white px-3.5 py-2 text-xs font-semibold text-[#1F2937] transition-colors hover:bg-[#F3F4F6] whitespace-nowrap"
            >
              <Bell className="h-4 w-4 text-[#065F46]" />
              <span>Alerts</span>
              {unreadNotificationCount > 0 && (
                <span className="font-mono text-xs font-bold text-[#B91C1C] tabular-nums">
                  ({unreadNotificationCount})
                </span>
              )}
            </button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-8 sm:py-8">
          {isElderlyAccount && section !== 'overview' && (
            <div className="mb-5">
              <button
                type="button"
                onClick={() => handleSelectSection('overview')}
                className="inline-flex min-h-[46px] items-center gap-2 rounded-xl border border-[#D1D5DB] bg-white px-4 py-2 text-base font-semibold text-[#064E3B] hover:bg-[#ECFDF5]"
              >
                <ArrowLeft className="h-5 w-5" />
                <span>Back to My Home Dashboard</span>
              </button>
            </div>
          )}
          {section === 'overview' &&
            (isElderlyAccount ? (
              <ElderlyDashboardView onNavigate={handleSelectSection} />
            ) : (
              <DashboardOverview onNavigate={handleSelectSection} />
            ))}
          {section === 'medications' && <MedicationsView />}
          {section === 'appointments' && <AppointmentsView />}
          {section === 'records' && <HealthRecordsView />}
          {section === 'routines' && <RoutinesView />}
          {section === 'messages' && <MessagesView />}
          {section === 'circle' && <CareCircleView onNavigate={onNavigate} />}
        </main>
      </div>

      <NotificationsDrawer open={notificationsOpen} onClose={() => setNotificationsOpen(false)} />
    </div>
  );
}
