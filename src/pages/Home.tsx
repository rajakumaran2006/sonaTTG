import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Building2, School, ShieldCheck } from "lucide-react";

const RoleSelect = () => {
  const navigate = useNavigate();

  useEffect(() => {
    document.title = "Select Role - Timetable";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", "Choose Admin, Faculty, or Super Admin to manage and view timetables.");
  }, []);

  const roles = [
    {
      title: "Admin",
      description: "Manage timetable generation, subjects, and faculty",
      action: "Login",
      route: "/admin-login",
      icon: <Building2 className="w-8 h-8 text-primary" aria-hidden />,
      badge: "Department",
      variant: "default" as const,
      features: ["Create timetables", "Manage subjects", "Assign faculty", "Monitor schedules"]
    },
    {
      title: "Faculty",
      description: "View your schedule and assigned classes",
      action: "Log in",
      route: "/faculty",
      icon: <School className="w-8 h-8 text-primary" aria-hidden />,
      badge: "Teacher",
      variant: "outline" as const,
      features: ["View schedule", "Check assignments", "Track classes", "Update availability"]
    },
    {
      title: "Super Admin",
      description: "Full control over departments, years, and subjects",
      action: "Log in",
      route: "/super-admin-login",
      icon: <ShieldCheck className="w-8 h-8 text-primary" aria-hidden />,
      badge: "Master Control",
      variant: "secondary" as const,
      features: ["Manage departments", "Control users", "System settings", "Full access"]
    }
  ];

  return (
    <main className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-grid-black/[0.02] bg-grid-16"></div>
        <section className="container relative py-20">
          <div className="text-center space-y-6 mb-16">
            <Badge variant="secondary" className="px-4 py-2 text-sm font-medium">
              🎓 Timetable Management System
            </Badge>
            <h1 className="text-5xl md:text-6xl font-bold tracking-tight bg-gradient-to-r from-foreground to-muted-foreground bg-clip-text text-transparent">
              Choose your role
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Access the comprehensive timetable management platform designed for educational institutions.
            </p>
          </div>

          {/* Role Cards */}
          <div className="grid gap-8 md:grid-cols-3 max-w-6xl mx-auto">
            {roles.map((role, index) => (
              <Card 
                key={role.title}
                className="group relative overflow-hidden rounded-3xl border-0 bg-card/50 backdrop-blur-sm shadow-lg hover:shadow-2xl transition-all duration-500 hover:-translate-y-2 cursor-pointer"
                onClick={() => navigate(role.route)}
              >
                {/* Gradient Border */}
                <div className="absolute inset-0 rounded-3xl bg-gradient-to-r from-primary/20 via-transparent to-primary/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                
                {/* Card Content */}
                <div className="relative p-8">
                  {/* Icon and Badge */}
                  <div className="flex items-center justify-between mb-6">
                    <div className="text-4xl transform group-hover:scale-110 transition-transform duration-300">
                      {role.icon}
                    </div>
                    <Badge variant="secondary" className="text-xs px-3 py-1 bg-muted/50">
                      {role.badge}
                    </Badge>
                  </div>

                  {/* Title */}
                  <CardHeader className="p-0 mb-4">
                    <CardTitle className="text-2xl font-bold group-hover:text-primary transition-colors duration-300">
                      {role.title}
                    </CardTitle>
                  </CardHeader>

                  {/* Description */}
                  <p className="text-muted-foreground text-base mb-6 leading-relaxed">
                    {role.description}
                  </p>

                  {/* Features */}
                  <div className="space-y-2 mb-8">
                    {role.features.map((feature, idx) => (
                      <div key={idx} className="flex items-center text-sm text-muted-foreground">
                        <div className="w-1.5 h-1.5 rounded-full bg-primary/60 mr-3"></div>
                        {feature}
                      </div>
                    ))}
                  </div>

                  {/* Action Button */}
                  <Button 
                    variant={role.variant}
                    size="lg"
                    className="w-full group-hover:shadow-lg transition-all duration-300 font-semibold py-6"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(role.route);
                    }}
                  >
                    {role.action}
                    <span className="ml-2 transform group-hover:translate-x-1 transition-transform duration-300">
                      →
                    </span>
                  </Button>
                </div>

                {/* Decorative Elements */}
                <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-primary/10 to-transparent rounded-full -translate-y-16 translate-x-16 group-hover:scale-150 transition-transform duration-700"></div>
              </Card>
            ))}
          </div>

          {/* Bottom Section */}
          <div className="text-center mt-20">
            <div className="inline-flex items-center space-x-2 text-sm text-muted-foreground bg-muted/30 rounded-full px-6 py-3">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
              <span>System is online and ready</span>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
};

export default RoleSelect;
