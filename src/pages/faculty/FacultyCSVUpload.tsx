import CSVUpload from "@/components/UploadCSV";
import Navbar from "@/components/navbar/facultyadmin";

const FacultyCSVUploadPage = () => {
  return (
    <main className="min-h-screen bg-background">
      <Navbar />
      <CSVUpload />
    </main>
  );
};

export default FacultyCSVUploadPage;
