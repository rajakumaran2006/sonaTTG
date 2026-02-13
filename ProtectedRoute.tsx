import { Navigate } from "react-router-dom";

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles: ("admin" | "super_admin")[];
}

const ProtectedRoute = ({ children, allowedRoles }: ProtectedRouteProps) => {
  const userStr = localStorage.getItem("user");

  if (!userStr) {
    return <Navigate to="/login" replace />;
  }

  try {
    const user = JSON.parse(userStr);

    if (!user.role || !allowedRoles.includes(user.role)) {
      return <Navigate to="/unauthorized" replace />;
    }

    return <>{children}</>;
  } catch {
    localStorage.removeItem("user");
    return <Navigate to="/login" replace />;
  }
};

export default ProtectedRoute;
