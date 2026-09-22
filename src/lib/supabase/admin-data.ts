"use client";

import { getBrowserSupabase } from "./config";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminAccount, AdminLot, AdminRecord, AuditLogEntry, BurialPlotOption, LotOwner, PlotBlockOption } from "./types";

const RECORD_COLUMNS = "burial_id,deceased_id,lot_id,interment_date,record_status,interment_status,remains_type,reference_no,service_provider,record_source,quality_notes,created_by,updated_by,updated_at";
const DECEASED_COLUMNS = "deceased_id,display_name,birth_date,death_date,public_display";
const BURIAL_WRITE_COLUMNS = "burial_id,deceased_id,lot_id,created_by,updated_by,interment_order_number,reference_no,interment_date,record_status,interment_status,remains_type,exhumation_date,service_provider,record_source,quality_notes";
const LOT_COLUMNS = "lot_id,lot_code,block_id,lot_owner_id,legacy_location_code,legacy_pa_number,status,length_m,width_m,px_loc_x,px_loc_y,location_geom,coordinate_accuracy_m,coordinate_status,coordinate_verified,updated_at";
const OWNER_COLUMNS = "lot_owner_id,first_name,middle_name,last_name,suffix,aliases,address,representative_name,representative_contact,representative_relation";

export async function getAdminRecords() {
  const client = requireClient();
  const { data: records, error } = await client.from("burial_record").select(RECORD_COLUMNS).order("updated_at", { ascending: false });
  if (error) throw error;
  if (!records?.length) return [] as AdminRecord[];

  const deceasedIds = records.map((record) => record.deceased_id);
  const lotIds = records.map((record) => record.lot_id);
  const [{ data: deceased, error: deceasedError }, { data: lots, error: lotsError }] = await Promise.all([
    client.from("deceased").select(DECEASED_COLUMNS).in("deceased_id", deceasedIds),
    client.from("lot").select(LOT_COLUMNS).in("lot_id", lotIds),
  ]);
  if (deceasedError) throw deceasedError;
  if (lotsError) throw lotsError;
  const blockIds = (lots || []).map((lot) => lot.block_id);
  const { data: blocks, error: blocksError } = blockIds.length ? await client.from("block").select("block_id,block_number,sector_id").in("block_id", blockIds) : { data: [], error: null };
  if (blocksError) throw blocksError;
  const sectorIds = (blocks || []).map((block) => block.sector_id);
  const { data: sectors, error: sectorsError } = sectorIds.length ? await client.from("sector").select("sector_id,sector_name,area_id").in("sector_id", sectorIds) : { data: [], error: null };
  if (sectorsError) throw sectorsError;
  const areaIds = (sectors || []).map((sector) => sector.area_id);
  const { data: areas, error: areasError } = areaIds.length ? await client.from("area").select("area_id,area_name").in("area_id", areaIds) : { data: [], error: null };
  if (areasError) throw areasError;

  const deceasedById = new Map((deceased || []).map((item) => [item.deceased_id, item]));
  const lotById = new Map((lots || []).map((item) => [item.lot_id, item]));
  const blockById = new Map((blocks || []).map((item) => [item.block_id, item]));
  const sectorById = new Map((sectors || []).map((item) => [item.sector_id, item]));
  const areaById = new Map((areas || []).map((item) => [item.area_id, item]));
  return records.map((record) => {
    const deceasedRecord = deceasedById.get(record.deceased_id);
    const lot = lotById.get(record.lot_id);
    const block = lot ? blockById.get(lot.block_id) : undefined;
    const sector = block ? sectorById.get(block.sector_id) : undefined;
    const area = sector ? areaById.get(sector.area_id) : undefined;
    return {
      burialId: record.burial_id,
      name: deceasedRecord?.display_name || "Unnamed record",
      deceasedId: record.deceased_id,
      lotId: record.lot_id,
      plot: lot?.lot_code || "Unassigned",
      section: area?.area_name || sector?.sector_name || "Unassigned",
      recordStatus: record.record_status,
      birthDate: deceasedRecord?.birth_date || null,
      deathDate: deceasedRecord?.death_date || null,
      publicDisplay: Boolean(deceasedRecord?.public_display),
      intermentDate: record.interment_date,
      intermentStatus: record.interment_status,
      remainsType: record.remains_type,
      referenceNo: record.reference_no,
      serviceProvider: record.service_provider || null,
      recordSource: record.record_source || null,
      qualityNotes: record.quality_notes || null,
      updatedAt: record.updated_at,
      location: parsePoint(lot?.location_geom),
      pixelLocation: lot?.px_loc_x !== null && lot?.px_loc_x !== undefined && lot?.px_loc_y !== null && lot?.px_loc_y !== undefined ? { x: lot.px_loc_x, y: lot.px_loc_y } : null,
      coordinateStatus: lot?.coordinate_status || "pending",
      coordinateVerified: Boolean(lot?.coordinate_verified),
    } satisfies AdminRecord;
  });
}

export async function getAvailableBurialPlots() {
  const client = requireClient();
  const { data: lots, error: lotError } = await client.from("lot").select("lot_id,lot_code,block_id,status").eq("status", "AVAILABLE").order("lot_code");
  if (lotError) throw lotError;
  if (!lots?.length) return [];

  const lotIds = lots.map((lot) => lot.lot_id);
  const { data: usedRows, error: usedError } = await client.from("burial_record").select("lot_id").in("lot_id", lotIds);
  if (usedError) throw usedError;
  const usedLotIds = new Set((usedRows || []).map((row) => row.lot_id));
  const unusedLots = lots.filter((lot) => !usedLotIds.has(lot.lot_id));
  if (!unusedLots.length) return [];

  const blockIds = unusedLots.map((lot) => lot.block_id);
  const { data: blocks, error: blockError } = await client.from("block").select("block_id,sector_id").in("block_id", blockIds);
  if (blockError) throw blockError;
  const sectorIds = (blocks || []).map((block) => block.sector_id);
  const { data: sectors, error: sectorError } = sectorIds.length ? await client.from("sector").select("sector_id,sector_name,area_id").in("sector_id", sectorIds) : { data: [], error: null };
  if (sectorError) throw sectorError;
  const areaIds = (sectors || []).map((sector) => sector.area_id);
  const { data: areas, error: areaError } = areaIds.length ? await client.from("area").select("area_id,area_name").in("area_id", areaIds) : { data: [], error: null };
  if (areaError) throw areaError;
  const blockById = new Map((blocks || []).map((block) => [block.block_id, block]));
  const sectorById = new Map((sectors || []).map((sector) => [sector.sector_id, sector]));
  const areaById = new Map((areas || []).map((area) => [area.area_id, area]));
  return unusedLots.map((lot) => {
    const block = blockById.get(lot.block_id);
    const sector = block ? sectorById.get(block.sector_id) : undefined;
    const area = sector ? areaById.get(sector.area_id) : undefined;
    return { lotId: lot.lot_id, lotCode: lot.lot_code, section: area?.area_name || sector?.sector_name || `Block ${lot.block_id}`, status: "AVAILABLE" } satisfies BurialPlotOption;
  });
}

export async function createBurialRecord(input: BurialRecordInput) {
  const client = requireClient();
  const userId = await getCurrentUserId(client);
  await assertAvailableLot(client, input.lotId);
  const { data: deceased, error: deceasedError } = await client.from("deceased").insert({
    display_name: input.name,
    birth_date: input.birthDate || null,
    death_date: input.deathDate || null,
    public_display: input.publicDisplay,
  }).select("deceased_id").single();
  if (deceasedError || !deceased) throw deceasedError || new Error("The deceased record could not be created.");

  const { error: burialError } = await client.from("burial_record").insert({
    deceased_id: deceased.deceased_id,
    lot_id: input.lotId,
    created_by: userId,
    updated_by: userId,
    reference_no: input.referenceNo || null,
    interment_date: input.intermentDate || null,
    record_status: input.recordStatus || "pending",
    interment_status: input.intermentStatus,
    remains_type: input.remainsType,
    service_provider: input.serviceProvider || null,
    record_source: input.recordSource || null,
    quality_notes: input.qualityNotes || null,
  });
  if (burialError) {
    await client.from("deceased").delete().eq("deceased_id", deceased.deceased_id);
    throw burialError;
  }
}

export async function updateBurialRecord(burialId: number, input: BurialRecordInput) {
  const client = requireClient();
  const userId = await getCurrentUserId(client);
  const { data: current, error: currentError } = await client.from("burial_record").select(BURIAL_WRITE_COLUMNS).eq("burial_id", burialId).single();
  if (currentError || !current) throw currentError || new Error("The burial record could not be found.");
  const { data: deceased, error: deceasedError } = await client.from("deceased").select("deceased_id,display_name,birth_date,death_date,public_display").eq("deceased_id", current.deceased_id).single();
  if (deceasedError || !deceased) throw deceasedError || new Error("The linked deceased record could not be found.");
  if (input.lotId !== current.lot_id) await assertAvailableLot(client, input.lotId);

  const { error: deceasedUpdateError } = await client.from("deceased").update({
    display_name: input.name,
    birth_date: input.birthDate || null,
    death_date: input.deathDate || null,
    public_display: input.publicDisplay,
  }).eq("deceased_id", deceased.deceased_id);
  if (deceasedUpdateError) throw deceasedUpdateError;

  const { error: burialUpdateError } = await client.from("burial_record").update({
    lot_id: input.lotId,
    updated_by: userId,
    reference_no: input.referenceNo || null,
    interment_date: input.intermentDate || null,
    record_status: input.recordStatus || "pending",
    interment_status: input.intermentStatus,
    remains_type: input.remainsType,
    service_provider: input.serviceProvider || null,
    record_source: input.recordSource || null,
    quality_notes: input.qualityNotes || null,
  }).eq("burial_id", burialId);
  if (burialUpdateError) {
    await client.from("deceased").update({
      display_name: deceased.display_name,
      birth_date: deceased.birth_date,
      death_date: deceased.death_date,
      public_display: deceased.public_display,
    }).eq("deceased_id", deceased.deceased_id);
    throw burialUpdateError;
  }
}

export async function deleteBurialRecord(burialId: number) {
  const client = requireClient();
  const { data: current, error: currentError } = await client.from("burial_record").select(BURIAL_WRITE_COLUMNS).eq("burial_id", burialId).single();
  if (currentError || !current) throw currentError || new Error("The burial record could not be found.");
  const { count, error: countError } = await client.from("burial_record").select("burial_id", { count: "exact", head: true }).eq("deceased_id", current.deceased_id);
  if (countError) throw countError;
  if (count !== 1) throw new Error("This deceased record is linked to more than one burial record and cannot be deleted here.");

  const { error: burialDeleteError } = await client.from("burial_record").delete().eq("burial_id", burialId);
  if (burialDeleteError) throw burialDeleteError;
  const { error: deceasedDeleteError } = await client.from("deceased").delete().eq("deceased_id", current.deceased_id);
  if (deceasedDeleteError) {
    await client.from("burial_record").insert(current);
    throw deceasedDeleteError;
  }
}

export async function updateBurialStatus(burialId: number, recordStatus: AdminRecord["recordStatus"]) {
  const client = requireClient();
  const userId = await getCurrentUserId(client);
  const { error } = await client.from("burial_record").update({ record_status: recordStatus, updated_by: userId }).eq("burial_id", burialId);
  if (error) throw error;
}

export async function getLotsForVerification() {
  const client = requireClient();
  const { data, error } = await client.from("lot").select(LOT_COLUMNS).order("updated_at", { ascending: false });
  if (error) throw error;
  return (data || []).map((lot) => ({ ...lot, location: parsePoint(lot.location_geom) }));
}

export async function getAdminLots() {
  const lots = await getLotsForVerification();
  return lots.map((lot) => ({
    lotId: lot.lot_id,
    lotCode: lot.lot_code,
    blockId: lot.block_id,
    lotOwnerId: lot.lot_owner_id,
    legacyLocationCode: lot.legacy_location_code,
    legacyPaNumber: lot.legacy_pa_number,
    status: lot.status,
    lengthM: lot.length_m,
    widthM: lot.width_m,
    pxLocX: lot.px_loc_x,
    pxLocY: lot.px_loc_y,
    coordinateStatus: lot.coordinate_status,
    coordinateVerified: Boolean(lot.coordinate_verified),
    location: lot.location,
    updatedAt: lot.updated_at,
  } satisfies AdminLot));
}

export async function getPlotBlocks() {
  const client = requireClient();
  const { data: blocks, error: blocksError } = await client.from("block").select("block_id,block_number,block_name,sector_id").order("block_id");
  if (blocksError) throw blocksError;
  const sectorIds = (blocks || []).map((block) => block.sector_id);
  const { data: sectors, error: sectorsError } = sectorIds.length ? await client.from("sector").select("sector_id,sector_name,area_id").in("sector_id", sectorIds) : { data: [], error: null };
  if (sectorsError) throw sectorsError;
  const areaIds = (sectors || []).map((sector) => sector.area_id);
  const { data: areas, error: areasError } = areaIds.length ? await client.from("area").select("area_id,area_name").in("area_id", areaIds) : { data: [], error: null };
  if (areasError) throw areasError;
  const sectorById = new Map((sectors || []).map((sector) => [sector.sector_id, sector]));
  const areaById = new Map((areas || []).map((area) => [area.area_id, area]));
  return (blocks || []).map((block) => {
    const sector = sectorById.get(block.sector_id);
    const area = sector ? areaById.get(sector.area_id) : undefined;
    return { blockId: block.block_id, areaName: area?.area_name || null, label: [area?.area_name, sector?.sector_name, block.block_name || `Block ${block.block_number}`].filter(Boolean).join(" · ") } satisfies PlotBlockOption;
  });
}

export async function createLot(input: LotInput) {
  const client = requireClient();
  const { error } = await client.from("lot").insert({
    block_id: input.blockId,
    lot_owner_id: input.lotOwnerId,
    lot_code: input.lotCode,
    legacy_location_code: input.legacyLocationCode || null,
    legacy_pa_number: input.legacyPaNumber || null,
    status: input.status,
    length_m: input.lengthM,
    width_m: input.widthM,
  });
  if (error) throw error;
}

export async function updateLot(lotId: number, input: LotInput) {
  const client = requireClient();
  const { error } = await client.from("lot").update({
    block_id: input.blockId,
    lot_owner_id: input.lotOwnerId,
    lot_code: input.lotCode,
    legacy_location_code: input.legacyLocationCode || null,
    legacy_pa_number: input.legacyPaNumber || null,
    status: input.status,
    length_m: input.lengthM,
    width_m: input.widthM,
  }).eq("lot_id", lotId);
  if (error) throw error;
}

export async function deleteLot(lotId: number) {
  const client = requireClient();
  const { error } = await client.from("lot").delete().eq("lot_id", lotId);
  if (error) throw error;
}

export async function updateLotVerification(lotId: number, verified: boolean, status: "pending" | "verified" | "rejected") {
  const client = requireClient();
  const { error } = await client.from("lot").update({ coordinate_verified: verified, coordinate_status: status }).eq("lot_id", lotId);
  if (error) throw error;
}

export async function getAdminAccounts() {
  const client = requireClient();
  const { data: accounts, error } = await client.from("account").select("account_id,username,role_id,is_active,account_status,created_at,approved_at").order("created_at", { ascending: false });
  if (error) throw error;
  const roleIds = (accounts || []).map((account) => account.role_id);
  const { data: roles, error: roleError } = roleIds.length ? await client.from("role").select("role_id,role_name").in("role_id", roleIds) : { data: [], error: null };
  if (roleError) throw roleError;
  const roleById = new Map((roles || []).map((item) => [item.role_id, item.role_name]));
  return (accounts || []).map((account) => ({
    accountId: account.account_id,
    username: account.username,
    role: roleById.get(account.role_id) === "ADMIN" ? "ADMIN" : "MANAGER",
    accountStatus: account.account_status,
    isActive: account.is_active,
    createdAt: account.created_at,
    approvedAt: account.approved_at,
  })) as AdminAccount[];
}

export async function getLotOwners() {
  const client = requireClient();
  const { data, error } = await client.from("lot_owner").select(OWNER_COLUMNS).order("last_name");
  if (error) throw error;
  return data || [];
}

export async function getOwnerRecords() {
  const owners = await getLotOwners();
  return owners.map((owner) => ({
    lotOwnerId: owner.lot_owner_id,
    firstName: owner.first_name,
    middleName: owner.middle_name,
    lastName: owner.last_name,
    suffix: owner.suffix,
    aliases: owner.aliases,
    address: owner.address,
    representativeName: owner.representative_name,
    representativeContact: owner.representative_contact,
    representativeRelation: owner.representative_relation,
  } satisfies LotOwner));
}

export async function createLotOwner(input: OwnerInput) {
  const client = requireClient();
  const { error } = await client.from("lot_owner").insert(ownerPayload(input));
  if (error) throw error;
}

export async function updateLotOwner(lotOwnerId: number, input: OwnerInput) {
  const client = requireClient();
  const { error } = await client.from("lot_owner").update(ownerPayload(input)).eq("lot_owner_id", lotOwnerId);
  if (error) throw error;
}

export async function deleteLotOwner(lotOwnerId: number) {
  const client = requireClient();
  const { error } = await client.from("lot_owner").delete().eq("lot_owner_id", lotOwnerId);
  if (error) throw error;
}

export async function accountAction(action: "approve" | "activate" | "deactivate" | "role", accountId: string, value?: string) {
  const client = requireClient();
  const calls = {
    approve: ["admin_approve_account", { p_account_id: accountId }],
    activate: ["admin_activate_account", { p_account_id: accountId }],
    deactivate: ["admin_deactivate_account", { p_account_id: accountId, p_account_status: value || "SUSPENDED" }],
    role: ["admin_change_account_role", { p_account_id: accountId, p_role_name: value || "MANAGER" }],
  } as const;
  const [fn, args] = calls[action];
  const { error } = await client.rpc(fn, args);
  if (error) throw error;
}

export async function getAuditLog(exportRows = false) {
  const client = requireClient();
  if (exportRows) {
    const { data, error } = await client.rpc("export_audit_log", { p_from: null, p_to: null });
    if (error) throw error;
    return (data || []) as AuditLogEntry[];
  }
  const { data, error } = await client.from("audit_log").select("audit_id,actor_account_id,action,table_name,record_id,old_values,new_values,created_at").order("created_at", { ascending: false }).limit(100);
  if (error) throw error;
  return (data || []) as AuditLogEntry[];
}

export async function getStorageStatus() {
  const client = getBrowserSupabase();
  const bucket = process.env.NEXT_PUBLIC_SUPABASE_PHOTOS_BUCKET;
  if (!client || !bucket) return { configured: false, bucket: null };
  const { error } = await client.storage.getBucket(bucket);
  return { configured: !error, bucket };
}

export type BurialRecordInput = {
  name: string;
  lotId: number;
  birthDate?: string;
  deathDate?: string;
  publicDisplay: boolean;
  intermentDate?: string;
  recordStatus?: AdminRecord["recordStatus"];
  intermentStatus: "PERMANENT" | "TEMPORARY";
  remainsType: "FRESH" | "ASH" | "BONE";
  referenceNo?: string;
  serviceProvider?: string;
  recordSource?: string;
  qualityNotes?: string;
};

export type LotInput = {
  blockId: number;
  lotOwnerId: number | null;
  lotCode: string;
  legacyLocationCode?: string;
  legacyPaNumber?: string;
  status: "AVAILABLE" | "BOOKED" | "HOLD";
  lengthM: number | null;
  widthM: number | null;
};

export type OwnerInput = {
  firstName: string;
  middleName?: string;
  lastName: string;
  suffix?: string;
  aliases?: string;
  address: string;
  representativeName?: string;
  representativeContact?: string;
  representativeRelation?: string;
};

function requireClient() {
  const client = getBrowserSupabase();
  if (!client) throw new Error("Supabase is not configured.");
  return client;
}

async function getCurrentUserId(client: SupabaseClient) {
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new Error("Your authenticated session is no longer available.");
  return data.user.id;
}

function ownerPayload(input: OwnerInput) {
  return {
    first_name: input.firstName,
    middle_name: input.middleName || null,
    last_name: input.lastName,
    suffix: input.suffix || null,
    aliases: input.aliases || null,
    address: input.address,
    representative_name: input.representativeName || null,
    representative_contact: input.representativeContact || null,
    representative_relation: input.representativeRelation || null,
  };
}

async function assertAvailableLot(client: SupabaseClient, lotId: number, ignoreBurialId?: number) {
  const { data: lot, error: lotError } = await client.from("lot").select("lot_id,status").eq("lot_id", lotId).maybeSingle();
  if (lotError) throw lotError;
  if (!lot || lot.status !== "AVAILABLE") throw new Error("That plot is no longer available.");
  let query = client.from("burial_record").select("burial_id").eq("lot_id", lotId).limit(1);
  if (ignoreBurialId) query = query.neq("burial_id", ignoreBurialId);
  const { data: used, error: usedError } = await query.maybeSingle();
  if (usedError) throw usedError;
  if (used) throw new Error("That plot already has a burial record.");
}

function parsePoint(value: unknown) {
  if (!value || typeof value !== "object" || !("coordinates" in value)) return null;
  const coordinates = (value as { coordinates?: unknown }).coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2 || typeof coordinates[0] !== "number" || typeof coordinates[1] !== "number") return null;
  return { longitude: coordinates[0], latitude: coordinates[1] };
}
