import { useState, useEffect } from "react";
import { getCurrentUser } from "../auth/user";
import api from "../api/client";
import { Link } from "react-router-dom";

function DeliveryJobsPage() {
  const [currentUser, setCurrentUser] = useState(null);
  const [openJobs, setOpenJobs] = useState([]);
  const [myJobs, setMyJobs] = useState([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [acceptLoading, setAcceptLoading] = useState({});
  const [statusLoading, setStatusLoading] = useState({});

  useEffect(() => {
    const user = getCurrentUser();
    setCurrentUser(user);

    fetchOpenJobs();
    if (user) {
      fetchMyJobs(user.id);
    }
  }, []);

  async function fetchOpenJobs() {
    setError("");
    try {
      const res = await api.get("/delivery/open-jobs");
      setOpenJobs(res.data || []);
    } catch (err) {
      console.error(err);
      setError("Failed to load open delivery jobs.");
    }
  }

  async function fetchMyJobs(userId) {
    setError("");
    try {
      const res = await api.get(`/delivery/my-jobs/${userId}`);
      setMyJobs(res.data || []);
    } catch (err) {
      console.error(err);
      setError("Failed to load your assigned jobs.");
    }
  }

  async function handleAccept(job) {
    setError("");
    setSuccess("");

    if (!currentUser) {
      setError("You must be logged in.");
      return;
    }

    if (currentUser.role !== "courier" && currentUser.role !== "delivery") {
      setError("Only couriers can accept jobs.");
      return;
    }

    setAcceptLoading((prev) => ({ ...prev, [job.id]: true }));

    try {
      await api.post("/delivery/accept-job", {
        user_id: currentUser.id,
        delivery_job_id: job.id,
        fee: job.suggested_fee,
        eta_minutes: job.estimated_minutes,
      });

      setSuccess(`You accepted job #${job.id}.`);
      await fetchOpenJobs();
      await fetchMyJobs(currentUser.id);
    } catch (err) {
      console.error(err);
      if (err.response?.data?.error) setError(err.response.data.error);
      else setError("Failed to accept job.");
    } finally {
      setAcceptLoading((prev) => ({ ...prev, [job.id]: false }));
    }
  }

  function handleSkip(jobId) {
    // Just hide this job from the list (refuse for this courier)
    setOpenJobs((prev) => prev.filter((j) => j.id !== jobId));
  }

  async function handleUpdateStatus(jobId, newStatus) {
    if (!currentUser) return;

    setError("");
    setSuccess("");
    setStatusLoading((prev) => ({ ...prev, [jobId]: true }));

    try {
      await api.post("/delivery/update-status", {
        user_id: currentUser.id,
        delivery_job_id: jobId,
        status: newStatus,
      });

      setSuccess(`Job #${jobId} marked as ${newStatus}.`);
      await fetchMyJobs(currentUser.id);
    } catch (err) {
      console.error(err);
      if (err.response?.data?.error) setError(err.response.data.error);
      else setError("Failed to update delivery status.");
    } finally {
      setStatusLoading((prev) => ({ ...prev, [jobId]: false }));
    }
  }

  if (!currentUser) {
    return (
      <div style={{ padding: "1.5rem" }}>
        <h2>Delivery Jobs</h2>
        <p>You must be logged in.</p>
        <Link to="/login">Go to Login</Link>
      </div>
    );
  }

  if (currentUser.role !== "courier" && currentUser.role !== "delivery") {
    return (
      <div style={{ padding: "1.5rem" }}>
        <h2>Delivery Jobs</h2>
        <p>You must be a courier to view this page.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: "1.5rem" }}>
      <h2>Delivery Jobs</h2>
      <p style={{ color: "#555" }}>
        Logged in as courier: <strong>{currentUser.name}</strong>
      </p>

      {error && <p style={{ color: "red" }}>{error}</p>}
      {success && <p style={{ color: "green" }}>{success}</p>}

      {/* OPEN JOBS SECTION */}
      <section style={{ marginBottom: "2rem" }}>
        <h3>Open Jobs</h3>
        {openJobs.length === 0 ? (
          <p>No open jobs.</p>
        ) : (
          openJobs.map((job) => (
            <div
              key={job.id}
              style={{
                border: "1px solid #ccc",
                padding: "1rem",
                borderRadius: "8px",
                marginBottom: "1rem",
                backgroundColor: "#fff",
              }}
            >
              <h4>Job #{job.id}</h4>
              <p>
                <strong>Address:</strong> {job.delivery_address}
              </p>
              {job.delivery_notes && (
                <p>
                  <strong>Notes:</strong> {job.delivery_notes}
                </p>
              )}
              <p>
                <strong>Estimated time:</strong> ~{job.estimated_minutes} minutes
              </p>
              <p>
                <strong>Delivery fee:</strong> ${job.suggested_fee.toFixed(2)}
              </p>

              <div
                style={{
                  marginTop: "0.75rem",
                  display: "flex",
                  gap: "0.5rem",
                }}
              >
                <button
                  onClick={() => handleAccept(job)}
                  disabled={!!acceptLoading[job.id]}
                  style={{
                    padding: "0.4rem 0.9rem",
                    borderRadius: "999px",
                    border: "1px solid #20c997",
                    backgroundColor: "#e6fcf5",
                    color: "#087f5b",
                    cursor: acceptLoading[job.id] ? "not-allowed" : "pointer",
                  }}
                >
                  {acceptLoading[job.id] ? "Accepting..." : "Accept job"}
                </button>

                <button
                  onClick={() => handleSkip(job.id)}
                  style={{
                    padding: "0.4rem 0.9rem",
                    borderRadius: "999px",
                    border: "1px solid #ced4da",
                    backgroundColor: "#f8f9fa",
                    color: "#495057",
                    cursor: "pointer",
                  }}
                >
                  Skip / Refuse
                </button>
              </div>
            </div>
          ))
        )}
      </section>

      {/* MY JOBS SECTION */}
      <section>
        <h3>My Accepted Jobs</h3>
        {myJobs.length === 0 ? (
          <p>You have no assigned jobs yet.</p>
        ) : (
          myJobs.map((job) => {
            const isDone = job.status === "delivered" || job.status === "cancelled";
            const loading = !!statusLoading[job.id];

            return (
              <div
                key={job.id}
                style={{
                  border: "1px solid #bbb",
                  padding: "1rem",
                  borderRadius: "8px",
                  marginBottom: "1rem",
                  backgroundColor: "#f8f9fa",
                }}
              >
                <h4>
                  Job #{job.id} —{" "}
                  <span style={{ textTransform: "capitalize" }}>
                    {job.status}
                  </span>
                </h4>
                <p>
                  <strong>Address:</strong> {job.delivery_address}
                </p>
                {job.delivery_notes && (
                  <p>
                    <strong>Notes:</strong> {job.delivery_notes}
                  </p>
                )}
                <p>
                  <strong>Delivery fee:</strong>{" "}
                  {job.agreed_fee != null
                    ? `$${job.agreed_fee.toFixed(2)}`
                    : job.suggested_fee
                    ? `$${job.suggested_fee.toFixed(2)} (suggested)`
                    : "N/A"}
                </p>

                {!isDone && (
                  <div
                    style={{
                      marginTop: "0.75rem",
                      display: "flex",
                      gap: "0.5rem",
                      flexWrap: "wrap",
                    }}
                  >
                    {job.status === "assigned" && (
                      <button
                        onClick={() =>
                          handleUpdateStatus(job.id, "picked_up")
                        }
                        disabled={loading}
                        style={{
                          padding: "0.35rem 0.9rem",
                          borderRadius: "999px",
                          border: "1px solid #0d6efd",
                          backgroundColor: "#e7f1ff",
                          color: "#0d6efd",
                          cursor: loading ? "not-allowed" : "pointer",
                        }}
                      >
                        {loading ? "Updating..." : "Mark as picked up"}
                      </button>
                    )}

                    {job.status === "picked_up" && (
                      <button
                        onClick={() =>
                          handleUpdateStatus(job.id, "delivered")
                        }
                        disabled={loading}
                        style={{
                          padding: "0.35rem 0.9rem",
                          borderRadius: "999px",
                          border: "1px solid #198754",
                          backgroundColor: "#d1e7dd",
                          color: "#0f5132",
                          cursor: loading ? "not-allowed" : "pointer",
                        }}
                      >
                        {loading ? "Updating..." : "Mark as delivered"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}

export default DeliveryJobsPage;
