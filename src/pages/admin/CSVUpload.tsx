import CSVUpload from "@/components/UploadCSV";
import AdminNavbar from "@/components/navbar/AdminNavbar";
import SelectionHeader from "@/components/admin/SelectionHeader";

const CSVUploadPage = () => {
  return (
    <main className="min-h-screen bg-background">
      <AdminNavbar />
      <div className="md:pl-72 lg:pl-80 xl:pl-72 2xl:pl-80 transition-all duration-300">
        <SelectionHeader />
        <div className="container py-6 space-y-6">
          <CSVUpload />
        </div>
      </div>
    </main>
  );
};

export default CSVUploadPage;
