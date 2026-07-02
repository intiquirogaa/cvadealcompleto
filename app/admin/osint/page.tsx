import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { OsintDashboard } from "./_components/osint-dashboard";

export default function OsintAdminPage() {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
      <Header />
      <OsintDashboard />
      <Footer />
    </div>
  );
}
