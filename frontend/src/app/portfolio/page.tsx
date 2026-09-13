import { redirect } from "next/navigation";

/** Portfolio ab Trade desk ke andar hai. */
export default function PortfolioPage() {
  redirect("/trade?tab=portfolio");
}
