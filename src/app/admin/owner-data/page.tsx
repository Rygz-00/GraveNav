import { AdminShell } from "@/components/admin/admin-shell";
import { OwnerDataCrud } from "@/components/admin/admin-crud-pages";

export default function AdminOwnerDataRoute() {
  return <AdminShell active="Owner data"><OwnerDataCrud /></AdminShell>;
}
