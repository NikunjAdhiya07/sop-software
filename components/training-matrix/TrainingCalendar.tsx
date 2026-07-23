'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin, { Draggable } from '@fullcalendar/interaction';
import type {
  DateSelectArg,
  EventClickArg,
  EventDropArg,
  EventInput,
  DatesSetArg,
} from '@fullcalendar/core';
import type { EventReceiveArg } from '@fullcalendar/interaction';
import { Calendar as CalendarIcon, Loader2, Wand2 } from 'lucide-react';
import UnassignedSopCards, { type UnassignedCard } from './UnassignedSopCards';
import CalendarEventModal, { type CalendarEventDetail } from './CalendarEventModal';
import { DEPT_COLORS, MONTH_NAMES } from '@/lib/trainingExamScheduleShared';

type ApiEvent = {
  id: string;
  sopCode: string;
  sopName: string;
  department: string;
  year: number;
  plannedMonth: number;
  examDate: string;
  scope: 'department' | 'employee';
  employeeName?: string;
  color?: string;
  title?: string;
  inherited?: boolean;
  isOverride?: boolean;
  departmentScheduleId?: string;
};

type EmployeeOption = {
  name: string;
  designation: string;
  department: string;
  employeeId?: string;
};

type CalendarPayload = {
  year: number;
  month: number | null;
  view: string;
  monthLabel: string;
  events: ApiEvent[];
  unassigned: UnassignedCard[];
  unassignedCount: number;
  employees: EmployeeOption[];
  banner: string | null;
};

function dateToIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function toFcEvents(events: ApiEvent[]): EventInput[] {
  return events.map((ev) => {
    const color = ev.color || DEPT_COLORS[ev.department] || '#6366f1';
    return {
      id: ev.id,
      title: ev.title || `${ev.sopCode} — ${ev.department}`,
      start: ev.examDate,
      allDay: true,
      backgroundColor: ev.inherited ? '#e5e7eb' : color,
      borderColor: ev.isOverride ? '#4f46e5' : color,
      textColor: ev.inherited ? '#374151' : '#ffffff',
      classNames: [
        ev.inherited ? 'fc-event-inherited' : '',
        ev.isOverride ? 'fc-event-override' : '',
      ].filter(Boolean),
      extendedProps: { ...ev },
    };
  });
}

async function readError(res: Response): Promise<string> {
  try {
    const j = await res.json();
    return j.error || res.statusText;
  } catch {
    return res.statusText;
  }
}

export default function TrainingCalendar() {
  const calendarRef = useRef<InstanceType<typeof FullCalendar> | null>(null);
  const cardsHostRef = useRef<HTMLDivElement | null>(null);
  const draggableRef = useRef<Draggable | null>(null);

  const [calendarView, setCalendarView] = useState<'dept' | 'employee'>('dept');
  const [visibleYear, setVisibleYear] = useState(new Date().getFullYear());
  const [visibleMonth, setVisibleMonth] = useState(new Date().getMonth() + 1);
  const [payload, setPayload] = useState<CalendarPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [autoAssigning, setAutoAssigning] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const [deptFilter, setDeptFilter] = useState('');
  const [employeeFilter, setEmployeeFilter] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [modalEvent, setModalEvent] = useState<CalendarEventDetail | null>(null);
  const [createDefaults, setCreateDefaults] = useState<{
    examDate: string;
    unassignedOptions: UnassignedCard[];
  } | null>(null);

  const showMsg = useCallback((kind: 'ok' | 'err', text: string) => {
    setMsg({ kind, text });
    window.setTimeout(() => setMsg(null), 4000);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        year: String(visibleYear),
        month: String(visibleMonth),
        view: calendarView,
      });
      if (calendarView === 'employee') {
        if (employeeFilter) params.set('employee', employeeFilter);
        if (deptFilter) params.set('department', deptFilter);
      }
      const res = await fetch(`/api/training-matrix/exam-schedule?${params}`);
      if (!res.ok) throw new Error(await readError(res));
      const data = (await res.json()) as CalendarPayload;
      setPayload(data);
    } catch (err) {
      showMsg('err', err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [visibleYear, visibleMonth, calendarView, employeeFilter, deptFilter, showMsg]);

  useEffect(() => {
    void load();
  }, [load]);

  // Keep FullCalendar sized to the flex viewport when the header collapses/expands.
  useEffect(() => {
    const el = document.querySelector('.training-calendar-fc');
    if (!el) return;
    const ro = new ResizeObserver(() => {
      calendarRef.current?.getApi()?.updateSize();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // External drag from unassigned cards
  useEffect(() => {
    if (calendarView !== 'dept') {
      draggableRef.current?.destroy();
      draggableRef.current = null;
      return;
    }
    const host = cardsHostRef.current;
    if (!host) return;
    draggableRef.current?.destroy();
    draggableRef.current = new Draggable(host, {
      itemSelector: '.unassigned-sop-card',
      eventData(el) {
        const sopCode = el.getAttribute('data-sop-code') || '';
        const department = el.getAttribute('data-department') || '';
        return {
          title: `${sopCode} — ${department}`,
          duration: { days: 1 },
          create: false,
          extendedProps: {
            sopCode,
            sopName: el.getAttribute('data-sop-name') || '',
            department,
            plannedMonth: Number(el.getAttribute('data-planned-month')),
            year: Number(el.getAttribute('data-year')),
          },
        };
      },
    });
    return () => {
      draggableRef.current?.destroy();
      draggableRef.current = null;
    };
  }, [calendarView, payload?.unassigned]);

  const employeesForDept = (payload?.employees || []).filter(
    (e) => !deptFilter || e.department === deptFilter,
  );

  const handleDatesSet = (arg: DatesSetArg) => {
    const mid = new Date((arg.start.getTime() + arg.end.getTime()) / 2);
    const y = mid.getFullYear();
    const m = mid.getMonth() + 1;
    setVisibleYear((prev) => (prev === y ? prev : y));
    setVisibleMonth((prev) => (prev === m ? prev : m));
  };

  const openEdit = (ev: ApiEvent) => {
    setCreateDefaults(null);
    setModalEvent({
      id: ev.id,
      sopCode: ev.sopCode,
      sopName: ev.sopName,
      department: ev.department,
      year: ev.year,
      plannedMonth: ev.plannedMonth,
      examDate: ev.examDate,
      scope: ev.scope,
      employeeName: ev.employeeName,
      inherited: ev.inherited,
      isOverride: ev.isOverride,
      departmentScheduleId: ev.departmentScheduleId,
    });
    setModalOpen(true);
  };

  const handleEventClick = (arg: EventClickArg) => {
    const ev = arg.event.extendedProps as ApiEvent;
    openEdit({
      ...ev,
      id: arg.event.id,
      examDate: arg.event.start ? dateToIso(arg.event.start) : ev.examDate,
    });
  };

  const handleDateSelect = (arg: DateSelectArg) => {
    if (calendarView !== 'dept') return;
    const iso = dateToIso(arg.start);
    const m = arg.start.getMonth() + 1;
    const options = (payload?.unassigned || []).filter((u) => u.plannedMonth === m);
    setModalEvent(null);
    setCreateDefaults({ examDate: iso, unassignedOptions: options });
    setModalOpen(true);
    arg.view.calendar.unselect();
  };

  const persistDepartment = async (body: Record<string, unknown>) => {
    const res = await fetch('/api/training-matrix/exam-schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await readError(res));
  };

  const persistEmployeeOverride = async (body: Record<string, unknown>) => {
    const res = await fetch('/api/training-matrix/exam-schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, scope: 'employee' }),
    });
    if (!res.ok) throw new Error(await readError(res));
  };

  const patchSchedule = async (id: string, body: Record<string, unknown>) => {
    const res = await fetch(`/api/training-matrix/exam-schedule/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await readError(res));
  };

  const handleEventDrop = async (arg: EventDropArg) => {
    const ev = arg.event.extendedProps as ApiEvent;
    const newDate = arg.event.start ? dateToIso(arg.event.start) : null;
    if (!newDate) {
      arg.revert();
      return;
    }

    const dateMonth = Number(newDate.slice(5, 7));
    const outside = dateMonth !== ev.plannedMonth;
    if (outside && !window.confirm(
      `Move outside planned month (${MONTH_NAMES[ev.plannedMonth]})?`,
    )) {
      arg.revert();
      return;
    }

    setSaving(true);
    try {
      if (calendarView === 'employee') {
        const empName = ev.employeeName || employeeFilter;
        if (!empName) throw new Error('Select an employee first');
        if (ev.inherited || String(ev.id).startsWith('inherited:')) {
          await persistEmployeeOverride({
            sopCode: ev.sopCode,
            sopName: ev.sopName,
            department: ev.department,
            plannedMonth: ev.plannedMonth,
            year: ev.year,
            examDate: newDate,
            employeeName: empName,
          });
        } else {
          await patchSchedule(ev.id, {
            examDate: newDate,
            allowOutsideMonth: outside,
          });
        }
      } else {
        await patchSchedule(ev.id, {
          examDate: newDate,
          allowOutsideMonth: outside,
        });
      }
      showMsg('ok', 'Exam date updated');
      await load();
    } catch (err) {
      arg.revert();
      showMsg('err', err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleEventReceive = async (arg: EventReceiveArg) => {
    const props = arg.event.extendedProps as {
      sopCode?: string;
      sopName?: string;
      department?: string;
      plannedMonth?: number;
      year?: number;
    };
    const examDate = arg.event.start ? dateToIso(arg.event.start) : null;
    arg.event.remove();
    if (!examDate || !props.sopCode || !props.department || !props.plannedMonth) return;

    const dateMonth = Number(examDate.slice(5, 7));
    if (dateMonth !== props.plannedMonth) {
      showMsg(
        'err',
        `Drop onto a day in ${MONTH_NAMES[props.plannedMonth]} (planned month for this SOP)`,
      );
      return;
    }

    setSaving(true);
    try {
      await persistDepartment({
        sopCode: props.sopCode,
        sopName: props.sopName,
        department: props.department,
        plannedMonth: props.plannedMonth,
        year: props.year || visibleYear,
        examDate,
        scope: 'department',
      });
      showMsg('ok', `Scheduled ${props.sopCode} on ${examDate}`);
      await load();
    } catch (err) {
      showMsg('err', err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleModalSave = async (payloadIn: {
    examDate: string;
    sopCode?: string;
    sopName?: string;
    department?: string;
    plannedMonth?: number;
    year?: number;
    allowOutsideMonth?: boolean;
  }) => {
    setSaving(true);
    try {
      if (!modalEvent) {
        // create
        await persistDepartment({
          sopCode: payloadIn.sopCode,
          sopName: payloadIn.sopName,
          department: payloadIn.department,
          plannedMonth: payloadIn.plannedMonth,
          year: payloadIn.year,
          examDate: payloadIn.examDate,
          scope: 'department',
          allowOutsideMonth: payloadIn.allowOutsideMonth,
        });
        showMsg('ok', 'Exam date assigned');
      } else if (calendarView === 'employee') {
        const empName = modalEvent.employeeName || employeeFilter;
        if (!empName) throw new Error('Select an employee first');
        if (modalEvent.inherited || String(modalEvent.id).startsWith('inherited:')) {
          await persistEmployeeOverride({
            sopCode: modalEvent.sopCode,
            sopName: modalEvent.sopName,
            department: modalEvent.department,
            plannedMonth: modalEvent.plannedMonth,
            year: modalEvent.year,
            examDate: payloadIn.examDate,
            employeeName: empName,
          });
        } else {
          await patchSchedule(modalEvent.id, {
            examDate: payloadIn.examDate,
            allowOutsideMonth: payloadIn.allowOutsideMonth,
          });
        }
        showMsg('ok', 'Employee exam date saved');
      } else {
        await patchSchedule(modalEvent.id, {
          examDate: payloadIn.examDate,
          allowOutsideMonth: payloadIn.allowOutsideMonth,
        });
        showMsg('ok', 'Exam date updated');
      }
      setModalOpen(false);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    if (!modalEvent || modalEvent.inherited) return;
    if (!window.confirm('Remove this exam date assignment?')) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/training-matrix/exam-schedule/${modalEvent.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error(await readError(res));
      showMsg('ok', 'Assignment removed');
      setModalOpen(false);
      await load();
    } catch (err) {
      showMsg('err', err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleResetOverride = async () => {
    if (!modalEvent?.isOverride) return;
    if (!window.confirm('Reset to the department exam date?')) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/training-matrix/exam-schedule/${modalEvent.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error(await readError(res));
      showMsg('ok', 'Override cleared');
      setModalOpen(false);
      await load();
    } catch (err) {
      showMsg('err', err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleAutoAssign = async () => {
    setAutoAssigning(true);
    try {
      const res = await fetch('/api/training-matrix/exam-schedule/auto-assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year: visibleYear, month: visibleMonth }),
      });
      if (!res.ok) throw new Error(await readError(res));
      const data = await res.json();
      showMsg('ok', data.message || `Assigned ${data.created} trainings`);
      await load();
    } catch (err) {
      showMsg('err', err instanceof Error ? err.message : String(err));
    } finally {
      setAutoAssigning(false);
    }
  };

  const fcEvents = toFcEvents(payload?.events || []);
  const departments = Array.from(
    new Set((payload?.employees || []).map((e) => e.department)),
  ).sort();

  return (
    <div className="flex flex-col gap-2 px-4 py-3 h-full min-h-0 overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 shrink-0">
        <div className="inline-flex rounded-md border border-gray-300 overflow-hidden text-sm">
          <button
            type="button"
            onClick={() => {
              setCalendarView('dept');
              setEmployeeFilter('');
            }}
            className={`px-3 py-1.5 inline-flex items-center gap-1.5 transition ${
              calendarView === 'dept'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            <CalendarIcon className="w-3.5 h-3.5" />
            Department schedule
          </button>
          <button
            type="button"
            onClick={() => setCalendarView('employee')}
            className={`px-3 py-1.5 inline-flex items-center gap-1.5 border-l border-gray-300 transition ${
              calendarView === 'employee'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            Employee schedule
          </button>
        </div>

        {calendarView === 'employee' && (
          <>
            <select
              value={deptFilter}
              onChange={(e) => {
                setDeptFilter(e.target.value);
                setEmployeeFilter('');
              }}
              className="border border-gray-300 rounded-md px-2 py-1.5 text-sm"
            >
              <option value="">All departments</option>
              {departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <select
              value={employeeFilter}
              onChange={(e) => setEmployeeFilter(e.target.value)}
              className="border border-gray-300 rounded-md px-2 py-1.5 text-sm min-w-[180px]"
            >
              <option value="">All employees (filter)</option>
              {employeesForDept.map((e) => (
                <option key={`${e.department}-${e.name}`} value={e.name}>
                  {e.name} ({e.department})
                </option>
              ))}
            </select>
          </>
        )}

        {calendarView === 'dept' && (
          <button
            type="button"
            onClick={() => void handleAutoAssign()}
            disabled={autoAssigning || loading || !(payload?.unassignedCount)}
            className="px-3 py-1.5 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-60 text-sm font-medium inline-flex items-center gap-1.5"
            title="Spread unassigned SOPs across open weekdays in this month"
          >
            <Wand2 className="w-3.5 h-3.5" />
            {autoAssigning ? 'Assigning…' : 'Auto-assign dates'}
          </button>
        )}

        {(loading || saving) && (
          <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
        )}
        {msg && (
          <span
            className={`text-xs font-medium ${msg.kind === 'ok' ? 'text-green-700' : 'text-red-600'}`}
          >
            {msg.text}
          </span>
        )}
      </div>

      {payload?.banner && calendarView === 'dept' && (
        <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-1.5 shrink-0">
          {payload.banner}
        </div>
      )}

      {calendarView === 'employee' && !employeeFilter && (
        <div className="text-xs text-gray-500 shrink-0">
          Showing all matching employees. Pick one employee to edit personal overrides (e.g. holiday → other day).
          Gray events are inherited department dates; indigo border = personal override.
        </div>
      )}

      <div className="flex gap-3 flex-1 min-h-0 items-stretch">
        {calendarView === 'dept' && (
          <div ref={cardsHostRef} className="w-56 shrink-0 min-h-0">
            <UnassignedSopCards
              cards={payload?.unassigned || []}
              monthLabel={MONTH_NAMES[visibleMonth]}
            />
          </div>
        )}

        <div className="flex-1 min-w-0 min-h-0 rounded-lg border border-gray-200 bg-white shadow-sm p-2 training-calendar-fc">
          <FullCalendar
            ref={calendarRef}
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            headerToolbar={{
              left: 'prev,next today',
              center: 'title',
              right: 'dayGridMonth,timeGridWeek',
            }}
            height="100%"
            editable
            droppable={calendarView === 'dept'}
            selectable={calendarView === 'dept'}
            events={fcEvents}
            datesSet={handleDatesSet}
            eventClick={handleEventClick}
            eventDrop={(arg) => void handleEventDrop(arg)}
            eventReceive={(arg) => void handleEventReceive(arg)}
            select={handleDateSelect}
            dayMaxEvents={3}
          />
        </div>
      </div>

      <CalendarEventModal
        open={modalOpen}
        event={modalEvent}
        createDefaults={createDefaults}
        employeeMode={calendarView === 'employee'}
        selectedEmployee={employeeFilter || modalEvent?.employeeName}
        saving={saving}
        onClose={() => setModalOpen(false)}
        onSave={handleModalSave}
        onRemove={modalEvent && !modalEvent.inherited ? handleRemove : undefined}
        onResetOverride={
          modalEvent?.isOverride ? handleResetOverride : undefined
        }
      />

      <style>{`
        .training-calendar-fc {
          display: flex;
          flex-direction: column;
        }
        .training-calendar-fc .fc {
          font-size: 12px;
          flex: 1;
          min-height: 0;
        }
        .training-calendar-fc .fc-event {
          cursor: pointer;
          font-size: 10px;
        }
        .training-calendar-fc .fc-event-inherited {
          border-style: dashed !important;
        }
        .training-calendar-fc .fc-event-override {
          box-shadow: inset 0 0 0 2px #4f46e5;
        }
        .training-calendar-fc .daygrid-event,
        .training-calendar-fc .fc-daygrid-event {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .training-calendar-fc .fc-daygrid-day-frame {
          min-height: 0;
        }
      `}</style>
    </div>
  );
}
