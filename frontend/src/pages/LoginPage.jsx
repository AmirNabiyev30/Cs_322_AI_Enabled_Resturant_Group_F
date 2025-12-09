import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import api from "../api/client";
import { setCurrentUser } from "../auth/user";

function LoginPage({ onLogin }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
  
    try {
      const res = await api.post("/auth/login", {
        email,
        password,
      });
  
      const user = res.data.user;  // 👈 this now exists
  
      setCurrentUser(user);
  
      if (onLogin) {
        onLogin(user);
      }
  
      alert(`Logged in as ${user.name} (${user.role})`);
      navigate("/");
    } catch (err) {
      console.error(err);
      if (err.response && err.response.data && err.response.data.error) {
        setError(err.response.data.error);
      } else {
        setError("Login failed. Please try again.");
      }
    }
  }
  

  return (
    <div style={{ padding: "1.5rem" }}>
      <h2>Login</h2>
      <form onSubmit={handleSubmit} style={{ maxWidth: "320px" }}>
        <div style={{ marginBottom: "0.75rem" }}>
          <label>Email:</label>
          <br />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{ width: "100%" }}
          />
        </div>

        <div style={{ marginBottom: "0.75rem" }}>
          <label>Password:</label>
          <br />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{ width: "100%" }}
          />
        </div>

        {error && (
          <p style={{ color: "red", marginBottom: "0.75rem" }}>{error}</p>
        )}

        <button type="submit">Login</button>
      </form>

      <p style={{ marginTop: "1rem" }}>
        Don't have an account? <Link to="/register">Register here</Link>.
      </p>
    </div>
  );
}

export default LoginPage;
