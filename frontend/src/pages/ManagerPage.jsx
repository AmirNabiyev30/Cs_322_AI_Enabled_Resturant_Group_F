import { useEffect, useState } from "react";
import { getCurrentUser } from "../auth/user";
import api from "../api/client";
import { Link } from "react-router-dom";

function ManagerPage() {
  const [currentUser, setCurrentUser] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [empEdits, setEmpEdits] = useState({});
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    const user = getCurrentUser();
    setCurrentUser(user);

    if (user) {
      fetchEmployees();
      fetchCustomers();
    }
  }, []);

  async function fetchEmployees() {
    setError("");
    try {
      const res = await api.get("/manager/employees");
      setEmployees(res.data.employees || []);
    } catch (err) {
      console.error(err);
      setError("Failed to load employees.");
    }
  }

  async function fetchCustomers() {
    setError("");
    try {
      const res = await api.get("/manager/customers");
      setCustomers(res.data.customers || []);
    } catch (err) {
      console.error(err);
      setError("Failed to load customers.");
    }
  }

  function onEmpFieldChange(id, field, value) {
    setEmpEdits((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] || {}),
        [field]: value,
      },
    }));
  }

  async function saveEmployee(id) {
    if (!currentUser) return;

    setError("");
    setSuccess("");

    const edit = empEdits[id] || {};
    const body = {
      manager_id: currentUser.id,
      user_id: id,
    };

    if (edit.role) body.role = edit.role;
    if (edit.pay_rate !== undefined) body.pay_rate = parseFloat(edit.pay_rate);
    if (edit.is_employed !== undefined) body.is_employed = edit.is_employed;

    try {
      const res = await api.post("/manager/update-employee", body);
      setSuccess(res.data.message || "Employee updated.");
      await fetchEmployees();
    } catch (err) {
      console.error(err);
      if (err.response?.data?.error) setError(err.response.data.error);
      else setError("Failed to update employee.");
    }
  }

  async function updateCustomerStatus(customerId, action) {
    if (!currentUser) return;

    setError("");
    setSuccess("");

    try {
      const res = await api.post("/manager/update-customer-status", {
        manager_id: currentUser.id,
        customer_id: customerId,
        action,
      });
      setSuccess(res.data.message || "Customer updated.");
      await fetchCustomers();
    } catch (err) {
      console.error(err);
      if (err.response?.data?.error) setError(err.response.data.error);
      else setError("Failed to update customer.");
    }
  }

  if (!currentUser) {
    return (
      <div style={{ padding: "1.5rem" }}>
        <h2>Manager Console</h2>
        <p>You must be logged in.</p>
        <Link to="/login">Go to Login</Link>
      </div>
    );
  }

  if (currentUser.role !== "manager" && currentUser.role !== "admin") {
    return (
      <div style={{ padding: "1.5rem" }}>
        <h2>Manager Console</h2>
        <p>You must be a manager (or admin) to view this page.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: "1.5rem" }}>
      <h2>Manager Console</h2>
      <p style={{ color: "#555" }}>
        Logged in as: <strong>{currentUser.name}</strong> ({currentUser.role})
      </p>

      {error && <p style={{ color: "red" }}>Error: {error}</p>}
      {success && <p style={{ color: "green" }}>{success}</p>}

      {/* EMPLOYEES */}
      <section style={{ marginBottom: "2rem" }}>
        <h3>Chefs & Delivery People</h3>
        {employees.length === 0 ? (
          <p>No employees yet.</p>
        ) : (
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              marginTop: "0.5rem",
              fontSize: "0.9rem",
            }}
          >
            <thead>
              <tr>
                <th style={{ borderBottom: "1px solid #ccc", textAlign: "left" }}>
                  Name
                </th>
                <th style={{ borderBottom: "1px solid #ccc" }}>Role</th>
                <th style={{ borderBottom: "1px solid #ccc" }}>Pay rate</th>
                <th style={{ borderBottom: "1px solid #ccc" }}>Employed?</th>
                <th style={{ borderBottom: "1px solid #ccc" }}>Active?</th>
                <th style={{ borderBottom: "1px solid #ccc" }}>Warnings</th>
                <th style={{ borderBottom: "1px solid #ccc" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((emp) => {
                const edit = empEdits[emp.id] || {};
                return (
                  <tr key={emp.id}>
                    <td style={{ padding: "0.25rem 0.4rem" }}>
                      {emp.name} <br />
                      <span style={{ fontSize: "0.8rem", color: "#666" }}>
                        {emp.email}
                      </span>
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <select
                        value={edit.role ?? emp.role}
                        onChange={(e) =>
                          onEmpFieldChange(emp.id, "role", e.target.value)
                        }
                      >
                        <option value="chef">chef</option>
                        <option value="junior_chef">junior_chef</option>
                        <option value="courier">courier</option>
                        <option value="delivery">delivery</option>
                      </select>
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <input
                        type="number"
                        step="0.5"
                        style={{ width: "5rem" }}
                        value={edit.pay_rate ?? emp.pay_rate}
                        onChange={(e) =>
                          onEmpFieldChange(emp.id, "pay_rate", e.target.value)
                        }
                      />
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <input
                        type="checkbox"
                        checked={edit.is_employed ?? emp.is_employed}
                        onChange={(e) =>
                          onEmpFieldChange(emp.id, "is_employed", e.target.checked)
                        }
                      />
                    </td>
                    <td style={{ textAlign: "center" }}>
                      {emp.is_active ? "Yes" : "No"}
                    </td>
                    <td style={{ textAlign: "center" }}>{emp.warnings}</td>
                    <td style={{ textAlign: "center" }}>
                      <button
                        onClick={() => saveEmployee(emp.id)}
                        style={{
                          padding: "0.25rem 0.6rem",
                          borderRadius: "999px",
                          border: "1px solid #0d6efd",
                          backgroundColor: "#e7f1ff",
                          color: "#0d6efd",
                          cursor: "pointer",
                        }}
                      >
                        Save
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {/* CUSTOMERS */}
      <section>
        <h3>Customers</h3>
        <p style={{ fontSize: "0.85rem", color: "#555" }}>
          Manager can process registrations by activating or deactivating
          accounts, and handle serious issues by blacklisting.
        </p>
        {customers.length === 0 ? (
          <p>No customers yet.</p>
        ) : (
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              marginTop: "0.5rem",
              fontSize: "0.9rem",
            }}
          >
            <thead>
              <tr>
                <th style={{ borderBottom: "1px solid #ccc", textAlign: "left" }}>
                  Name
                </th>
                <th style={{ borderBottom: "1px solid #ccc" }}>Active?</th>
                <th style={{ borderBottom: "1px solid #ccc" }}>Blacklisted?</th>
                <th style={{ borderBottom: "1px solid #ccc" }}>Warnings</th>
                <th style={{ borderBottom: "1px solid #ccc" }}>Orders</th>
                <th style={{ borderBottom: "1px solid #ccc" }}>Total spent</th>
                <th style={{ borderBottom: "1px solid #ccc" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id}>
                  <td style={{ padding: "0.25rem 0.4rem" }}>
                    {c.name}
                    <br />
                    <span style={{ fontSize: "0.8rem", color: "#666" }}>
                      {c.email}
                    </span>
                  </td>
                  <td style={{ textAlign: "center" }}>
                    {c.is_active ? "Yes" : "No"}
                  </td>
                  <td style={{ textAlign: "center" }}>
                    {c.is_blacklisted ? "Yes" : "No"}
                  </td>
                  <td style={{ textAlign: "center" }}>{c.warnings}</td>
                  <td style={{ textAlign: "center" }}>{c.order_count}</td>
                  <td style={{ textAlign: "center" }}>
                    ${Number(c.total_spent || 0).toFixed(2)}
                  </td>
                  <td style={{ textAlign: "center" }}>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.2rem",
                      }}
                    >
                      <button
                        onClick={() =>
                          updateCustomerStatus(c.id, "activate")
                        }
                        style={{
                          padding: "0.2rem 0.5rem",
                          borderRadius: "999px",
                          border: "1px solid #198754",
                          backgroundColor: "#d1e7dd",
                          color: "#0f5132",
                          cursor: "pointer",
                        }}
                      >
                        Activate
                      </button>
                      <button
                        onClick={() =>
                          updateCustomerStatus(c.id, "deactivate")
                        }
                        style={{
                          padding: "0.2rem 0.5rem",
                          borderRadius: "999px",
                          border: "1px solid #6c757d",
                          backgroundColor: "#f8f9fa",
                          color: "#495057",
                          cursor: "pointer",
                        }}
                      >
                        Deactivate
                      </button>
                      <button
                        onClick={() =>
                          updateCustomerStatus(c.id, "blacklist")
                        }
                        style={{
                          padding: "0.2rem 0.5rem",
                          borderRadius: "999px",
                          border: "1px solid #dc3545",
                          backgroundColor: "#f8d7da",
                          color: "#842029",
                          cursor: "pointer",
                        }}
                      >
                        Blacklist
                      </button>
                      <button
                        onClick={() =>
                          updateCustomerStatus(c.id, "unblacklist")
                        }
                        style={{
                          padding: "0.2rem 0.5rem",
                          borderRadius: "999px",
                          border: "1px solid #0d6efd",
                          backgroundColor: "#e7f1ff",
                          color: "#0d6efd",
                          cursor: "pointer",
                        }}
                      >
                        Unblacklist
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

export default ManagerPage;

