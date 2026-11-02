
import React, {
    createContext,
    useContext,
    useEffect,
    useState,
  } from "react";

  import api from "../services/api";

  const AuthContext = createContext(null);

  export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
      const initializeAuth = async () => {
        const token = localStorage.getItem("token");

        if (!token) {
          setLoading(false);
          return;
        }

        try {
          const response = await api.get("/auth/me");
          setUser(response.data.user);
        } catch (error) {
          localStorage.removeItem("token");
          setUser(null);
        } finally {
          setLoading(false);
        }
      };

      initializeAuth();
    }, []);

    const login = async (email, password) => {
      setLoading(true);

      try {
        const response = await api.post("/auth/login", {
          email,
          password,
        });

        if (!response.data.success || !response.data.token) {
          throw new Error(response.data.message || "Login failed");
        }

        localStorage.setItem("token", response.data.token);

        const userResponse = await api.get("/auth/me");
        setUser(userResponse.data.user);

        return userResponse.data.user;
      } catch (error) {
        localStorage.removeItem("token");
        setUser(null);

        throw new Error(
          error.response?.data?.message ||
          error.message ||
          "Unable to login"
        );
      } finally {
        setLoading(false);
      }
    };

    const logout = () => {
      localStorage.removeItem("token");
      setUser(null);
    };

    return (
      <AuthContext.Provider
        value={{
          user,
          setUser,
          login,
          logout,
          loading,
          isAuthenticated: Boolean(user),
        }}
      >
        {children}
      </AuthContext.Provider>
    );
  }

  export function useAuth() {
    const context = useContext(AuthContext);

    if (!context) {
      throw new Error("useAuth must be used inside AuthProvider");
    }

    return context;
  }

