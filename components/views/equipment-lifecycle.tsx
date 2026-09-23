'use client'

import { useMemo, useState } from 'react'
import { Plus, RefreshCw } from 'lucide-react'
import { useSupabase } from '@/lib/supabase/use-supabase'
import { useQuery } from '@/lib/gbi/use-query'
import { shortDate, titleCase } from '@/lib/gbi/format'
import type { UserRole } from '@/lib/gbi/roles'
import { Modal, PageHeading, StatusBadge, ViewState } from '@/components/shared'

type Machine = { id: string; machine_number: string; machine_type: string; current_project_id: string | null; project: { name: string; site_location: string | null } | null }
type Event = { id: string; contract_machine_id: string; event_type: 'entry' | 'checkpoint' | 'exit'; event_date: string; operating_hours: number | null; mileage: number | null; actual_used_hours: number | null; actual_used_mileage: number | null; notes: string | null }
type FormState = Record<string, string>
const MACHINE_SELECT = 'id,machine_number,machine_type,current_project_id,project:current_project_id(name,site_location)'

function friendlyError(error: { message?: string } | null, type?: string) {
  const message = error?.message ?? ''
  if (/no active contract coverage/i.test(message)) return 'This machine has no active contract coverage for the selected date.'
  if (/multiple active contract coverages/i.test(message)) return 'Multiple active contracts cover this machine — contact an administrator to resolve.'
  if (/checkpoint date/i.test(message) || /entry date/i.test(message)) return message
  if (/duplicate|unique/i.test(message)) return `This machine already has a ${type ?? 'matching'} record for this contract period.`
  return message || 'Could not save the lifecycle event.'
}

export function EquipmentLifecycleView({ role, userId }: { role: UserRole; userId: string }) {
  const supabase = useSupabase()
  const [machineId, setMachineId] = useState('')
  const [eventType, setEventType] = useState<'entry' | 'checkpoint' | 'exit'>('entry')
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10))
  const [form, setForm] = useState<FormState>({ event_date: selectedDate })
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [attachment, setAttachment] = useState<File | null>(null)

  const machines = useQuery<Machine[]>(() => supabase.from('machine').select(MACHINE_SELECT).is('deleted_at', null).order('machine_number') as unknown as PromiseLike<{ data: Machine[] | null; error: unknown }>, [])
  const events = useQuery<Event[]>(() => machineId ? supabase.rpc('resolve_active_contract_machine', { p_machine_id: machineId, p_event_date: selectedDate }).then(async ({ data, error }) => { if (error || !data) return { data: [], error: error?.message ?? null }; return supabase.from('equipment_lifecycle_event_record').select('id,contract_machine_id,event_type,event_date,operating_hours,mileage,actual_used_hours,actual_used_mileage,notes').eq('contract_machine_id', data).order('event_date') }) : Promise.resolve({ data: [], error: null }), [machineId, selectedDate])
  const selectedMachine = machines.data?.find((m) => m.id === machineId)
  const eventTypes = useMemo(() => { const list = events.data ?? []; const hasEntry = list.some((e) => e.event_type === 'entry'); const hasExit = list.some((e) => e.event_type === 'exit'); return (['entry', 'checkpoint', 'exit'] as const).filter((t) => t === 'entry' ? !hasEntry : t === 'exit' ? hasEntry && !hasExit : hasEntry && !hasExit) }, [events.data])

  function openForm() { const type = eventTypes[0] ?? 'checkpoint'; setEventType(type); setForm({ event_date: selectedDate }); setMessage(''); setShowForm(true) }
  async function save() {
    if (!machineId) return setMessage('Select a machine first.')
    if (!form.operating_hours && !form.mileage) return setMessage('Enter operating hours or mileage.')
    setSaving(true); setMessage('')
    const resolved = await supabase.rpc('resolve_active_contract_machine', { p_machine_id: machineId, p_event_date: form.event_date || selectedDate })
    if (resolved.error || !resolved.data) { setMessage(friendlyError(resolved.error)); setSaving(false); return }
    const payload = { contract_machine_id: resolved.data, event_type: eventType, event_date: form.event_date || selectedDate, operating_hours: form.operating_hours ? Number(form.operating_hours) : null, mileage: form.mileage ? Number(form.mileage) : null, actual_used_hours: form.actual_used_hours ? Number(form.actual_used_hours) : null, actual_used_mileage: form.actual_used_mileage ? Number(form.actual_used_mileage) : null, notes: form.notes?.trim() || null, lessor_representative_name: form.lessor_representative_name?.trim() || null, lessor_operator_name: form.lessor_operator_name?.trim() || null, lessor_operator_role: form.lessor_operator_role?.trim() || null, lessee_representative_name: form.lessee_representative_name?.trim() || null, lessee_person_in_charge: form.lessee_person_in_charge?.trim() || null, lessee_person_in_charge_role: form.lessee_person_in_charge_role?.trim() || null, created_by: userId, updated_by: userId }
    const result = await supabase.from('equipment_lifecycle_event_record').insert(payload).select('id').single()
    setSaving(false)
    if (result.error || !result.data) { setMessage(friendlyError(result.error, eventType)); return }
    if (attachment) {
      const path = `equipment-lifecycle/${result.data.id}/${crypto.randomUUID()}-${attachment.name}`
      const upload = await supabase.storage.from('documents').upload(path, attachment, { upsert: false, contentType: attachment.type })
      if (upload.error) { setMessage(`Event saved, but the attachment could not be uploaded: ${upload.error.message}`); events.reload(); return }
      const attached = await supabase.from('attachment').insert({ entity_type: 'equipment_lifecycle_event_record', entity_id: result.data.id, file_path: path, mime_type: attachment.type, size_bytes: attachment.size, uploaded_by: userId })
      if (attached.error) { setMessage(`Event saved, but the attachment link could not be saved: ${attached.error.message}`); events.reload(); return }
    }
    setAttachment(null); setShowForm(false); events.reload()
  }
  const set = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }))

  return <div className="page-wrap"><PageHeading eyebrow="Operations" title="Equipment Lifecycle" description="Track every hire from entry confirmation through checkpoints to exit." action={<button className="button button-primary" disabled={!machineId || eventTypes.length === 0} onClick={openForm}><Plus size={15} /> Add event</button>} />
    <section className="panel lifecycle-selector"><div className="form-grid"><label><span>Machine</span><select value={machineId} onChange={(e) => setMachineId(e.target.value)}><option value="">Select machine</option>{(machines.data ?? []).map((m) => <option key={m.id} value={m.id}>{m.machine_number} · {m.machine_type}</option>)}</select></label><label><span>Coverage date</span><input type="date" value={selectedDate} onChange={(e) => { setSelectedDate(e.target.value); setForm((f) => ({ ...f, event_date: e.target.value })) }} /></label></div></section>
    <ViewState status={machines.status} error={machines.error} isEmpty={false} title="machines" emptyText="No machines are available." onRetry={machines.reload}><section className="panel"><div className="panel-heading"><div><h3>{selectedMachine ? `${selectedMachine.machine_number} lifecycle` : 'Select a machine'}</h3><p>{selectedMachine?.project?.name ?? 'Choose a machine to view its active rental trail.'}</p></div>{machineId && <button className="button button-secondary button-small" onClick={events.reload}><RefreshCw size={13} /> Refresh</button>}</div>{machineId && <div className="lifecycle-timeline">{(events.data ?? []).map((event) => <div className="lifecycle-event" key={event.id}><div className={`lifecycle-dot ${event.event_type}`} /><div><strong>{titleCase(event.event_type)}</strong><span>{shortDate(event.event_date)} · {event.operating_hours != null ? `${event.operating_hours} h` : ''}{event.mileage != null ? ` · ${event.mileage} km` : ''}</span>{event.notes && <p>{event.notes}</p>}</div><StatusBadge tone={event.event_type === 'exit' ? 'green' : event.event_type === 'entry' ? 'blue' : 'amber'}>{titleCase(event.event_type)}</StatusBadge></div>)}</div>}</section></ViewState>
    {showForm && <Modal open={showForm} onClose={() => setShowForm(false)} eyebrow="Rental lifecycle" title={`${titleCase(eventType)} confirmation`} subtitle={selectedMachine?.machine_number}><div className="form-grid"><label><span>Event type</span><select value={eventType} onChange={(e) => setEventType(e.target.value as typeof eventType)}>{eventTypes.map((type) => <option key={type} value={type}>{titleCase(type)}</option>)}</select></label><label><span>Event date</span><input type="date" value={form.event_date ?? selectedDate} onChange={(e) => set('event_date', e.target.value)} /></label><label><span>Operating hours</span><input type="number" min="0" step="0.01" value={form.operating_hours ?? ''} onChange={(e) => set('operating_hours', e.target.value)} /></label><label><span>Mileage</span><input type="number" min="0" step="0.01" value={form.mileage ?? ''} onChange={(e) => set('mileage', e.target.value)} /></label>{eventType === 'exit' && <><label><span>Actual used hours</span><input type="number" min="0" step="0.01" value={form.actual_used_hours ?? ''} onChange={(e) => set('actual_used_hours', e.target.value)} /></label><label><span>Actual used mileage</span><input type="number" min="0" step="0.01" value={form.actual_used_mileage ?? ''} onChange={(e) => set('actual_used_mileage', e.target.value)} /></label></>}<label className="form-span-2"><span>Notes</span><textarea value={form.notes ?? ''} onChange={(e) => set('notes', e.target.value)} /></label><label className="form-span-2"><span>Photo or signed document</span><input type="file" accept="image/*,.pdf" onChange={(e) => setAttachment(e.target.files?.[0] ?? null)} /></label><label><span>Lessor representative</span><input value={form.lessor_representative_name ?? ''} onChange={(e) => set('lessor_representative_name', e.target.value)} /></label><label><span>Lessor operator</span><input value={form.lessor_operator_name ?? ''} onChange={(e) => set('lessor_operator_name', e.target.value)} /></label><label><span>Lessee representative</span><input value={form.lessee_representative_name ?? ''} onChange={(e) => set('lessee_representative_name', e.target.value)} /></label><label><span>Lessee person in charge</span><input value={form.lessee_person_in_charge ?? ''} onChange={(e) => set('lessee_person_in_charge', e.target.value)} /></label></div>{message && <p className="form-error">{message}</p>}<div className="modal-footer"><button className="button button-secondary" onClick={() => setShowForm(false)}>Cancel</button><button className="button button-primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save event'}</button></div></Modal>}
  </div>
}
