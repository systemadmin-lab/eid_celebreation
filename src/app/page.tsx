import ThreeScene from "@/components/ThreeScene";

export default function Home() {
  return (
    <main className="relative w-full h-screen overflow-hidden bg-black">
      <ThreeScene />

      {/* Text overlay */}
      <div className="eid-overlay">
        <div className="eid-content">
          {/* Arabic calligraphy header */}
          <h1 className="eid-arabic" dir="rtl" lang="ar">
            عيد مبارك
          </h1>

          {/* Decorative divider */}
          <div className="eid-divider">
            <span className="eid-divider-star">✦</span>
          </div>

          {/* English message */}
          <p className="eid-message">
            Wishing a high-uptime, zero-latency, and bug-free Eid Mubarak to all
            the techies out there! May your life&apos;s code be clean and your
            happiness be scalable.
          </p>

          {/* Bottom ornament */}
          <div className="eid-ornament">☪</div>
        </div>
      </div>
    </main>
  );
}
