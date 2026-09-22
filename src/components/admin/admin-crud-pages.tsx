"use client";

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/table";
import { AdminPageFrame } from "@/components/admin/admin-page-content";
import { createBurialRecord, createLot, createLotOwner, deleteBurialRecord, deleteLot, deleteLotOwner, getAdminLots, getAdminRecords, getAvailableBurialPlots, getOwnerRecords, getPlotBlocks, updateBurialRecord, updateLot, updateLotOwner, type BurialRecordInput, type LotInput, type OwnerInput } from "@/lib/supabase/admin-data";
import { schematicZones } from "@/lib/map-layout";
import type { AdminLot, AdminRecord, BurialPlotOption, LotOwner, PlotBlockOption } from "@/lib/supabase/types";

const knownGardenNames = schematicZones.map((zone) => zone.label);

function sameGarden(left: string | null | undefined, right: string) {
  return Boolean(left && left.trim().toLowerCase().replace(/\s+garden$/, "") === right.trim().toLowerCase().replace(/\s+garden$/, ""));
}

export function BurialRecordsCrud({ showAdd = false, selectedRecordId = "" }: { showAdd?: boolean; selectedRecordId?: string }) {
  const [records, setRecords] = useState<AdminRecord[]>([]);
  const [plots, setPlots] = useState<BurialPlotOption[]>([]);
  const [query, setQuery] = useState("");
  const [formOpen, setFormOpen] = useState(showAdd);
  const [editing, setEditing] = useState<AdminRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try { const [nextRecords, nextPlots] = await Promise.all([getAdminRecords(), getAvailableBurialPlots()]); setRecords(nextRecords); setPlots(nextPlots); setError(""); } catch (reason) { setError(errorMessage(reason)); } finally { setLoading(false); }
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => { void refresh(); }, 0); return () => window.clearTimeout(timer); }, [refresh]);

  const filtered = records.filter((record) => [record.name, record.plot, record.section, String(record.burialId)].some((value) => value.toLowerCase().includes(query.toLowerCase().trim())));
  const selected = records.find((record) => String(record.burialId) === selectedRecordId);

  async function changeStatus(id: number, status: AdminRecord["recordStatus"]) {
    try { await updateBurialRecord(id, recordInputFromRecord(records.find((record) => record.burialId === id)!, { recordStatus: status })); await refresh(); setMessage("Burial record status updated."); } catch (reason) { setError(errorMessage(reason)); }
  }

  async function removeRecord() {
    if (!deleteTarget) return;
    setBusy(true);
    try { await deleteBurialRecord(deleteTarget.burialId); setDeleteTarget(null); setMessage("Burial record deleted."); await refresh(); } catch (reason) { setError(errorMessage(reason)); } finally { setBusy(false); }
  }

  return <AdminPageFrame title="Burial Records" description="Create, edit, archive, and remove operational records from the protected Supabase database." actions={<Button icon="plus" onClick={() => { setEditing(null); setFormOpen(true); }}>Add burial record</Button>}>
    {error ? <DataError message={error} /> : null}
    {message ? <Alert icon="check" title="Record update" variant="success">{message}</Alert> : null}
    {selected ? <Alert title={"Selected burial " + selected.burialId} variant="info">{selected.name} · {selected.plot}</Alert> : null}
    {formOpen ? <BurialRecordForm key={editing?.burialId ?? "new"} availablePlots={plots} record={editing} onCancel={() => { setFormOpen(false); setEditing(null); }} onSaved={async () => { setFormOpen(false); setEditing(null); setMessage(editing ? "Burial record updated." : "Burial record created."); await refresh(); }} /> : null}
    <Card><CardHeader><CardTitle>Operational records</CardTitle><Badge variant="info">{loading ? "Loading…" : filtered.length + " shown"}</Badge></CardHeader><CardContent><Input aria-label="Search burial records" icon="search" onChange={(event) => setQuery(event.target.value)} placeholder="Search names, plots, sections, or IDs" value={query} /></CardContent>{loading ? <CardContent><p className="admin-card-muted">Loading records…</p></CardContent> : filtered.length ? <Table caption="Local burial records"><TableHead><TableRow><TableHeaderCell>Record</TableHeaderCell><TableHeaderCell>Plot</TableHeaderCell><TableHeaderCell>Status</TableHeaderCell><TableHeaderCell>Public</TableHeaderCell><TableHeaderCell>Actions</TableHeaderCell></TableRow></TableHead><TableBody>{filtered.map((record) => <TableRow key={record.burialId}><TableCell><strong>{record.name}</strong><span className="table-secondary">#{record.burialId} · {record.section}</span></TableCell><TableCell>{record.plot}</TableCell><TableCell><Badge variant={record.recordStatus === "active" ? "success" : record.recordStatus === "pending" ? "warning" : "neutral"}>{record.recordStatus}</Badge></TableCell><TableCell>{record.publicDisplay ? "Yes" : "No"}</TableCell><TableCell><div className="table-actions"><Button size="sm" variant="secondary" onClick={() => { setEditing(record); setFormOpen(true); }}>Edit</Button>{record.recordStatus === "active" ? <Button size="sm" variant="quiet" onClick={() => void changeStatus(record.burialId, "archived")}>Archive</Button> : <Button size="sm" variant="quiet" onClick={() => void changeStatus(record.burialId, "active")}>Activate</Button>}<Button disabled={busy} size="sm" variant="danger" onClick={() => setDeleteTarget(record)}>Delete</Button></div></TableCell></TableRow>)}</TableBody></Table> : <CardContent><EmptyState description="Create a record by selecting an available plot." icon="records" title="No burial records" /></CardContent>}</Card>
    <ConfirmationDialog open={Boolean(deleteTarget)} title="Delete burial record?" description={<p>This removes the burial record and its linked deceased row. The database will reject deletion if the lot or deceased record is still referenced.</p>} confirmLabel={busy ? "Deleting…" : "Delete record"} variant="danger" onConfirm={() => void removeRecord()} onClose={() => { if (!busy) setDeleteTarget(null); }} />
  </AdminPageFrame>;
}

function BurialRecordForm({ record, availablePlots, onCancel, onSaved }: { record: AdminRecord | null; availablePlots: BurialPlotOption[]; onCancel: () => void; onSaved: () => Promise<void> }) {
  const initial = record ? recordInputFromRecord(record) : { name: "", lotId: 0, birthDate: "", deathDate: "", publicDisplay: false, intermentDate: "", recordStatus: "pending" as const, intermentStatus: "PERMANENT" as const, remainsType: "FRESH" as const, referenceNo: "", serviceProvider: "", recordSource: "", qualityNotes: "" };
  const plotOptions: Array<[string, string]> = [
    ...(record ? [[String(record.lotId), `Current: ${record.plot} — ${record.section}`] as [string, string]] : []),
    ...availablePlots.filter((plot) => !record || plot.lotId !== record.lotId).map((plot) => [String(plot.lotId), `${plot.lotCode} — ${plot.section} — ${plot.status}`] as [string, string]),
  ];
  const [form, setForm] = useState<BurialRecordInput>(initial);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  function setField<K extends keyof BurialRecordInput>(key: K, value: BurialRecordInput[K]) { setForm((current) => ({ ...current, [key]: value })); }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    if (!form.name.trim() || !Number.isInteger(form.lotId) || form.lotId <= 0) { setError("A name and an available plot must be selected."); return; }
    if (form.birthDate && form.deathDate && form.birthDate > form.deathDate) { setError("Birth date cannot be later than death date."); return; }
    setSaving(true);
    try { if (record) await updateBurialRecord(record.burialId, { ...form, name: form.name.trim() }); else await createBurialRecord({ ...form, name: form.name.trim() }); await onSaved(); } catch (reason) { setError(errorMessage(reason)); } finally { setSaving(false); }
  }
  return <Card className="admin-form-card"><CardHeader><CardTitle>{record ? "Edit burial record" : "Add burial record"}</CardTitle><Badge variant="info">Protected database operation</Badge></CardHeader><CardContent><form className="admin-form" onSubmit={(event) => void submit(event)}><div className="filter-grid"><Input id="burial-display-name" label="Display name" onChange={(event) => setField("name", event.target.value)} required value={form.name} /><PlotPicker value={form.lotId ? String(form.lotId) : ""} onChange={(value) => setField("lotId", Number(value))} options={plotOptions} hint={record ? "The current plot remains available for this edit." : "Only available plots without an existing burial are shown."} /></div><div className="filter-grid"><Input id="burial-birth-date" label="Birth date" onChange={(event) => setField("birthDate", event.target.value)} type="date" value={form.birthDate || ""} /><Input id="burial-death-date" label="Death date" onChange={(event) => setField("deathDate", event.target.value)} type="date" value={form.deathDate || ""} /></div><div className="filter-grid"><Input id="burial-interment-date" label="Interment date" onChange={(event) => setField("intermentDate", event.target.value)} type="date" value={form.intermentDate || ""} /><SelectField id="burial-record-status" label="Record status" value={form.recordStatus || "pending"} onChange={(value) => setField("recordStatus", value as AdminRecord["recordStatus"])} options={[["pending", "Pending"], ["active", "Active"], ["archived", "Archived"]]} /></div><div className="filter-grid"><SelectField id="burial-interment-status" label="Interment status" value={form.intermentStatus} onChange={(value) => setField("intermentStatus", value as BurialRecordInput["intermentStatus"])} options={[["PERMANENT", "Permanent"], ["TEMPORARY", "Temporary"]]} /><SelectField id="burial-remains-type" label="Remains type" value={form.remainsType} onChange={(value) => setField("remainsType", value as BurialRecordInput["remainsType"])} options={[["FRESH", "Fresh"], ["ASH", "Ash"], ["BONE", "Bone"]]} /></div><label className="checkbox-field"><input checked={form.publicDisplay} onChange={(event) => setField("publicDisplay", event.target.checked)} type="checkbox" /><span>Show this record in the active public visitor view</span></label><label className="input-field" htmlFor="burial-quality-notes"><span className="input-label">Quality notes</span><textarea className="input-control" id="burial-quality-notes" onChange={(event) => setField("qualityNotes", event.target.value)} rows={3} value={form.qualityNotes || ""} /></label>{error ? <DataError message={error} /> : null}<div className="admin-form-actions"><Button onClick={onCancel} type="button" variant="secondary">Cancel</Button><Button disabled={saving || (!record && !availablePlots.length) || !form.lotId} icon="check" type="submit">{saving ? "Saving…" : record ? "Save changes" : "Create record"}</Button></div></form></CardContent></Card>;
}

export function PlotManagementCrud() {
  const [lots, setLots] = useState<AdminLot[]>([]);
  const [owners, setOwners] = useState<LotOwner[]>([]);
  const [blocks, setBlocks] = useState<PlotBlockOption[]>([]);
  const [editing, setEditing] = useState<AdminLot | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AdminLot | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => { try { const [nextLots, nextOwners, nextBlocks] = await Promise.all([getAdminLots(), getOwnerRecords(), getPlotBlocks()]); setLots(nextLots); setOwners(nextOwners); setBlocks(nextBlocks); setError(""); } catch (reason) { setError(errorMessage(reason)); } }, []);
  useEffect(() => { const timer = window.setTimeout(() => { void refresh(); }, 0); return () => window.clearTimeout(timer); }, [refresh]);
  const available = lots.filter((lot) => lot.status === "AVAILABLE").length;
  const booked = lots.filter((lot) => lot.status === "BOOKED").length;
  const blockLabels = new Map(blocks.map((block) => [block.blockId, block.label]));
  const ownerLabels = new Map(owners.map((owner) => [owner.lotOwnerId, [owner.firstName, owner.middleName, owner.lastName].filter(Boolean).join(" ")]));
  async function removeLot() { if (!deleteTarget) return; setBusy(true); try { await deleteLot(deleteTarget.lotId); setDeleteTarget(null); setMessage("Plot deleted."); await refresh(); } catch (reason) { setError(errorMessage(reason)); } finally { setBusy(false); } }
  return <AdminPageFrame title="Plot Management" description="Create, edit, and remove plot records while preserving existing coordinate data." actions={<Button icon="plus" onClick={() => { setEditing(null); setFormOpen(true); }}>Add plot</Button>}>
    {error ? <DataError message={error} /> : null}{message ? <Alert icon="check" title="Plot update" variant="success">{message}</Alert> : null}
    {formOpen ? <LotForm key={editing?.lotId ?? "new"} lot={editing} blocks={blocks} owners={owners} onCancel={() => { setFormOpen(false); setEditing(null); }} onSaved={async () => { setFormOpen(false); setEditing(null); setMessage(editing ? "Plot updated." : "Plot created."); await refresh(); }} /> : null}
    <div className="admin-summary-grid"><SummaryCard label="Known plots" value={lots.length} /><SummaryCard label="Available" value={available} /><SummaryCard label="Booked" value={booked} /></div>
    <Card><CardHeader><CardTitle>Local plots</CardTitle><Badge variant="info">{lots.length} loaded</Badge></CardHeader>{lots.length ? <Table caption="Local plots"><TableHead><TableRow><TableHeaderCell>Plot</TableHeaderCell><TableHeaderCell>Block</TableHeaderCell><TableHeaderCell>Owner</TableHeaderCell><TableHeaderCell>Status</TableHeaderCell><TableHeaderCell>Coordinates</TableHeaderCell><TableHeaderCell>Actions</TableHeaderCell></TableRow></TableHead><TableBody>{lots.map((lot) => <TableRow key={lot.lotId}><TableCell className="strong-cell">{lot.lotCode}<span className="table-secondary">{lot.legacyLocationCode || "No original reference"}</span></TableCell><TableCell>{blockLabels.get(lot.blockId) || `Block ${lot.blockId}`}</TableCell><TableCell>{lot.lotOwnerId ? ownerLabels.get(lot.lotOwnerId) || "Unknown owner" : "Unassigned"}</TableCell><TableCell><Badge variant={lot.status === "AVAILABLE" ? "success" : lot.status === "BOOKED" ? "warning" : "neutral"}>{lot.status}</Badge></TableCell><TableCell>{lot.location ? "GPS " + (lot.coordinateVerified ? "verified" : "unverified") : lot.pxLocX !== null && lot.pxLocY !== null ? "Image-map" : "Unavailable"}</TableCell><TableCell><div className="table-actions"><Button size="sm" variant="secondary" onClick={() => { setEditing(lot); setFormOpen(true); }}>Edit</Button><Button disabled={busy} size="sm" variant="danger" onClick={() => setDeleteTarget(lot)}>Delete</Button></div></TableCell></TableRow>)}</TableBody></Table> : <CardContent><EmptyState description="Add a plot after its garden block exists in Supabase." icon="grid" title="No plots found" /></CardContent>}</Card>
    <ConfirmationDialog open={Boolean(deleteTarget)} title="Delete plot?" description={<p>Plots referenced by a burial record cannot be deleted. Existing coordinates are preserved during edits but are not created by this form.</p>} confirmLabel={busy ? "Deleting…" : "Delete plot"} variant="danger" onConfirm={() => void removeLot()} onClose={() => { if (!busy) setDeleteTarget(null); }} />
  </AdminPageFrame>;
}

function LotForm({ lot, blocks, owners, onCancel, onSaved }: { lot: AdminLot | null; blocks: PlotBlockOption[]; owners: LotOwner[]; onCancel: () => void; onSaved: () => Promise<void> }) {
  const initialBlock = lot ? blocks.find((block) => block.blockId === lot.blockId) : undefined;
  const [selectedGarden, setSelectedGarden] = useState(initialBlock?.areaName || "");
  const [form, setForm] = useState<LotInput>(() => lot ? lotInputFromLot(lot) : { blockId: 0, lotOwnerId: null, lotCode: "", legacyLocationCode: "", legacyPaNumber: "", status: "AVAILABLE", lengthM: null, widthM: null });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  function setField<K extends keyof LotInput>(key: K, value: LotInput[K]) { setForm((current) => ({ ...current, [key]: value })); }
  const filteredBlocks = selectedGarden ? blocks.filter((block) => sameGarden(block.areaName, selectedGarden)) : blocks;
  function selectGarden(value: string) { setSelectedGarden(value); const firstBlock = blocks.find((block) => sameGarden(block.areaName, value)); setField("blockId", firstBlock?.blockId || 0); }
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setError(""); if (!form.blockId || !form.lotCode.trim()) { setError("Select a garden and an existing block, then enter a plot label or code."); return; } if ((form.lengthM !== null && form.lengthM <= 0) || (form.widthM !== null && form.widthM <= 0)) { setError("Plot dimensions must be greater than zero."); return; } setSaving(true); try { const input = { ...form, lotCode: form.lotCode.trim(), legacyLocationCode: form.legacyLocationCode?.trim() || "" }; await (lot ? updateLot(lot.lotId, input) : createLot(input)); await onSaved(); } catch (reason) { setError(errorMessage(reason)); } finally { setSaving(false); } }
  return <Card className="admin-form-card"><CardHeader><CardTitle>{lot ? "Edit plot" : "Add plot"}</CardTitle><Badge variant="info">Coordinate-safe operation</Badge></CardHeader><CardContent><form className="admin-form" onSubmit={(event) => void submit(event)}><div className="filter-grid"><SelectField id="plot-garden" label="Garden / area" value={selectedGarden} onChange={selectGarden} options={[["", "Select a garden / area"], ...knownGardenNames.map((name) => [name, name] as [string, string])]} hint="Choose the garden shown on the supplied cemetery map." /><Input id="plot-code" label="Plot label or code" hint="The visible identifier used by administrators." onChange={(event) => setField("lotCode", event.target.value)} required value={form.lotCode} /></div><div className="filter-grid"><SelectField id="plot-block" label="Block within garden" value={String(form.blockId || "")} onChange={(value) => setField("blockId", Number(value))} options={[["", selectedGarden ? filteredBlocks.length ? "Select an existing block" : "No blocks loaded for this garden" : "Select a garden first"], ...filteredBlocks.map((block) => [String(block.blockId), block.label] as [string, string])]} hint="Only real blocks from Supabase can be selected; the internal block ID is kept hidden." /><div>{selectedGarden && !filteredBlocks.length ? <Alert icon="info" title="No blocks loaded">The garden name is known from the map, but its official database blocks have not been loaded yet.</Alert> : null}</div></div><div className="filter-grid"><Input id="plot-legacy-location" label="Original location reference (optional)" hint="Use the old Lot Location value when this plot has an older record. Leave blank for a new plot." onChange={(event) => setField("legacyLocationCode", event.target.value)} value={form.legacyLocationCode || ""} /><Input id="plot-legacy-pa" label="Old PA number (optional)" hint="Leave blank if no confirmed value exists." onChange={(event) => setField("legacyPaNumber", event.target.value)} value={form.legacyPaNumber || ""} /></div><div className="filter-grid"><OwnerPicker owners={owners} value={form.lotOwnerId ? String(form.lotOwnerId) : ""} onChange={(value) => setField("lotOwnerId", value ? Number(value) : null)} /><SelectField id="plot-status" label="Plot availability" value={form.status} onChange={(value) => setField("status", value as LotInput["status"])} options={[["AVAILABLE", "Available for a new burial"], ["BOOKED", "Reserved or assigned"], ["HOLD", "Temporarily unavailable"]]} /></div><div className="filter-grid"><Input id="plot-length" label="Plot length (m)" min="0" onChange={(event) => setField("lengthM", optionalNumber(event.target.value))} step="0.01" type="number" value={form.lengthM ?? ""} /><Input id="plot-width" label="Plot width (m)" min="0" onChange={(event) => setField("widthM", optionalNumber(event.target.value))} step="0.01" type="number" value={form.widthM ?? ""} /></div><Alert icon="info" title="Coordinates preserved">This form does not fabricate or overwrite GPS or image-map coordinates.</Alert>{error ? <DataError message={error} /> : null}<div className="admin-form-actions"><Button onClick={onCancel} type="button" variant="secondary">Cancel</Button><Button disabled={saving || !filteredBlocks.length} icon="check" type="submit">{saving ? "Saving…" : lot ? "Save changes" : "Create plot"}</Button></div></form></CardContent></Card>;
}

export function OwnerDataCrud() {
  const [owners, setOwners] = useState<LotOwner[]>([]);
  const [editing, setEditing] = useState<LotOwner | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<LotOwner | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => { try { setOwners(await getOwnerRecords()); setError(""); } catch (reason) { setError(errorMessage(reason)); } }, []);
  useEffect(() => { const timer = window.setTimeout(() => { void refresh(); }, 0); return () => window.clearTimeout(timer); }, [refresh]);
  async function removeOwner() { if (!deleteTarget) return; setBusy(true); try { await deleteLotOwner(deleteTarget.lotOwnerId); setDeleteTarget(null); setMessage("Owner deleted. Any linked plots are now unassigned."); await refresh(); } catch (reason) { setError(errorMessage(reason)); } finally { setBusy(false); } }
  return <AdminPageFrame title="Owner data" description="Create, edit, and remove protected lot-owner records used by cemetery operations." actions={<Button icon="plus" onClick={() => { setEditing(null); setFormOpen(true); }}>Add owner</Button>}>
    {error ? <DataError message={error} /> : null}{message ? <Alert icon="check" title="Owner update" variant="success">{message}</Alert> : null}<Alert icon="shield" title="Restricted operational data" variant="warning">This surface remains available only inside the protected ADMIN/MANAGER workspace and is never included in visitor views.</Alert>
    {formOpen ? <OwnerForm key={editing?.lotOwnerId ?? "new"} owner={editing} onCancel={() => { setFormOpen(false); setEditing(null); }} onSaved={async () => { setFormOpen(false); setEditing(null); setMessage(editing ? "Owner updated." : "Owner created."); await refresh(); }} /> : null}
    <Card><CardHeader><CardTitle>Lot owners</CardTitle><Badge variant="info">{owners.length} loaded</Badge></CardHeader>{owners.length ? <Table caption="Approved lot owners"><TableHead><TableRow><TableHeaderCell>Owner</TableHeaderCell><TableHeaderCell>Aliases</TableHeaderCell><TableHeaderCell>Address</TableHeaderCell><TableHeaderCell>Representative</TableHeaderCell><TableHeaderCell>Actions</TableHeaderCell></TableRow></TableHead><TableBody>{owners.map((owner) => <TableRow key={owner.lotOwnerId}><TableCell><strong>{[owner.firstName, owner.middleName, owner.lastName, owner.suffix].filter(Boolean).join(" ")}</strong></TableCell><TableCell>{owner.aliases || "None recorded"}</TableCell><TableCell>{owner.address}</TableCell><TableCell>{owner.representativeName ? owner.representativeName + (owner.representativeContact ? " · " + owner.representativeContact : "") : "None recorded"}</TableCell><TableCell><div className="table-actions"><Button size="sm" variant="secondary" onClick={() => { setEditing(owner); setFormOpen(true); }}>Edit</Button><Button disabled={busy} size="sm" variant="danger" onClick={() => setDeleteTarget(owner)}>Delete</Button></div></TableCell></TableRow>)}</TableBody></Table> : <CardContent><EmptyState description="Add owner data when an authorized administrator is ready to manage it." icon="userSearch" title="No owner data" /></CardContent>}</Card>
    <ConfirmationDialog open={Boolean(deleteTarget)} title="Delete owner?" description={<p>Deleting an owner keeps the plots but clears their owner assignment. This action is recorded in the audit log.</p>} confirmLabel={busy ? "Deleting…" : "Delete owner"} variant="danger" onConfirm={() => void removeOwner()} onClose={() => { if (!busy) setDeleteTarget(null); }} />
  </AdminPageFrame>;
}

function OwnerForm({ owner, onCancel, onSaved }: { owner: LotOwner | null; onCancel: () => void; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState<OwnerInput>(() => owner ? ownerInputFromOwner(owner) : { firstName: "", middleName: "", lastName: "", suffix: "", aliases: "", address: "", representativeName: "", representativeContact: "", representativeRelation: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  function setField<K extends keyof OwnerInput>(key: K, value: OwnerInput[K]) { setForm((current) => ({ ...current, [key]: value })); }
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setError(""); if (!form.firstName.trim() || !form.lastName.trim() || !form.address.trim()) { setError("First name, last name, and address are required."); return; } setSaving(true); try { const input = { ...form, firstName: form.firstName.trim(), lastName: form.lastName.trim(), address: form.address.trim() }; await (owner ? updateLotOwner(owner.lotOwnerId, input) : createLotOwner(input)); await onSaved(); } catch (reason) { setError(errorMessage(reason)); } finally { setSaving(false); } }
  return <Card className="admin-form-card"><CardHeader><CardTitle>{owner ? "Edit owner" : "Add owner"}</CardTitle><Badge variant="info">Protected database operation</Badge></CardHeader><CardContent><form className="admin-form" onSubmit={(event) => void submit(event)}><div className="filter-grid"><Input id="owner-first-name" label="First name" onChange={(event) => setField("firstName", event.target.value)} required value={form.firstName} /><Input id="owner-middle-name" label="Middle name" onChange={(event) => setField("middleName", event.target.value)} value={form.middleName || ""} /></div><div className="filter-grid"><Input id="owner-last-name" label="Last name" onChange={(event) => setField("lastName", event.target.value)} required value={form.lastName} /><Input id="owner-suffix" label="Suffix" onChange={(event) => setField("suffix", event.target.value)} value={form.suffix || ""} /></div><Input id="owner-aliases" label="Aliases" onChange={(event) => setField("aliases", event.target.value)} value={form.aliases || ""} /><label className="input-field" htmlFor="owner-address"><span className="input-label">Address</span><textarea className="input-control" id="owner-address" onChange={(event) => setField("address", event.target.value)} required rows={3} value={form.address} /></label><div className="filter-grid"><Input id="owner-representative" label="Representative name" onChange={(event) => setField("representativeName", event.target.value)} value={form.representativeName || ""} /><Input id="owner-relation" label="Representative relation" onChange={(event) => setField("representativeRelation", event.target.value)} value={form.representativeRelation || ""} /></div><Input id="owner-contact" label="Representative contact" onChange={(event) => setField("representativeContact", event.target.value)} value={form.representativeContact || ""} />{error ? <DataError message={error} /> : null}<div className="admin-form-actions"><Button onClick={onCancel} type="button" variant="secondary">Cancel</Button><Button disabled={saving} icon="check" type="submit">{saving ? "Saving…" : owner ? "Save changes" : "Create owner"}</Button></div></form></CardContent></Card>;
}

function OwnerPicker({ value, owners, onChange }: { value: string; owners: LotOwner[]; onChange: (value: string) => void }) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.toLowerCase().trim();
  const matches = owners.filter((owner) => [owner.firstName, owner.middleName, owner.lastName, owner.suffix, owner.aliases].filter(Boolean).join(" ").toLowerCase().includes(normalizedQuery));
  const selected = owners.find((owner) => String(owner.lotOwnerId) === value);
  const hasSearch = normalizedQuery.length >= 2;
  const ownerName = (owner: LotOwner) => [owner.firstName, owner.middleName, owner.lastName, owner.suffix].filter(Boolean).join(" ");
  function selectOwner(owner: LotOwner) { onChange(String(owner.lotOwnerId)); setQuery(ownerName(owner)); }
  return <div className="input-field"><span className="input-label">Plot owner (optional)</span><input aria-label="Search plot owners" className="input-control" id="plot-owner-search" onChange={(event) => setQuery(event.target.value)} placeholder="Search owner name or alias" value={query} />{selected ? <span className="input-hint">Selected owner: <strong>{ownerName(selected)}</strong> <button className="text-button" onClick={() => { onChange(""); setQuery(""); }} type="button">Clear</button></span> : null}{hasSearch && matches.length ? <div aria-label="Matching plot owners" className="owner-picker-results" role="listbox">{matches.slice(0, 20).map((owner) => <button aria-selected={owner.lotOwnerId === selected?.lotOwnerId} className="text-button" key={owner.lotOwnerId} onClick={() => selectOwner(owner)} role="option" type="button">{ownerName(owner)}</button>)}</div> : null}{hasSearch && !matches.length ? <span className="input-hint">No owners found. <Link className="subtle-link" href="/admin/owner-data">Create a new owner in Owner Data.</Link></span> : null}{!owners.length && !hasSearch ? <span className="input-hint">No owners found. <Link className="subtle-link" href="/admin/owner-data">Create a new owner in Owner Data.</Link></span> : null}<span className="input-hint">Type at least 2 characters to search. One owner may have multiple plots.</span></div>;
}

function PlotPicker({ value, options, onChange, hint }: { value: string; options: Array<[string, string]>; onChange: (value: string) => void; hint?: ReactNode }) {
  return <label className="input-field" htmlFor="burial-plot"><span className="input-label">Available plot</span><select aria-label="Select available plot" className="input-control" id="burial-plot" onChange={(event) => onChange(event.target.value)} value={value}><option value="">{options.length ? "Select an available plot" : "No unused plots available"}</option>{options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}</select>{hint ? <span className="input-hint">{hint}</span> : null}</label>;
}
function SelectField({ id, label, value, options, onChange, hint }: { id: string; label: string; value: string; options: Array<[string, string]>; onChange: (value: string) => void; hint?: ReactNode }) { return <label className="input-field" htmlFor={id}><span className="input-label">{label}</span><select className="input-control" id={id} onChange={(event) => onChange(event.target.value)} value={value}>{options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}</select>{hint ? <span className="input-hint">{hint}</span> : null}</label>; }
function SummaryCard({ label, value }: { label: string; value: number }) { return <Card className="summary-card"><div className="metric-card__top"><span>{label}</span></div><p className="metric-value">{value.toLocaleString()}</p></Card>; }
function DataError({ message }: { message: string }) { return <Alert icon="alert" title="Supabase data connection unavailable" variant="danger">{message}</Alert>; }
function errorMessage(reason: unknown) { return reason instanceof Error ? reason.message : "The protected operation could not be completed."; }
function optionalNumber(value: string) { return value.trim() ? Number(value) : null; }
function recordInputFromRecord(record: AdminRecord, override: Partial<BurialRecordInput> = {}): BurialRecordInput { return { name: record.name, lotId: record.lotId, birthDate: record.birthDate || "", deathDate: record.deathDate || "", publicDisplay: record.publicDisplay, intermentDate: record.intermentDate || "", recordStatus: record.recordStatus, intermentStatus: record.intermentStatus as BurialRecordInput["intermentStatus"], remainsType: record.remainsType as BurialRecordInput["remainsType"], referenceNo: record.referenceNo || "", serviceProvider: record.serviceProvider || "", recordSource: record.recordSource || "", qualityNotes: record.qualityNotes || "", ...override }; }
function lotInputFromLot(lot: AdminLot): LotInput { return { blockId: lot.blockId, lotOwnerId: lot.lotOwnerId, lotCode: lot.lotCode, legacyLocationCode: lot.legacyLocationCode || "", legacyPaNumber: lot.legacyPaNumber || "", status: lot.status, lengthM: lot.lengthM, widthM: lot.widthM }; }
function ownerInputFromOwner(owner: LotOwner): OwnerInput { return { firstName: owner.firstName, middleName: owner.middleName || "", lastName: owner.lastName, suffix: owner.suffix || "", aliases: owner.aliases || "", address: owner.address, representativeName: owner.representativeName || "", representativeContact: owner.representativeContact || "", representativeRelation: owner.representativeRelation || "" }; }
