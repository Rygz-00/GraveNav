import { AdminShell } from "@/components/admin/admin-shell";
import { PlotManagementCrud } from "@/components/admin/admin-crud-pages";

export default function AdminPlotManagementRoute() { return <AdminShell active="Plot Management"><PlotManagementCrud /></AdminShell>; }
