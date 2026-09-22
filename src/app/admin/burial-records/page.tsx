import { AdminShell } from "@/components/admin/admin-shell";
import { BurialRecordsCrud } from "@/components/admin/admin-crud-pages";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AdminBurialRecordsRoute({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  return <AdminShell active="Burial Records"><BurialRecordsCrud showAdd={getParam(params?.add) === "1"} selectedRecordId={getParam(params?.record)} /></AdminShell>;
}

function getParam(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] || "" : value || ""; }
