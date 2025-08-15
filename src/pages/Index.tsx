import { Button } from "@/components/ui/button";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4">
          <nav className="flex justify-between items-center">
            <h1 className="text-xl font-semibold text-foreground">App</h1>
            <Button variant="outline">Get Started</Button>
          </nav>
        </div>
      </header>
      
      <main className="container mx-auto px-4 py-16">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-4xl font-bold text-foreground mb-4">
            Welcome to Your React App
          </h2>
          <p className="text-lg text-muted-foreground mb-8">
            A clean, minimal structure ready for your next project.
          </p>
          <div className="flex gap-4 justify-center">
            <Button>Primary Action</Button>
            <Button variant="secondary">Secondary Action</Button>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Index;
