import { useState } from 'react';
import {
  Activity,
  Bell,
  Calendar,
  Check,
  Pill,
  Sparkles,
  Users,
} from 'lucide-react';

interface PreviewDose {
  id: string;
  time: string;
  name: string;
  dosage: string;
  note: string;
  taken: boolean;
}

const INITIAL_DOSES: PreviewDose[] = [
  {
    id: 'd1',
    time: '08:00 AM',
    name: 'Lisinopril',
    dosage: '10 mg',
    note: 'Take with water',
    taken: true,
  },
  {
    id: 'd2',
    time: '08:00 AM',
    name: 'Metformin ER',
    dosage: '500 mg',
    note: 'With breakfast',
    taken: true,
  },
  {
    id: 'd3',
    time: '12:30 PM',
    name: 'Vitamin D3',
    dosage: '1000 IU',
    note: 'After lunch',
    taken: false,
  },
  {
    id: 'd4',
    time: '07:30 PM',
    name: 'Metformin ER',
    dosage: '500 mg',
    note: 'Evening meal',
    taken: false,
  },
];

export function HeroDashboardPreview({ onGetStarted }: { onGetStarted: () => void }) {
  const [activeTab, setActiveTab] = useState<'schedule' | 'vitals' | 'ai'>('schedule');
  const [doses, setDoses] = useState<PreviewDose[]>(INITIAL_DOSES);

  const takenCount = doses.filter((d) => d.taken).length;

  const toggleDose = (id: string) => {
    setDoses((prev) => prev.map((d) => (d.id === id ? { ...d, taken: !d.taken } : d)));
  };

  return (
    <div className="relative">
      {/* Subtle emerald ambient glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-4 rounded-3xl bg-gradient-to-br from-emerald-200/35 via-teal-100/25 to-transparent blur-2xl"
      />

      <div className="relative overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white shadow-[0_20px_50px_-15px_rgba(6,78,59,0.14)]">
        {/* Mock Browser / Workspace Chrome */}
        <div className="flex items-center justify-between border-b border-[#E5E7EB] bg-[#F9FAFB] px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="font-display text-xs font-bold text-[#064E3B]">CareConnect AI</span>
            <span className="text-xs text-[#9CA3AF]" aria-hidden="true">
              /
            </span>
            <span className="text-xs font-medium text-[#4B5563]">Sample Workspace Preview</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-[#6B7280]">
            <Users className="h-3.5 w-3.5 text-[#065F46]" />
            <span>3 Circle Members</span>
          </div>
        </div>

        {/* Patient Header Inside Preview */}
        <div className="border-b border-[#E5E7EB] px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-medium text-[#0D9488]">Illustrative Care Circle</p>
              <h3 className="font-display text-base font-bold text-[#1F2937]">
                Eleanor Bennett · Age 78
              </h3>
            </div>
            <div className="flex items-center gap-1 rounded-lg bg-[#F3F4F6] p-1">
              {(
                [
                  { id: 'schedule', label: 'Medications' },
                  { id: 'vitals', label: 'Vitals & Visits' },
                  { id: 'ai', label: 'AI Brief' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                    activeTab === tab.id
                      ? 'bg-white text-[#064E3B] shadow-sm'
                      : 'text-[#6B7280] hover:text-[#1F2937]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Mini KPI Row */}
          <div className="mt-4 grid grid-cols-3 gap-3 border-t border-[#E5E7EB] pt-3">
            <div>
              <div className="text-[11px] text-[#6B7280]">Doses Today</div>
              <div className="font-mono mt-0.5 text-sm font-semibold text-[#064E3B] tabular-nums">
                {takenCount} / {doses.length} taken
              </div>
            </div>
            <div>
              <div className="text-[11px] text-[#6B7280]">Morning BP</div>
              <div className="font-mono mt-0.5 text-sm font-semibold text-[#1F2937] tabular-nums">
                126/78 mmHg
              </div>
            </div>
            <div>
              <div className="text-[11px] text-[#6B7280]">Next Visit</div>
              <div className="font-mono mt-0.5 text-sm font-semibold text-[#1F2937] tabular-nums">
                Cardiology · Thu
              </div>
            </div>
          </div>
        </div>

        {/* Interactive Tab Body */}
        <div className="p-5">
          {activeTab === 'schedule' && (
            <div>
              <div className="mb-3 flex items-center justify-between text-xs text-[#6B7280]">
                <span className="font-medium text-[#1F2937]">Interactive Dose Preview (click to toggle)</span>
                <span className="font-mono tabular-nums">Today</span>
              </div>
              <div className="divide-y divide-[#E5E7EB] rounded-xl border border-[#E5E7EB]">
                {doses.map((dose) => (
                  <div key={dose.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] font-semibold text-[#065F46] tabular-nums">
                          {dose.time}
                        </span>
                        <span className="truncate text-xs font-semibold text-[#1F2937]">
                          {dose.name}
                        </span>
                        <span className="text-[11px] text-[#6B7280]">{dose.dosage}</span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-[#6B7280]">{dose.note}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleDose(dose.id)}
                      className={`inline-flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                        dose.taken
                          ? 'bg-[#ECFDF5] text-[#065F46]'
                          : 'bg-[#065F46] text-white hover:bg-[#047857]'
                      }`}
                    >
                      <Check className="h-3 w-3" />
                      <span>{dose.taken ? 'Taken' : 'Take'}</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'vitals' && (
            <div className="space-y-3">
              <div className="flex items-start justify-between rounded-xl border border-[#E5E7EB] p-3.5">
                <div className="flex items-start gap-3">
                  <Activity className="mt-0.5 h-4 w-4 text-[#065F46]" />
                  <div>
                    <p className="text-xs font-semibold text-[#1F2937]">Blood Pressure &amp; Pulse</p>
                    <p className="mt-0.5 text-[11px] text-[#6B7280]">
                      Home Cuff Monitor · Logged by Sarah (Daughter)
                    </p>
                  </div>
                </div>
                <span className="font-mono text-xs font-semibold text-[#065F46] tabular-nums">
                  126/78 mmHg
                </span>
              </div>

              <div className="flex items-start justify-between rounded-xl border border-[#E5E7EB] p-3.5">
                <div className="flex items-start gap-3">
                  <Calendar className="mt-0.5 h-4 w-4 text-[#0D9488]" />
                  <div>
                    <p className="text-xs font-semibold text-[#1F2937]">
                      Cardiology Follow-up · Dr. Marcus Vance
                    </p>
                    <p className="mt-0.5 text-[11px] text-[#6B7280]">
                      Mercy Senior Heart Center · Prep checklist ready
                    </p>
                  </div>
                </div>
                <span className="font-mono text-xs font-medium text-[#1F2937] tabular-nums">
                  10:30 AM
                </span>
              </div>

              <div className="flex items-start justify-between rounded-xl border border-[#E5E7EB] p-3.5">
                <div className="flex items-start gap-3">
                  <Bell className="mt-0.5 h-4 w-4 text-[#B45309]" />
                  <div>
                    <p className="text-xs font-semibold text-[#1F2937]">Refill Reminder</p>
                    <p className="mt-0.5 text-[11px] text-[#6B7280]">
                      Metformin ER has 6 doses remaining — pharmacy pickup needed
                    </p>
                  </div>
                </div>
                <span className="text-[11px] font-medium text-[#B45309]">Alert</span>
              </div>
            </div>
          )}

          {activeTab === 'ai' && (
            <div className="space-y-3 rounded-xl border border-[#0D9488]/30 bg-[#F0FDFA]/40 p-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#0F766E]">
                <Sparkles className="h-4 w-4" />
                <span>Gemini Shift &amp; Family Summary</span>
              </div>
              <p className="text-xs leading-relaxed text-[#374151]">
                Morning doses for Lisinopril and Metformin ER were completed on schedule. Blood pressure
                reading (126/78 mmHg) remains steady.
              </p>
              <div className="border-t border-[#E5E7EB] pt-2.5 text-[11px] text-[#4B5563]">
                <span className="font-semibold text-[#1F2937]">Next priority:</span> Confirm Vitamin D3 after
                lunch and pack 7-day blood pressure log for Thursday&apos;s Cardiology visit.
              </div>
            </div>
          )}

          <div className="mt-4 flex items-center justify-between border-t border-[#E5E7EB] pt-3">
            <div className="flex items-center gap-2 text-[11px] text-[#6B7280]">
              <Pill className="h-3.5 w-3.5 text-[#065F46]" />
              <span>Real-time Firestore sync across all members</span>
            </div>
            <button
              type="button"
              onClick={onGetStarted}
              className="text-xs font-semibold text-[#065F46] hover:underline whitespace-nowrap"
            >
              Launch Workspace →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
