import { redirect } from "next/navigation";

/** App home = Crypto Trade desk. */
export default function HomePage() {
  redirect("/trade");
}
