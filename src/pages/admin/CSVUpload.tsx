import CSVUpload from "@/components/CSVUpload";
import AdminNavbar from "@/components/navbar/AdminNavbar";

const CSVUploadPage = () => {
  return (
    <main className="min-h-screen bg-background">
      <AdminNavbar />
      <CSVUpload />
    </main>
  );
};

export default CSVUploadPage;
