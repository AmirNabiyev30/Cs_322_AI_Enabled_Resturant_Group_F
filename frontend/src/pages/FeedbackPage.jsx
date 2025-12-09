// src/pages/FeedbackPage.jsx
import { useState } from "react";
import { Link } from "react-router-dom";
import { getCurrentUser } from "../auth/user";
import api from "../api/client";

function FeedbackPage() {
  const currentUser = getCurrentUser();
  const [targetUserId, setTargetUserId] = useState("");
  const [orderId, setOrderId] = useState("");
  const [type, setType] = useState("complaint");
  const [rating, setRating] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  if (!currentUser) {
    return (
      <div style={{ padding: "1.5rem" }}>
        <h2>File Feedback</h2>
        <p>You must be logged in.</p>
        <Link to="/login">Go to Login</Link>
      </div>
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!targetUserId) {
      setError("Target user ID is required.");
      return;
    }

    try {
      await api.post("/reputation/file", {
        accuser_id: currentUser.id,
        target_user_id: Number(targetUserId),
        type,
        rating: rating ? Number(rating) : undefined,
        reason,
        order_id: orderId ? Number(orderId) : undefined,
      });

      setSuccess(`Your ${type} has been submitted.`);
      setReason("");
      setRating("");
      setOrderId("");
      // keep target_user_id so they can file multiple about same person
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.error || "Failed to submit feedback.");
    }
  }

  return (
    <div style={{ padding: "1.5rem", maxWidth: "600px" }}>
      <h2>File Complaint or Compliment</h2>
      <p style={{ maxWidth: "500px" }}>
        Use this form to file a complaint or compliment about a chef,
        delivery person, or another customer. The manager will review all
        complaints.
      </p>

      {error && <p style={{ color: "red" }}>Error: {error}</p>}
      {success && <p style={{ color: "green" }}>{success}</p>}

      <form onSubmit={handleSubmit} style={{ marginTop: "1rem" }}>
        <div style={{ marginBottom: "0.75rem" }}>
          <label>Target User ID:</label>
          <input
            type="number"
            value={targetUserId}
            onChange={(e) => setTargetUserId(e.target.value)}
            style={{ width: "100%", padding: "0.4rem" }}
            placeholder="User ID of chef/delivery/customer"
          />
        </div>

        <div style={{ marginBottom: "0.75rem" }}>
          <label>Order ID (optional):</label>
          <input
            type="number"
            value={orderId}
            onChange={(e) => setOrderId(e.target.value)}
            style={{ width: "100%", padding: "0.4rem" }}
            placeholder="Order related to this feedback"
          />
        </div>

        <div style={{ marginBottom: "0.75rem" }}>
          <label>Type:</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            style={{ width: "100%", padding: "0.4rem" }}
          >
            <option value="complaint">Complaint</option>
            <option value="compliment">Compliment</option>
          </select>
        </div>

        <div style={{ marginBottom: "0.75rem" }}>
          <label>Rating (1–5, optional but useful for compliments / chefs):</label>
          <input
            type="number"
            min="1"
            max="5"
            value={rating}
            onChange={(e) => setRating(e.target.value)}
            style={{ width: "100%", padding: "0.4rem" }}
          />
        </div>

        <div style={{ marginBottom: "0.75rem" }}>
          <label>Reason / Comment:</label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            style={{ width: "100%", padding: "0.4rem" }}
            placeholder="Describe your compliment or complaint..."
          />
        </div>

        <button
          type="submit"
          style={{
            padding: "0.5rem 1rem",
            borderRadius: "999px",
            border: "none",
            backgroundColor: "#0d6efd",
            color: "white",
            cursor: "pointer",
          }}
        >
          Submit {type}
        </button>
      </form>
    </div>
  );
}

export default FeedbackPage;
