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
      style={{ background: "var(--bg-primary)" }}
    >
      <div className="loading-logo-wrap mb-6">
        <Logo size={88} className="justify-center" />
      </div>

      <h1 className="text-xl font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
        Finowings AI
      </h1>
      <p className="text-sm text-center mb-8" style={{ color: "var(--text-muted)", maxWidth: "280px" }}>
        {message}
      </p>

      <div className="loading-bar-track">
        <div className="loading-bar-fill" />
      </div>

      <p className="text-xs mt-4" style={{ color: "var(--text-muted)" }}>
        Stocks · Crypto · Mutual Funds
      </p>
    </div>
  );
}
