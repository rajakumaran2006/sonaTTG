import CSVUpload from "@/components/CSVUpload";
import AdminNavbar from "@/components/navbar/AdminNavbar";

const CSVUploadPage = () => {
  return (
    <main className="min-h-screen bg-background">
      <AdminNavbar />
      <div className="md:pl-72 lg:pl-80 xl:pl-72 2xl:pl-80 transition-all duration-300">
        <CSVUpload />
      </div>
    </main>
  );
};

export default CSVUploadPage;
