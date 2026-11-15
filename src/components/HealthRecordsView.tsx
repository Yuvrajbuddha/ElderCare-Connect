import React, { useMemo, useState } from 'react';
import {
  Activity,
  Edit3,
  FileHeart,
  Flag,
  Lock,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { useCare } from '../context/CareContext';
import { formatDateDisplay, getTodayKey, parseReadableError } from '../lib/utils';
import {
  createHealthRecord,
  deleteHealthRecord,
  updateHealthRecord,
} from '../services/careService';
import type { HealthRecord, RecordType } from '../types/healthcare';
import { EmptyState } from './ui/EmptyState';
import { Modal } from './ui/Modal';
import { StatusText } from './ui/StatusText';

const RECORD_TYPE_LABELS: Record<RecordType, string> = {
  vital_sign: 'Vital Sign',
  lab_result: 'Lab Result',
  diagnosis: 'Diagnosis',
  immunization: 'Immunization',
  clinical_note: 'Clinical Note',
};

export function HealthRecordsView() {
  const {
    activeCircle,
    activeCircleDataLoading,
    firebaseUser,
    profile,
    can,
    healthRecords,
    pushToast,
  } = useCare();

  const [typeFilter, setTypeFilter] = useState<'all' | RecordType>('all');
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<HealthRecord | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [recordType, setRecordType] = useState<RecordType>('vital_sign');
  const [title, setTitle] = useState('');
  const [recordedDate, setRecordedDate] = useState(getTodayKey());
  const [providerName, setProviderName] = useState('');
  const [metricValue, setMetricValue] = useState('');
  const [metricUnit, setMetricUnit] = useState('');
  const [summary, setSummary] = useState('');
  const [flagged, setFlagged] = useState(false);

  const filteredRecords = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return healthRecords.filter((r) => {
      if (typeFilter !== 'all' && r.recordType !== typeFilter) return false;
      if (flaggedOnly && !r.flagged) return false;
      if (!q) return true;
      return (
        r.title.toLowerCase().includes(q) ||
        (r.providerName ?? '').toLowerCase().includes(q) ||
        (r.summary ?? '').toLowerCase().includes(q) ||
        (r.metricValue ?? '').toLowerCase().includes(q)
      );
    });
  }, [healthRecords, typeFilter, flaggedOnly, searchQuery]);

  const latestVitals = useMemo(
    () => healthRecords.filter((r) => r.recordType === 'vital_sign').slice(0, 4),
    [healthRecords],
  );

  if (!activeCircle || !firebaseUser || !profile) return null;

  if (!can('viewHealthInfo')) {
    return (
      <div className="rounded-xl border border-[#E5E7EB] bg-white p-10 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-[#F3F4F6] text-[#4B5563]">
          <Lock className="h-6 w-6" />
        </div>
        <h1 className="font-display mt-4 text-lg font-semibold text-[#1F2937]">
          Health Records Access Restricted
        </h1>
        <p className="mx-auto mt-1 max-w-md text-sm text-[#6B7280]">
          The Care Circle owner ({activeCircle.patientName}) has not granted &quot;View healthcare
          information&quot; permission to your member profile.
        </p>
      </div>
    );
  }

  const openCreateModal = (presetType: RecordType = 'vital_sign') => {
    setEditingRecord(null);
    setRecordType(presetType);
    setTitle(presetType === 'vital_sign' ? 'Morning Blood Pressure Reading' : '');
    setRecordedDate(getTodayKey());
    setProviderName(presetType === 'vital_sign' ? 'Home Cuff Monitor' : activeCircle.primaryPhysician || '');
    setMetricValue('');
    setMetricUnit(presetType === 'vital_sign' ? 'mmHg' : '');
    setSummary('');
    setFlagged(false);
    setModalOpen(true);
  };

  const openEditModal = (rec: HealthRecord) => {
    setEditingRecord(rec);
    setRecordType(rec.recordType);
    setTitle(rec.title);
    setRecordedDate(rec.recordedDate);
    setProviderName(rec.providerName || '');
    setMetricValue(rec.metricValue || '');
    setMetricUnit(rec.metricUnit || '');
    setSummary(rec.summary || '');
    setFlagged(rec.flagged);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      pushToast('error', 'Record title is required.');
      return;
    }
    setSubmitting(true);
    try {
      if (editingRecord) {
        await updateHealthRecord(activeCircle.id, editingRecord.id, {
          recordType,
          title: title.trim(),
          recordedDate,
          providerName,
          metricValue,
          metricUnit,
          summary,
          flagged,
        });
        pushToast('success', 'Health record updated.');
      } else {
        await createHealthRecord({
          circleId: activeCircle.id,
          memberIds: activeCircle.memberIds,
          createdByUid: firebaseUser.uid,
          createdByName: profile.displayName,
          recordType,
          title: title.trim(),
          recordedDate,
          providerName,
          metricValue,
          metricUnit,
          summary,
          flagged,
        });
        pushToast(
          'success',
          flagged ? 'Health record saved and urgent alert sent to Care Circle.' : 'Health record added.',
        );
      }
      setModalOpen(false);
    } catch (error) {
      pushToast('error', parseReadableError(error));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (rec: HealthRecord) => {
    try {
      await deleteHealthRecord(activeCircle.id, rec.id);
      pushToast('info', 'Health record deleted.');
    } catch (error) {
      pushToast('error', parseReadableError(error));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#1F2937]">Health Records &amp; Vitals</h1>
          <p className="mt-0.5 text-sm text-[#6B7280]">
            Central clinical log of vitals, lab panels, immunizations, and physician notes for{' '}
            {activeCircle.patientName}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => openCreateModal('vital_sign')}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-[#065F46] bg-[#ECFDF5] px-4 py-2 text-xs font-semibold text-[#065F46] hover:bg-[#D1FAE5] whitespace-nowrap shrink-0"
          >
            <Activity className="h-4 w-4" />
            <span>Log Vital Sign</span>
          </button>
          <button
            type="button"
            onClick={() => openCreateModal('lab_result')}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-[#065F46] px-4 py-2 text-xs font-semibold text-white hover:bg-[#047857] whitespace-nowrap shrink-0"
          >
            <Plus className="h-4 w-4" />
            <span>Add Record</span>
          </button>
        </div>
      </div>

      {/* Latest Vitals Strip */}
      {latestVitals.length > 0 && (
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {latestVitals.map((v) => (
            <div key={v.id} className="rounded-xl border border-[#E5E7EB] bg-white p-4">
              <div className="flex items-center justify-between gap-2 text-xs text-[#6B7280]">
                <span className="truncate">{v.title}</span>
                {v.flagged && <Flag className="h-3.5 w-3.5 shrink-0 text-[#B91C1C]" />}
              </div>
              <div className="font-mono mt-2 text-xl font-semibold text-[#1F2937] tabular-nums">
                {v.metricValue || '—'}{' '}
                <span className="text-xs font-normal text-[#6B7280]">{v.metricUnit}</span>
              </div>
              <p className="mt-1 text-xs text-[#6B7280] tabular-nums">{formatDateDisplay(v.recordedDate)}</p>
            </div>
          ))}
        </section>
      )}

      {/* Records Ledger */}
      <section className="rounded-xl border border-[#E5E7EB] bg-white">
        <div className="flex flex-col justify-between gap-3 border-b border-[#E5E7EB] px-6 py-4 lg:flex-row lg:items-center">
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex flex-wrap rounded-lg bg-[#F3F4F6] p-1">
              {(
                ['all', 'vital_sign', 'lab_result', 'diagnosis', 'immunization', 'clinical_note'] as const
              ).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setTypeFilter(tab)}
                  className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                    typeFilter === tab
                      ? 'bg-white text-[#064E3B] shadow-sm'
                      : 'text-[#6B7280] hover:text-[#1F2937]'
                  }`}
                >
                  {tab === 'all' ? 'All' : RECORD_TYPE_LABELS[tab]}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setFlaggedOnly((prev) => !prev)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                flaggedOnly
                  ? 'border-red-300 bg-red-50 text-[#B91C1C]'
                  : 'border-[#D1D5DB] bg-white text-[#4B5563] hover:bg-[#F3F4F6]'
              }`}
            >
              <Flag className="h-3.5 w-3.5" />
              <span>Flagged Only</span>
            </button>
          </div>

          <div className="relative w-full lg:w-64">
            <Search className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-[#9CA3AF]" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search records..."
              className="w-full rounded-lg border border-[#D1D5DB] bg-white py-2 pr-3 pl-9 text-xs text-[#1F2937] focus:border-[#065F46] focus:outline-none"
            />
          </div>
        </div>

        {activeCircleDataLoading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded bg-[#F3F4F6]" />
            ))}
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={FileHeart}
              title="No health records found"
              description="Record daily blood pressure, blood glucose, lab results, or clinician summaries to build an accurate medical timeline."
              actionLabel="Add Health Record"
              onAction={() => openCreateModal('vital_sign')}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-[#E5E7EB] bg-[#F9FAFB] text-xs font-semibold text-[#6B7280]">
                  <th className="px-6 py-3">Date</th>
                  <th className="px-4 py-3">Record &amp; Summary</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Reading / Value</th>
                  <th className="px-4 py-3">Provider</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E7EB]">
                {filteredRecords.map((rec) => (
                  <tr key={rec.id} className="hover:bg-[#F9FAFB]">
                    <td className="px-6 py-3.5 font-mono text-xs text-[#4B5563] tabular-nums whitespace-nowrap">
                      {formatDateDisplay(rec.recordedDate)}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="font-semibold text-[#1F2937]">{rec.title}</div>
                      {rec.summary && (
                        <div className="mt-0.5 max-w-md text-xs text-[#6B7280]">{rec.summary}</div>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-xs text-[#4B5563] whitespace-nowrap">
                      {RECORD_TYPE_LABELS[rec.recordType]}
                    </td>
                    <td className="px-4 py-3.5 font-mono text-xs font-semibold text-[#1F2937] tabular-nums whitespace-nowrap">
                      {rec.metricValue ? `${rec.metricValue} ${rec.metricUnit ?? ''}`.trim() : '—'}
                    </td>
                    <td className="px-4 py-3.5 text-xs text-[#4B5563]">{rec.providerName || '—'}</td>
                    <td className="px-4 py-3.5">
                      {rec.flagged ? (
                        <StatusText variant="danger" label="Flagged" />
                      ) : (
                        <StatusText variant="success" label="Recorded" />
                      )}
                    </td>
                    <td className="px-6 py-3.5 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEditModal(rec)}
                          aria-label={`Edit ${rec.title}`}
                          className="rounded-lg p-2 text-[#4B5563] hover:bg-[#F3F4F6]"
                        >
                          <Edit3 className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(rec)}
                          aria-label={`Delete ${rec.title}`}
                          className="rounded-lg p-2 text-[#6B7280] hover:bg-red-50 hover:text-[#B91C1C]"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingRecord ? 'Edit Health Record' : 'Add Health Record'}
        subtitle="Store vitals, lab panels, diagnoses, or clinical notes."
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="rec-type" className="block text-sm font-medium text-[#1F2937]">
                Record Category
              </label>
              <select
                id="rec-type"
                value={recordType}
                onChange={(e) => setRecordType(e.target.value as RecordType)}
                className="mt-1 w-full rounded-lg border border-[#D1D5DB] bg-white px-3 py-2 text-sm focus:border-[#065F46] focus:outline-none"
              >
                <option value="vital_sign">Vital Sign</option>
                <option value="lab_result">Lab Result</option>
                <option value="diagnosis">Diagnosis</option>
                <option value="immunization">Immunization</option>
                <option value="clinical_note">Clinical Note</option>
              </select>
            </div>
            <div>
              <label htmlFor="rec-date" className="block text-sm font-medium text-[#1F2937]">
                Recorded Date *
              </label>
              <input
                id="rec-date"
                type="date"
                required
                value={recordedDate}
                onChange={(e) => setRecordedDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#D1D5DB] px-3 py-2 font-mono text-sm focus:border-[#065F46] focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label htmlFor="rec-title" className="block text-sm font-medium text-[#1F2937]">
              Title *
            </label>
            <input
              id="rec-title"
              type="text"
              required
              maxLength={140}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Morning Blood Pressure or Comprehensive Metabolic Panel"
              className="mt-1 w-full rounded-lg border border-[#D1D5DB] px-3 py-2 text-sm focus:border-[#065F46] focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="rec-val" className="block text-sm font-medium text-[#1F2937]">
                Value / Reading
              </label>
              <input
                id="rec-val"
                type="text"
                maxLength={80}
                value={metricValue}
                onChange={(e) => setMetricValue(e.target.value)}
                placeholder="e.g. 124/78"
                className="mt-1 w-full rounded-lg border border-[#D1D5DB] px-3 py-2 font-mono text-sm focus:border-[#065F46] focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="rec-unit" className="block text-sm font-medium text-[#1F2937]">
                Unit
              </label>
              <input
                id="rec-unit"
                type="text"
                maxLength={40}
                value={metricUnit}
                onChange={(e) => setMetricUnit(e.target.value)}
                placeholder="e.g. mmHg"
                className="mt-1 w-full rounded-lg border border-[#D1D5DB] px-3 py-2 text-sm focus:border-[#065F46] focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="rec-prov" className="block text-sm font-medium text-[#1F2937]">
                Provider / Device
              </label>
              <input
                id="rec-prov"
                type="text"
                maxLength={120}
                value={providerName}
                onChange={(e) => setProviderName(e.target.value)}
                placeholder="Oakridge Lab"
                className="mt-1 w-full rounded-lg border border-[#D1D5DB] px-3 py-2 text-sm focus:border-[#065F46] focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label htmlFor="rec-summary" className="block text-sm font-medium text-[#1F2937]">
              Notes &amp; Observations
            </label>
            <textarea
              id="rec-summary"
              rows={3}
              maxLength={1200}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Clinical context, symptoms noted, or physician comments..."
              className="mt-1 w-full rounded-lg border border-[#D1D5DB] px-3 py-2 text-sm focus:border-[#065F46] focus:outline-none"
            />
          </div>

          <label className="flex items-center gap-2.5 text-sm text-[#1F2937]">
            <input
              type="checkbox"
              checked={flagged}
              onChange={(e) => setFlagged(e.target.checked)}
              className="h-4 w-4 rounded border-[#D1D5DB] text-[#065F46] focus:ring-[#065F46]"
            />
            <span>Flag for Care Team review (sends an alert notification on save)</span>
          </label>

          <div className="flex justify-end gap-3 border-t border-[#E5E7EB] pt-4">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="rounded-lg border border-[#D1D5DB] bg-white px-4 py-2 text-sm font-medium text-[#374151] hover:bg-[#F3F4F6]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-[#065F46] px-5 py-2 text-sm font-semibold text-white hover:bg-[#047857] disabled:opacity-60"
            >
              {submitting ? 'Saving...' : editingRecord ? 'Save Changes' : 'Save Record'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
