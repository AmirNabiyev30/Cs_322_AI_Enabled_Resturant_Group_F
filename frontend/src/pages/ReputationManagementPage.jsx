import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/client";
import { getCurrentUser } from "../auth/user";

function ReputationManagementPage() {
  const [currentUser, setCurrentUser] = useState(null);
  const [pendingComplaints, setPendingComplaints] = useState([]);
  const [chefSummary, setChefSummary] = useState([]);
  const [complaintsAgainstMe, setComplaintsAgainstMe] = useState([]);
  const [disputeLoadingId, setDisputeLoadingId] = useState(null);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  // Helper: is this user staff/manager/admin?
  const isManager = ["staff", "manager", "admin"].includes(
    currentUser?.role || ""
  );

  // Load current user once
  useEffect(() => {
    const user = getCurrentUser();
    setCurrentUser(user);
  }, []);

  // After we know who the user is, load data
  useEffect(() => {
    if (!currentUser) return;

    // Everyone: complaints about themselves
    fetchComplaintsAgainstMe();

    // Manager/staff/admin: pending complaints + chef summary
    if (isManager) {
      fetchPendingComplaints();
      fetchChefSummary();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  // ---------- API helpers ----------

  async function fetchComplaintsAgainstMe() {
    try {
      const res = await api.get(`/reputation/about-me/${currentUser.id}`);
      setComplaintsAgainstMe(res.data || []);
    } catch (err) {
      console.error(err);
    }
  }

  async function handleDispute(feedbackId) {
    if (!currentUser) return;

    const reason = window.prompt(
      "Explain why you dispute this complaint (optional):"
    );
    if (reason === null) return; // user hit Cancel

    setDisputeLoadingId(feedbackId);
    setError("");
    setSuccess("");

    try {
      const res = await api.post("/reputation/dispute", {
        user_id: currentUser.id,
        feedback_id: feedbackId,
        reason,
      });

      setSuccess(res.data.message || "Dispute submitted.");
      await fetchComplaintsAgainstMe();
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.error || "Failed to dispute complaint.");
    } finally {
      setDisputeLoadingId(null);
    }
  }

  async function fetchPendingComplaints() {
    setError("");
    try {
      const res = await api.get("/reputation/pending-complaints");
      setPendingComplaints(res.data || []);
    } catch (err) {
      console.error(err);
      setError("Failed to load pending complaints.");
    }
  }

  async function fetchChefSummary() {
    setError("");
    try {
      const res = await api.get("/reputation/chef-summary");
      setChefSummary(res.data || []);
    } catch (err) {
      console.error(err);
      setError("Failed to load chef rating summary.");
    }
  }

  async function handleReview(feedbackId, decision) {
    if (!currentUser) return;

    setError("");
    setSuccess("");
    setLoading(true);

    try {
      await api.post("/reputation/review-complaint", {
        manager_user_id: currentUser.id,
        feedback_id: feedbackId,
        decision,
      });

      setSuccess(
        decision === "upheld"
          ? "Complaint upheld and HR rules applied."
          : "Complaint dismissed and warning applied if needed."
      );
      await fetchPendingComplaints();
      await fetchChefSummary();
    } catch (err) {
      console.error(err);
      if (err.response?.data?.error) {
        setError(err.response.data.error);
      } else {
        setError("Failed to review complaint.");
      }
    } finally {
      setLoading(false);
    }
  }

  // ---------- Render ----------

  if (!currentUser) {
    return (
      <div style={{ padding: "1.5rem" }}>
        <h2>Reputation & HR</h2>
        <p>You must be logged in.</p>
        <Link to="/login">Go to Login</Link>
      </div>
    );
  }

  return (
    <div style={{ padding: "1.5rem", maxWidth: "1000px" }}>
      <h2>Reputation & HR</h2>
      <p style={{ maxWidth: "650px" }}>
        View complaints about you, and (if you are staff/manager/admin) review
        pending complaints and chef performance according to HR rules.
      </p>

      {error && <p style={{ color: "red" }}>Error: {error}</p>}
      {success && <p style={{ color: "green" }}>{success}</p>}

      {/* ▶ SECTION 1 — Complaints Filed Against YOU (everyone can see) */}
      <section style={{ marginTop: "1.5rem" }}>
        <h3>Complaints Filed Against You</h3>
        {complaintsAgainstMe.length === 0 ? (
          <p>No complaints about you.</p>
        ) : (
          complaintsAgainstMe.map((c) => (
            <div
              key={c.id}
              style={{
                border: "1px solid #ccc",
                borderRadius: "8px",
                padding: "0.75rem 1rem",
                marginBottom: "0.75rem",
                backgroundColor: "#fff",
              }}
            >
              <p>
                <strong>Complaint #{c.id}</strong> — filed{" "}
                {new Date(c.created_at).toLocaleString()}
              </p>
              <p>
                <strong>From:</strong> {c.accuser_name || `User ${c.accuser_id}`}{" "}
                (ID: {c.accuser_id})
              </p>
              {c.order_id && (
                <p>
                  <strong>Order ID:</strong> {c.order_id}
                </p>
              )}
              {c.reason && (
                <p>
                  <strong>Reason:</strong> {c.reason}
                </p>
              )}
              <p>
                <strong>Status:</strong> {c.status}
              </p>

              {c.status === "pending" && (
                <button
                  onClick={() => handleDispute(c.id)}
                  disabled={disputeLoadingId === c.id}
                  style={{
                    padding: "0.3rem 0.8rem",
                    borderRadius: "999px",
                    border: "1px solid #fd7e14",
                    backgroundColor:
                      disputeLoadingId === c.id ? "#fff4e6" : "#ffe8cc",
                    color: "#d9480f",
                    cursor:
                      disputeLoadingId === c.id ? "wait" : "pointer",
                    fontSize: "0.85rem",
                    marginTop: "0.4rem",
                  }}
                >
                  {disputeLoadingId === c.id
                    ? "Submitting..."
                    : "Dispute Complaint"}
                </button>
              )}
            </div>
          ))
        )}
      </section>

      {/* ▶ SECTION 2 — Manager-only HR Controls */}
      {isManager && (
        <>
          {/* Pending Complaints for Manager */}
          <section style={{ marginTop: "2rem" }}>
            <h3>Pending Complaints (Manager View)</h3>
            {pendingComplaints.length === 0 ? (
              <p>No pending complaints.</p>
            ) : (
              pendingComplaints.map((c) => (
                <div
                  key={c.id}
                  style={{
                    border: "1px solid #ccc",
                    borderRadius: "8px",
                    padding: "0.75rem 1rem",
                    marginBottom: "0.75rem",
                    backgroundColor: "#fff",
                  }}
                >
                  <p>
                    <strong>Complaint #{c.id}</strong> &mdash; Filed on{" "}
                    {new Date(c.created_at).toLocaleString()}
                  </p>
                  <p>
                    <strong>Accuser:</strong>{" "}
                    {c.accuser_name || `User ${c.accuser_id}`} (ID:{" "}
                    {c.accuser_id})
                  </p>
                  <p>
                    <strong>Target User:</strong>{" "}
                    {c.target_user_name || `User ${c.target_user_id}`} (ID:{" "}
                    {c.target_user_id})
                  </p>
                  {c.order_id && (
                    <p>
                      <strong>Order ID:</strong> {c.order_id}
                    </p>
                  )}
                  {c.rating && (
                    <p>
                      <strong>Rating:</strong> {c.rating}/5
                    </p>
                  )}
                  {c.reason && (
                    <p>
                      <strong>Reason:</strong> {c.reason}
                    </p>
                  )}

                  <div
                    style={{
                      display: "flex",
                      gap: "0.5rem",
                      marginTop: "0.5rem",
                      flexWrap: "wrap",
                    }}
                  >
                    <button
                      onClick={() => handleReview(c.id, "upheld")}
                      disabled={loading}
                      style={{
                        padding: "0.4rem 0.8rem",
                        borderRadius: "6px",
                        border: "1px solid #198754",
                        backgroundColor: "#d1f7e3",
                        color: "#0f5132",
                        cursor: "pointer",
                      }}
                    >
                      Uphold
                    </button>
                    <button
                      onClick={() => handleReview(c.id, "dismissed")}
                      disabled={loading}
                      style={{
                        padding: "0.4rem 0.8rem",
                        borderRadius: "6px",
                        border: "1px solid #dc3545",
                        backgroundColor: "#f8d7da",
                        color: "#842029",
                        cursor: "pointer",
                      }}
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              ))
            )}
          </section>

          {/* Chef Summary */}
          <section style={{ marginTop: "2rem" }}>
            <h3>Chef Rating Summary</h3>
            {chefSummary.length === 0 ? (
              <p>No chefs found in the system.</p>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(auto-fill, minmax(260px, 1fr))",
                  gap: "0.75rem",
                }}
              >
                {chefSummary.map((chef) => (
                  <div
                    key={chef.chef_id}
                    style={{
                      border: "1px solid #ccc",
                      borderRadius: "8px",
                      padding: "0.75rem 1rem",
                      backgroundColor: "#fff",
                    }}
                  >
                    <p>
                      <strong>{chef.chef_name}</strong> (ID: {chef.chef_id})
                    </p>
                    <p>
                      <strong>Role:</strong> {chef.role}
                    </p>
                    <p>
                      <strong>Average Rating:</strong>{" "}
                      {chef.average_rating !== null
                        ? chef.average_rating.toFixed(2)
                        : "N/A"}
                    </p>
                    <p>
                      <strong>Total Compliments:</strong>{" "}
                      {chef.total_compliments}
                    </p>
                    <p>
                      <strong>Upheld Complaints:</strong>{" "}
                      {chef.upheld_complaints}
                    </p>
                    <p>
                      <strong>Warnings:</strong>{" "}
                      {chef.warnings !== null ? chef.warnings : 0}
                    </p>
                    <p>
                      <strong>Status:</strong>{" "}
                      {chef.is_active ? "Active" : "Inactive"}{" "}
                      {chef.is_blacklisted && "(Blacklisted)"}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

export default ReputationManagementPage;
