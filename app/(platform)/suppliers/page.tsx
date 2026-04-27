import { redirect } from "next/navigation";

export default function SuppliersPage() {
  // Backward-compatible alias for the supplier master.
  redirect("/vendors");
}

