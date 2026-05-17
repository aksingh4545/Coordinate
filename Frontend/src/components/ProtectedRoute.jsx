import { Navigate, useLocation } from "react-router-dom";
import { getAuthUser } from "../utils/authStorage";

export default function ProtectedRoute({ children }) {
  const location = useLocation();
  const authUser = getAuthUser();

  if (!authUser?.idToken) {
    return <Navigate to="/" replace state={{ from: location }} />;
  }

  return children;
}
