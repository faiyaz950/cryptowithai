import { Suspense } from "react";
import LandingPage from "@/components/mukul/LandingPage";

/** App home = Mukul Crypto Club landing (YouTube / UTM links yahin aate hain). */
export default function HomePage() {
  return (
    <Suspense fallback={<div className="mukul-club" />}>
      <LandingPage />
    </Suspense>
  );
}
