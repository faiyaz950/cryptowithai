import Logo from "@/components/Logo";

interface Props {
  message?: string;
}

export default function LoadingScreen({
  message = "Loading your financial intelligence...",
}: Props) {
  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center px-6"
      style={{ background: "#05080d" }}
    >
      <div className="loading-logo-wrap mb-6">
        <Logo size={88} className="justify-center" />
      </div>

      <h1 className="text-xl font-semibold mb-2" style={{ color: "#f1f5f9" }}>
        Mukul Crypto Club
      </h1>
      <p className="text-sm text-center mb-8" style={{ color: "#94a3b8", maxWidth: "280px" }}>
        {message}
      </p>

      <div className="loading-bar-track">
        <div className="loading-bar-fill" />
      </div>

      <p className="text-xs mt-4" style={{ color: "#e0ad3a" }}>
        Crypto simplified · Dr. Mukul Agrawal
      </p>
    </div>
  );
}
