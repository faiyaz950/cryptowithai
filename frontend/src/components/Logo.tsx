import Image from "next/image";

interface Props {
  size?: number;
  className?: string;
  showName?: boolean;
  subtitle?: string;
}

export default function Logo({
  size = 32,
  className = "",
  showName = false,
  subtitle,
}: Props) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <Image
        src="/finoailogo.png"
        alt="Finowings AI"
        width={size}
        height={size}
        className="rounded-md object-contain flex-shrink-0"
        priority={size >= 40}
      />
      {showName && (
        <div className="min-w-0">
          <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            Finowings AI
          </div>
          {subtitle && (
            <div className="text-xs" style={{ color: "var(--text-muted)" }}>
              {subtitle}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
