import type { Metadata } from "next";
import AdminDesk from "@/components/mukul/AdminDesk";

export const metadata: Metadata = {
  title: "Mukul Club Admin",
  description: "Acquisition, activation, retention, and offer tracking for Mukul Crypto Club.",
};

export default function AdminPage() {
  return <AdminDesk />;
}
