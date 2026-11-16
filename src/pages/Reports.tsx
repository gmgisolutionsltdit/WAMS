import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ReportsSummary from "@/components/ReportsSummary";

const Reports = () => {
  const { role } = useAuth();
  const { t } = useLanguage();
  const isManagerOrAdmin = ["manager", "admin"].includes(role);

  if (!isManagerOrAdmin) {
    return <ReportsSummary />;
  }

  return (
    <Tabs defaultValue="attendance" className="space-y-4">
      <TabsList>
        <TabsTrigger value="attendance">{t("Attendance Log")}</TabsTrigger>
        <TabsTrigger value="summary">{t("Performance Summary")}</TabsTrigger>
      </TabsList>

      <TabsContent value="summary">
        <ReportsSummary />
      </TabsContent>

      <TabsContent value="attendance">
        <ReportsSummary />
      </TabsContent>
    </Tabs>
  );
};

export default Reports;
