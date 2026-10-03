import { Suspense } from "react";
import LandingPage from "@/components/mukul/LandingPage";

/** App home = Cryptomantra landing (YouTube / UTM links yahin aate hain). */
export default function HomePage() {
  return (
    <Suspense fallback={<div className="mukul-club" />}>
      <LandingPage />
    </Suspense>
  );
}
